-- =============================================================================
-- POST-CHECK SQL VERIFICATION SCRIPT FOR SUPABASE SQL EDITOR
-- Executar estas consultas após rodar a migration para confirmar que tudo foi criado.
-- =============================================================================

-- 1. Verificar se todas as 7 tabelas foram criadas no schema public
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name LIKE 'inspiration%'
ORDER BY table_name;

-- 2. Verificar se o RLS está habilitado em todas as tabelas de Inspirações
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename LIKE 'inspiration%';

-- 3. Verificar as Políticas de Segurança (Policies) ativas
SELECT tablename, policyname, cmd 
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename LIKE 'inspiration%';

-- 4. Verificar Índices Criados
SELECT indexname, tablename 
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND indexname LIKE 'idx_%inspiration%';
