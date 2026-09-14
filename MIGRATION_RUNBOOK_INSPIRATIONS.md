# Runbook de Migração — Arquitetura da Feature Inspirações

Este documento especifica o procedimento operacional padrão para provisionar o banco de dados Supabase e aplicar as tabelas, índices e políticas de RLS necessárias para a feature **Inspirações**.

---

## 📋 Pré-requisitos
- Acesso ao projeto Supabase (`https://mfcajxrvylkwijdpknbx.supabase.co`).
- CLI do Supabase instalado localmente ou acesso ao Dashboard do Supabase (SQL Editor).
- Credenciais administrativas de Supabase (Chave `service_role` ou conta do proprietário).

---

## 🛠️ Passo 1: Aplicação da Migration SQL

1. Acesse o **SQL Editor** do Supabase Dashboard ou utilize o CLI:
   ```bash
   npx supabase db push --linked
   ```
2. Caso opte por executar via Dashboard, cole o conteúdo do arquivo [`supabase/migrations/20260828_inspirations_schema.sql`](file:///Users/iancapo/antigravity/gpt%20do%20viajante/supabase/migrations/20260828_inspirations_schema.sql).
3. Clique em **Run** e verifique a mensagem de sucesso: `Success. No rows returned.`

---

## 🔍 Passo 2: Verificação Pós-Migração (Post-checks)

Execute a query de verificação abaixo no SQL Editor:

```sql
SELECT table_name, rowsecurity 
FROM information_schema.tables 
JOIN pg_tables ON information_schema.tables.table_name = pg_tables.tablename
WHERE table_schema = 'public' 
  AND table_name LIKE 'inspiration%';
```

### Resultado Esperado:
- `inspirations`: `rowsecurity = true`
- `inspiration_days`: `rowsecurity = true`
- `inspiration_activities`: `rowsecurity = true`
- `inspiration_sources`: `rowsecurity = true`
- `inspiration_source_insights`: `rowsecurity = true`
- `inspiration_collections`: `rowsecurity = true`
- `inspiration_collection_items`: `rowsecurity = true`

---

## 🧪 Passo 3: Seed do Roteiro Piloto (Roma em 5 Dias)

Para popular o banco com o único roteiro piloto publicado nesta fase:

```sql
INSERT INTO public.inspirations (
  id, slug, title, destination_city, destination_region, country, country_code, duration_days,
  short_description, long_description, traveler_profiles, travel_styles, pace, budget_level,
  estimated_budget_min, estimated_budget_max, currency, best_for, hero_image_url, thumbnail_url,
  status, quality_score, editorial_score, operational_score, flexibility_score, completeness_score,
  freshness_score, planning_rationale, why_this_works, featured, copilot_pick, language, version
) VALUES (
  'insp_roma_5d_classico',
  'roma-5-dias-primeira-viagem',
  'Roma Clássica em 5 Dias',
  'Roma',
  'Lazio',
  'Itália',
  'IT',
  5,
  'Os clássicos com logística otimizada para evitar deslocamentos desnecessários.',
  'Primeiro roteiro inteligente para Roma focando em concentração geográfica, janelas de reserva prioritárias para Coliseu e Vaticano e caminhadas ritmadas.',
  '["first_trip", "culture", "food", "couple"]'::jsonb,
  '["balanced", "historical"]'::jsonb,
  'balanced',
  'moderate',
  120,
  220,
  'EUR',
  '["É sua primeira vez em Roma e você quer ver os clássicos sem correria", "Gosta de alternar passeios históricos com trattorias tradicionais"]'::jsonb,
  'https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=600&q=80',
  'published',
  92, 25, 38, 14, 10, 8,
  'Atrações com horário rígido fixadas em manhãs separadas.',
  'Garante acesso às principais atrações sem sobrecarregar a programação diária.',
  TRUE, TRUE, 'pt-BR', '1.0'
) ON CONFLICT (id) DO UPDATE SET status = 'published';
```

---

## 🔒 Passo 4: Auditoria de Segurança RLS
Verifique se a leitura desautenticada bloqueia dados em `draft`/`review`:

```sql
-- Teste de Leitura Pública
SET ROLE anon;
SELECT count(*) FROM public.inspirations WHERE status = 'draft'; -- Deve retornar 0
```
