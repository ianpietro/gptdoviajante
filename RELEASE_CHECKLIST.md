# RELEASE_CHECKLIST.md — CoPiloto de Viagem

Checklist objetivo para cada deploy comercial.
Marque cada item antes de promover para produção.

---

## PRÉ-DEPLOY

### Código
- [ ] `APP_VERSION` em `config.js` atualizado (semver: `MAJOR.MINOR.PATCH[-tag]`)
- [ ] `CACHE_VERSION` em `sw.js` atualizado e coerente com `APP_VERSION`
- [ ] `sitemap.xml` com `<lastmod>` atualizado
- [ ] `BYPASS_LOGIN` é hostname-based (nunca hardcoded `true`)
- [ ] Todas as feature flags corretas para o ambiente alvo
- [ ] Sem `console.log` com dados sensíveis (email, token, payload de pagamento)
- [ ] `node tests/test_state.js` passa sem erros

### Segurança
- [ ] `dummy-token-unconfigured` ausente em `api/chat.js` e `api/verify.js`
- [ ] `WEBHOOK_SECRET` configurado no painel Vercel
- [ ] `ALLOWED_ORIGIN` configurado (ou mantido `*` conscientemente)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` nunca exposto no frontend
- [ ] `GEMINI_API_KEY` e `OPENAI_API_KEY` configurados como env vars Vercel
- [ ] Nenhuma chave de API hardcoded em código

### Banco de Dados (Supabase)
- [ ] RLS ativado nas tabelas: `trips`, `documents`, `expenses`, `authorized_emails`
- [ ] Usuário A não consegue ler dados do usuário B (testar manualmente)
- [ ] `webhook_events` table existe (para idempotência)
- [ ] Backup recente disponível

### Auth
- [ ] Login com Google OAuth funciona no domínio de produção
- [ ] Login com email/password funciona
- [ ] Logout limpa sessão corretamente
- [ ] Token expirado redireciona para login (não trava)

---

## DEPLOY

- [ ] `git add . && git commit -m "release: vX.Y.Z"` com mensagem descritiva
- [ ] Push para branch conectada ao Vercel (`main` / `prod`)
- [ ] Deploy disparado automaticamente (ou `vercel --prod` manual)
- [ ] URL de preview do deploy gerada pelo Vercel

---

## PÓS-DEPLOY (Smoke Tests)

### Landing Page
- [ ] `https://copilotodeviagem.com.br/` carrega em < 3s no celular
- [ ] CTA principal visível e funcional
- [ ] Open Graph preview correto (testar em https://metatags.io)

### App
- [ ] `https://copilotodeviagem.com.br/app.html` redireciona para login (BYPASS_LOGIN = false)
- [ ] Login com Google completa e abre app
- [ ] Criar nova viagem funciona
- [ ] Chat com CoPiloto responde (endpoint `/api/chat` acessível)
- [ ] Import de documento funciona (endpoint `/api/parse-document` acessível)

### Segurança Pós-Deploy
- [ ] `https://copilotodeviagem.com.br/api/chat` sem token → retorna 401
- [ ] `https://copilotodeviagem.com.br/api/verify` sem token → retorna 401
- [ ] `https://copilotodeviagem.com.br/api/webhook-pagamento` sem secret → retorna 401

### PWA
- [ ] Service worker atualiza corretamente (sem clients presos em versão anterior)
- [ ] App funciona offline (dados locais disponíveis)

---

## ROLLBACK

Se houver problema crítico:
1. Abrir painel Vercel → Deployments
2. Selecionar deployment anterior estável
3. Clicar em "Promote to Production"
4. Verificar que clientes recebem nova versão (SW force-reload)
5. Criar issue no repositório com descrição do problema

---

## PÓS-LANÇAMENTO (Monitoramento 48h)

- [ ] Verificar logs Vercel (Functions → Logs) por erros 500
- [ ] Verificar taxa de erro no endpoint `/api/chat`
- [ ] Verificar se webhooks de pagamento estão sendo processados
- [ ] Verificar métricas Core Web Vitals (Search Console ou PageSpeed)
- [ ] Confirmar que novos usuários conseguem criar conta e primeira viagem
