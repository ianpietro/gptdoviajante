# SECURITY_AUDIT.md — CoPiloto de Viagem
**Versão**: 2.0.0-rc1 | **Data**: 2026-08-22

Auditoria completa de segurança para o Release Candidate.

---

## Legenda
- ✅ Resolvido / OK
- ⚠️ Atenção / Risco baixo
- ❌ Blocker / Risco alto
- 🔲 Pendente (requer ação externa ao código)

---

## 1. Autenticação e BYPASS_LOGIN

| Vetor | Status | Detalhe |
|-------|--------|---------|
| `BYPASS_LOGIN` em produção | ✅ | Agora hostname-based — false automaticamente no Vercel |
| `BYPASS_LOGIN` em desenvolvimento | ✅ | `true` apenas em `localhost` / `127.0.0.1` |
| `dummy-token-unconfigured` em `chat.js` | ✅ | Removido neste RC |
| `dummy-token-unconfigured` em `verify.js` | ✅ | Removido neste RC |
| Token JWT validado no backend | ✅ | Supabase Auth API verifica cada request |
| Sessão expirada tratada | ✅ | Backend retorna 401; frontend redireciona para login |

---

## 2. API Keys e Secrets

| Vetor | Status | Detalhe |
|-------|--------|---------|
| `GEMINI_API_KEY` hardcoded | ✅ | Apenas como env var Vercel |
| `SUPABASE_SERVICE_ROLE_KEY` no frontend | ✅ | Apenas no backend (api/*.js) |
| `SUPABASE_ANON_KEY` no frontend | ⚠️ | Exposta em `config.js` — é a chave pública do Supabase; aceitável se RLS correto |
| `WEBHOOK_SECRET` | ⚠️ | Requer configuração manual no Vercel e nas plataformas de pagamento |
| Chaves no controle de versão | ✅ | Nenhuma chave real nos arquivos rastreados |

---

## 3. CORS

| Endpoint | Status | Ação Necessária |
|----------|--------|----------------|
| `/api/chat` | ⚠️ | `ALLOWED_ORIGIN=*` por padrão — restringir via env em produção |
| `/api/verify` | ⚠️ | Idem |
| `/api/parse-document` | ⚠️ | Idem |
| `/api/webhook-pagamento` | ✅ | Sem CORS — correto para endpoint servidor-a-servidor |

---

## 4. Webhook de Pagamento

| Vetor | Status | Detalhe |
|-------|--------|---------|
| Validação de secret | ✅ | `X-Webhook-Secret` (header) e `?secret=` (query, legado) |
| Idempotência | ✅ | Registra em `webhook_events` com `Prefer: resolution=ignore-duplicates` |
| Confiança apenas em email/status do payload | ✅ | Secret obrigatório; status mapeado para eventos canônicos |
| CORS aberto no webhook | ✅ | Removido neste RC |
| `webhook_events` table no Supabase | 🔲 | **Ação necessária**: executar migration |

**Migration SQL necessária**:
```sql
CREATE TABLE IF NOT EXISTS webhook_events (
  event_id     TEXT PRIMARY KEY,
  event_type   TEXT NOT NULL,
  email        TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Apenas service_role pode inserir/ler
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only" ON webhook_events USING (false);
```

---

## 5. Entitlements e Autorização de IA

| Vetor | Status | Detalhe |
|-------|--------|---------|
| Usuário anônimo chama `/api/chat` | ✅ | Bloqueado — exige Bearer token válido |
| Usuário autenticado (Free) | ✅ | Acesso permitido; limites no frontend |
| Usuário em `authorized_emails` | ✅ | Plano Premium — sem limites |
| Cache de entitlement invalidado | ✅ | Após webhook de compra/reembolso |
| Rate limiting server-side | ⚠️ | Não implementado — depende de cotas Gemini API |

---

## 6. RLS (Row Level Security) — Supabase

| Tabela | Status | Ação Necessária |
|--------|--------|----------------|
| `trips` | 🔲 | Verificar se usuário só lê suas próprias viagens |
| `documents` | 🔲 | Verificar RLS |
| `expenses` | 🔲 | Verificar RLS |
| `authorized_emails` | 🔲 | Apenas `service_role`; sem acesso anon |
| `webhook_events` | 🔲 | Apenas `service_role`; sem acesso público |

**Verificação recomendada**: Authentication → Policies no Supabase Dashboard.
**Teste manual**: Usuário A não deve ver dados do usuário B.

---

## 7. Compartilhamento Público (Shared View)

| Vetor | Status | Detalhe |
|-------|--------|---------|
| URL pública `/v/{id}` | ⚠️ | Design intencional — link gerado explicitamente pelo usuário |
| Downloads bloqueados em shared view | ✅ | `renderDocuments()` bloqueia (Passo 6) |
| Dados financeiros em shared view | ⚠️ | Revisar se despesas/orçamento ficam ocultos |
| Trip privada acessível via ID arbitrário | ⚠️ | Depende de RLS correto no Supabase |

---

## 8. Upload de Documentos

| Vetor | Status | Detalhe |
|-------|--------|---------|
| Validação de MIME type | ⚠️ | Verificar em `parse-document.js` |
| Limite de tamanho | ⚠️ | Default Vercel: 4.5MB body |
| Armazenamento por `user_id` | ✅ | Separado no Supabase Storage |
| XSS via nome de arquivo | ✅ | Metadados sanitizados antes de inserir no DOM |

---

## 9. Injeção e XSS

| Vetor | Status | Detalhe |
|-------|--------|---------|
| Prompt injection via documentos | ✅ | Instrução de proteção no system prompt do `chat.js` |
| DOM injection via dados da IA | ✅ | `actionEngine.js` aplica ações estruturadas — sem HTML bruto da IA |
| XSS via mensagens de chat | ⚠️ | Verificar se `innerHTML` é usado para renderizar mensagens |
| Open redirect via URLs afiliadas | ✅ | `buildAffiliateLink()` sanitiza URLs |

---

## 10. Logs e Observabilidade

| Vetor | Status | Detalhe |
|-------|--------|---------|
| Stack trace exposto ao usuário | ✅ | `errorHandler.js` bloqueia — usuário vê mensagem amigável |
| Email em plain text nos logs | ⚠️ | Logs internos de servidor logam email para auditoria — não chega ao cliente |
| Conteúdo de chat em analytics | ✅ | `analytics.js` bloqueia `chat_content` |
| Dados de pagamento em logs | ✅ | Webhook não loga valores; response não expõe email |

---

## 11. Ações Prioritárias Antes do Go-Live

| Prioridade | Ação |
|-----------|------|
| 🔴 Alta | Configurar `ALLOWED_ORIGIN=https://copilotodeviagem.com.br` nas env vars Vercel |
| 🔴 Alta | Executar migration SQL para `webhook_events` no Supabase |
| 🔴 Alta | Verificar e ativar RLS nas tabelas críticas |
| 🟡 Média | Configurar `WEBHOOK_SECRET` nas plataformas (Kirvano/Kiwify/Greenn) |
| 🟡 Média | Testar isolamento entre usuários A vs B manualmente |
| 🟡 Média | Revisar se shared view expõe dados financeiros |
| 🟢 Baixa | Rate limiting server-side para usuários Free |
| 🟢 Baixa | Endpoint `/api/errors` para observabilidade em produção |
