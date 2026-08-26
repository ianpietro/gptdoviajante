-- Migration: 001_create_ai_usage.sql
-- Descrição: Cria a tabela para controle persistente de limite de uso da IA (backend-enforced) e a função RPC de incremento atômico.

CREATE TABLE IF NOT EXISTS public.ai_usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  messages_used INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (user_id, trip_id)
);

-- Habilitar RLS na tabela ai_usage
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
CREATE POLICY "Allow read of own usage" ON public.ai_usage
  FOR SELECT USING (auth.uid() = user_id);

-- Função de incremento atômico (executada no backend com service_role)
CREATE OR REPLACE FUNCTION increment_ai_usage(p_user_id UUID, p_trip_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO public.ai_usage (user_id, trip_id, messages_used, updated_at)
  VALUES (p_user_id, p_trip_id, 1, now())
  ON CONFLICT (user_id, trip_id)
  DO UPDATE SET messages_used = public.ai_usage.messages_used + 1, updated_at = now()
  RETURNING messages_used INTO v_count;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
