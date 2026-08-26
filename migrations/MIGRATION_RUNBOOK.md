# Runbook de Migração SQL — Supabase

Este guia descreve como aplicar as migrações SQL necessárias no Supabase para ativar:
1. Rate limiting distribuído baseado no banco de dados.
2. Reserva atômica de cota de IA (contra race conditions) com rollback.
3. Políticas RLS estritas de Trips e Documents (bloqueio de leitura pública anônima).
4. Datas canônicas e preferências privadas do CoPiloto Proativo.

As migrações devem ser executadas em ordem (`001` → `002` → `003` → `004`).
Para o Prompt 11, execute o arquivo `004_proactive_trip_dates.sql` completo depois das três anteriores. Ele é idempotente, preserva os dados existentes e cria:

- `trips.start_date`, `trips.end_date` e `trips.timezone`;
- a validação do ciclo de vida da viagem;
- `proactive_insight_preferences`, protegida por RLS, para sincronizar apenas dispensas e lembretes do dono da viagem.

---

## Passo a Passo no Console do Supabase

1. Acesse o [Dashboard do Supabase](https://supabase.com/dashboard).
2. Selecione o seu projeto **CoPiloto de Viagem**.
3. No menu lateral esquerdo, clique em **SQL Editor**.
4. Clique em **New Query**.
5. Copie e cole todo o conteúdo SQL abaixo no editor.
6. Clique no botão **Run** no canto inferior direito para aplicar.

---

## Script SQL Completo

```sql
-- 1. Tabela de Rate Limiting distribuído por IP
CREATE TABLE IF NOT EXISTS public.rate_limits (
  ip TEXT PRIMARY KEY,
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  req_count INTEGER DEFAULT 1 NOT NULL
);

-- Habilitar RLS na tabela rate_limits por segurança
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- 2. RPC para controle de rate limit no PostgreSQL (seguro e distribuído)
CREATE OR REPLACE FUNCTION check_rate_limit(p_ip TEXT, p_max_req INTEGER, p_window_seconds INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  v_limit_reached BOOLEAN := FALSE;
  v_count INTEGER;
  v_last_seen TIMESTAMP WITH TIME ZONE;
BEGIN
  SELECT req_count, last_seen INTO v_count, v_last_seen
  FROM public.rate_limits
  WHERE ip = p_ip;

  IF NOT FOUND THEN
    INSERT INTO public.rate_limits (ip, last_seen, req_count)
    VALUES (p_ip, now(), 1);
    RETURN FALSE;
  END IF;

  IF v_last_seen < now() - (p_window_seconds * interval '1 second') THEN
    -- Janela expirou, reseta contagem
    UPDATE public.rate_limits
    SET req_count = 1, last_seen = now()
    WHERE ip = p_ip;
    RETURN FALSE;
  ELSE
    IF v_count >= p_max_req THEN
      RETURN TRUE; -- Bloqueado
    ELSE
      UPDATE public.rate_limits
      SET req_count = req_count + 1, last_seen = now()
      WHERE ip = p_ip;
      RETURN FALSE; -- Permitido
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RPC para reserva de cota de IA de forma atômica (previne race condition)
CREATE OR REPLACE FUNCTION reserve_ai_usage(p_user_id UUID, p_trip_id UUID, p_limit INTEGER)
RETURNS TABLE(allowed BOOLEAN, messages_used INTEGER, max_limit INTEGER) AS $$
DECLARE
  v_used INTEGER;
BEGIN
  -- Garante que o registro existe
  INSERT INTO public.ai_usage (user_id, trip_id, messages_used, updated_at)
  VALUES (p_user_id, p_trip_id, 0, now())
  ON CONFLICT (user_id, trip_id) DO NOTHING;

  -- Lock de linha para evitar concorrência (race condition)
  SELECT ai_usage.messages_used INTO v_used
  FROM public.ai_usage
  WHERE user_id = p_user_id AND trip_id = p_trip_id
  FOR UPDATE;

  IF v_used >= p_limit THEN
    RETURN QUERY SELECT FALSE, v_used, p_limit;
  ELSE
    UPDATE public.ai_usage
    SET messages_used = messages_used + 1, updated_at = now()
    WHERE user_id = p_user_id AND trip_id = p_trip_id
    RETURNING ai_usage.messages_used INTO v_used;

    RETURN QUERY SELECT TRUE, v_used, p_limit;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RPC para estorno de cota de IA (caso a chamada de IA falhe)
CREATE OR REPLACE FUNCTION refund_ai_usage(p_user_id UUID, p_trip_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_used INTEGER;
BEGIN
  -- Decrementa de forma atômica se for maior que zero
  UPDATE public.ai_usage
  SET messages_used = GREATEST(0, messages_used - 1), updated_at = now()
  WHERE user_id = p_user_id AND trip_id = p_trip_id
  RETURNING messages_used INTO v_used;
  
  RETURN v_used;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Aperfeiçoamento da RLS da tabela Trips (Remove SELECT irrestrito para anônimos)
DROP POLICY IF EXISTS "Allow public read of shared trips" ON public.trips;

-- Nova política: Dono ou Colaborador logado (cujo e-mail está na lista de members)
CREATE POLICY "Allow read for owners and collaborators" ON public.trips
  FOR SELECT USING (
    auth.uid() = user_id 
    OR (
      auth.role() = 'authenticated' 
      AND EXISTS (
        SELECT 1 
        FROM jsonb_array_elements_text(trips.members) AS m 
        WHERE LOWER(m) = LOWER(auth.jwt() ->> 'email')
      )
    )
  );

-- 6. Aperfeiçoamento da RLS da tabela Documents (Remove SELECT irrestrito para anônimos)
DROP POLICY IF EXISTS "Allow public read of trip documents" ON public.documents;

CREATE POLICY "Allow read for owners and collaborators" ON public.documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.trips
      WHERE trips.id = documents.trip_id
      AND (
        trips.user_id = auth.uid()
        OR (
          auth.role() = 'authenticated'
          AND EXISTS (
            SELECT 1 
            FROM jsonb_array_elements_text(trips.members) AS m 
            WHERE LOWER(m) = LOWER(auth.jwt() ->> 'email')
          )
        )
      )
    )
  );
```

---

## Verificação e Auditoria

Você pode checar se a migração foi bem-sucedida rodando o SQL de auditoria:
```sql
SELECT EXISTS (
   SELECT FROM pg_tables
   WHERE schemaname = 'public' AND tablename  = 'rate_limits'
);
```
Deve retornar `true`.
