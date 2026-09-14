# VEROA — Log de Migração de Marca (Rebrand Log)

Este documento registra todas as alterações realizadas na migração de marca para VEROA.

---

## 1. Arquivos de Identidade & Assets Modificados

- `assets/symbol-v.svg` *(NOVO: Símbolo oficial V em vetor)*
- `assets/logo-veroa.svg` *(NOVO: Logo completo com Wordmark VEROA e A aberto)*
- `assets/app-icon.svg` *(ATUALIZADO: Ícone do PWA e favicon com símbolo V)*
- `manifest.json` *(ATUALIZADO: Name 'VEROA - Seu Copiloto de Viagem', Short Name 'VEROA')*

---

## 2. Páginas e Estilos Atualizados

- `style.css` / `style.v123.css` / `style.v2.css` / `vendas.css`:
  - Adicionados Design Tokens Light-First (`--veroa-white`, `--veroa-bg-surface`, `--veroa-deep-blue`, `--veroa-sea-blue`, `--veroa-sea-light`, `--veroa-green`, `--veroa-green-light`, `--veroa-text-primary`, `--veroa-text-secondary`).
  - Importadas fontes `Sora` e `Inter` via Google Fonts.
- `index.html`:
  - Atualizado para VEROA ("Seu copiloto de viagem. Sua viagem inteira. Sob controle.").
  - Pilares inseridos: ORGANIZA, ENTENDE, ANTECIPA, RESOLVE.
  - Produtos destacados: Plan, Now, Wallet, Docs, Places.
- `app.html`:
  - Atualizado para VEROA — Seu Copiloto de Viagem.
  - Atualizado Veroa Now, header, navegação, aba Veroa (Chat), assistente proativo, carteira de documentos, paywall e tutoriais.
- `404.html`:
  - Atualizado para VEROA.

---

## 3. Preservação de Arquitetura Técnica Interna

- ✅ **Variáveis e Nomes Técnicos Preservados:** `travelMode`, `gptViajante`, `CoPilotoDocsDB`, `INSPIRATIONS_DATA`, tabelas do Supabase (`trips`, `inspirations`, etc.), endpoints `/api/chat`, `/api/verify` mantidos sem alterações que pudessem causar regressão.
- ✅ **Testes Automatizados:** 100% dos testes da aplicação continuam passando no terminal.
