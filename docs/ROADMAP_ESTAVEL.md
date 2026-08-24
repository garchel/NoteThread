# Roadmap — NoteThread v1 Estável (Web + Mobile)

> **Checklist único de lançamento.** Consolida `PROGRESSO.md` + `MOBILE_TASKS.md` e adiciona tasks faltantes para uma versão estável.
> Última atualização: 24/08/2026 · Fonte técnica: `README.md`, `public/app.js`, `public/js/**`, `vercel.json`, `.github/workflows/ci.yml`, `supabase.sql`

> **⚠️ Nota de arquitetura (24/08):** o backend Node próprio (`server/*`) foi **removido** (`17cdd5d`). Deploy é estático na **Vercel** (`vercel.json`: headers CSP/X-Frame, cache-control do SW) + **Supabase** para auth (Google OAuth), Postgres com RLS e Storage. As Fases 0–1 abaixo foram absorvidas por essa pilha — mantidas como histórico.

---

## 0. Definição de Pronto (DoR) para v1

**Web estável =** host HTTPS único ✅ (Vercel) + BD persistente ✅ (Supabase) + auth real ✅ (Google OAuth via Supabase) + PWA instalável ✅ + Lighthouse PWA ≥90 ⏳ medir + sem `confirm()` nativo ✅ + sem perda de dados ao reiniciar ✅.

**Mobile estável =** touch ≥44px ⏳ (restam 6 controles) + popovers cabem em 375px ✅ + swipe/back funcionam ✅ + APK/TWA instalável com ícones finais ✅ assets prontos.

---

## FASE 0 — Infra mínima — ✅ CONCLUÍDA

| # | Task | Status |
|---|------|--------|
| W0.1 | Git: commit + push | ✅ `main → github.com/garchel/NoteThread` |
| W0.2 | Host único HTTPS | ✅ Vercel (estático; o plano original Render+WS foi substituído pelo Supabase Realtime) |
| W0.3 | Config sync prod | ✅ Supabase direto (`window.SUPABASE_URL` no `index.html`, anon key pública + RLS) |
| W0.4 | Domínio + HTTPS | ✅ HTTPS automático Vercel |

## FASE 1 — Web estável / Dados — ✅ CONCLUÍDA (pilha Supabase)

| # | Task | Status |
|---|------|--------|
| W1.1 | Persistência real | ✅ Supabase Postgres (`sync-supabase.js`), offline-first localStorage + fila |
| W1.2 | Auth real | ✅ Google OAuth via Supabase (`signInWithOAuth`); isolamento por RLS (`auth.uid() = user_id` no `supabase.sql`) |
| W1.3 | Segurança headers | ✅ `vercel.json`: CSP, X-Frame-Options DENY, X-Content-Type-Options nosniff |
| W1.4 | Sanitização XSS | ✅ `esc()` + render markdown próprio; auditar a cada novo `innerHTML` |
| W1.5 | Secrets via env | ✅ só anon key pública no cliente (por design); service key fora do repo |
| W1.6 | Observabilidade | ⏳ `/health` não existe mais (sem servidor); considerar Vercel Analytics/Sentry |

## FASE 2 — Web PWA + Qualidade

| # | Task | Arquivo | Aceite | Status |
|---|------|---------|--------|--------|
| W2.1 | Ícones finais | `icon-192/512/1024.png` maskable + `icon.svg` | PWABuilder score 100 | ✅ 1024px existe (58KB), purpose `any maskable` |
| W2.2 | `theme_color` dinâmico por tema | `js/ui/settings.js` atualiza `<meta name="theme-color">`; manifest fixo `#7c5cff` | Status bar muda com tema | ✅ meta dinâmico (manifest continua fixo — aceitável) |
| W2.3 | SW bump + offline | `sw.js` v70, CSS/JS network-first, `updateViaCache:none` | Funciona avião | ✅ (bump pareado com teste a cada deploy) |
| W2.4 | CI/CD | `.github/workflows/ci.yml` | PR bloqueia se teste falha | ✅ check + test + e2e |
| W2.5 | Testes | `tests/sync.test.js` (node:test) + Playwright e2e | Verde local e CI | ✅ 8 unit + 2 e2e specs |
| W2.6 | Performance | `vercel.json` cache-control p/ sw.js; compress nativo Vercel | Lighthouse ≥90 | 🟡 parcial — medir Lighthouse |
| W2.7 | Legal: privacy + terms | `public/privacy.html`, `public/terms.html` | URLs válidas | ✅ existem |
| W2.8 | Versionamento semver + CHANGELOG | `package.json` 1.0.0 + `CHANGELOG.md` | Tag v1.0.0 | 🟡 arquivos existem; tag pendente |

## FASE 3 — Mobile estável — detalhes em `MOBILE_TASKS.md`

### 3A. Críticos — ✅ TODOS implementados
Long-press bolha ✅ · long-press tnode/pasta ✅ · navegação sidebar↔chat bidirecional ✅
> Falta apenas: re-teste em device real antes da loja.

### 3B. Alto impacto

| # | Task | Aceite | Status |
|---|------|--------|--------|
| M3.4 | Touch targets ≥44px | WCAG | 🔴 Pendente — 6 controles pequenos: `.btn-icon-sm` 32px, `.toggle-pass` 32px, `.sync-status` 24px, `.np-close` 26px, `.attach-rm` 20px, e override `.cozy-composer-bar .fmt-btn` 34px sobre o base 44px |
| M3.5 | Popovers responsivos | caber em 375px | ✅ `min(Xpx, calc(100vw - 16px))` em todos |
| M3.6 | Teclado cobre composer | textarea visível | ✅ scrollIntoView + visualViewport |
| M3.7 | Haptic | vibra Android | ✅ |

### 3C. Polimento

| # | Task | Status |
|---|------|--------|
| M3.8 | Placeholder truncado mobile | ✅ media query com ellipsis |
| M3.9 | Emoji grid mobile | ✅ 8→6 cols ≤760px (o roadmap pedia 4; 6 provou ser suficiente) |
| M3.10 | Lightbox pinch-to-zoom | ✅ |
| M3.11 | Safe-area notch | ✅ modal/sidebar/header/composer |
| M3.12 | Pull-to-refresh | ✅ `_initPullToRefresh()` |
| M3.13 | Search max-height 40vh em SE | ⏳ validar device real |

## FASE 4 — Loja (APK/TWA)

| # | Task | Aceite | Status |
|---|------|--------|--------|
| L4.1 | TWA via PWABuilder | APK instala standalone | ⏳ pré-requisitos ok (manifest completo, SW, ícones) |
| L4.2 | Assets loja | Play Console sem warnings | ⏳ |
| L4.3 | Contas dev | — | decisão do dono |
| L4.4 | Monetização | TWA MVP vs Capacitor v2 | decisão do dono |
| L4.5 | Beta track | 0 crash em 3 dias | ⏳ |

## FASE 5 — v2 (OAuth público externo)

> Sem mudança desde 21/08 — tasks V5.1–V5.5 (publicar OAuth consent screen, scopes, domínios, URLs Supabase) continuam válidas para quando sair do Testing. V5.6 Capacitor depende de L4.4.

---

## FASE 6 — Melhorias de produto & arquitetura

> Levantamento 21/08, re-auditado 24/08. Ordem = impacto ÷ esforço.

### Produto (diferencial visível)

| # | Task | Detalhe | Status |
|---|------|---------|--------|
| P6.1 | ✅ Busca com filtros | `in:` `#tag` `depois:` `antes:` + chips | ✅ |
| P6.2 | ✅ Backlinks/menções | `@[Nome](t:id)` + dropdown "Mencionado em" no nome da nota (popover dedicado) | ✅ evoluiu: agora fica no menu do título |
| P6.3 | ✅ Lembretes/notifications | datetime + scheduler + Notification API + badge + clique na notificação abre a thread (SW `notificationclick`) | ✅ push com app fechado segue v2 |

### Arquitetura

| # | Task | Status |
|---|------|--------|
| A6.4 | ✅ Quebrar app.js em 18 ES Modules | ✅ |
| A6.5 | ✅ Remover legado server/* | ✅ |
| A6.6 | ✅ Testes do fluxo real (Playwright e2e no CI) | ✅ |

### Robustez

| # | Task | Status |
|---|------|--------|
| R6.7 | ✅ Imagens em Supabase Storage + fallback base64 | ✅ |
| R6.8 | ✅ Paginação real (.range + infinite scroll) | ✅ |
| R6.9 | ✅ PWA update UX ("what's new" no toast via CHANGELOG) | ✅ |

### Novo (24/08) — acessibilidade e motion

| # | Task | Detalhe | Status |
|---|------|---------|--------|
| Q6.10 | ✅ Acessibilidade HIGH | Contraste ≥4.5:1 nos 7 temas, zoom habilitado, aria-labels icon-only, labels login — commit `0fd7230` | ✅ |
| Q6.11 | ⏳ Motion design | Identidade de movimento + 9 fixes + 9 oportunidades — ver `docs/MOTION_DESIGN.md` | planejado |
| Q6.12 | ⏳ UI polish restante | Botões unificados, touch targets, focus trap, skeleton — ver `docs/UI_UX_MELHORIAS.md` | planejado |

---

## Ordem recomendada (atualizada)

1. ~~Fase 0~~ / ~~Fase 1~~ — ✅ feitas pela pilha Vercel+Supabase.
2. **M3.4 touch targets** (único item crítico mobile restante) + focus trap no modal.
3. Re-teste device real 375×812 (checklist `MOBILE_TASKS.md`).
4. Medir **Lighthouse PWA + Performance** (W2.6) — único gate sem evidência.
5. Fase 4 loja (TWA).
6. Fase 5 v2 externo quando for publicar fora dos test users.
7. Fase 6 melhorias (Q6.11/Q6.12) em paralelo.

## Como validar

```bash
npm run dev                        # :3001 (ou porta livre que serve escolher)
npm run check                      # node --check em todo JS público
npm run test                       # node:test (inclui assertion da versão do SW)
npm run e2e                        # Playwright: fluxo nota + menção
# Lighthouse (PWA + Performance) na URL de produção
# Playwright viewport 375×812: long-press bolha + long-press thread + swipe
```

## Referências cruzadas

- Auditoria completa mobile: `docs/MOBILE_TASKS.md`
- Histórico do que já funciona: `docs/PROGRESSO.md`
- Design tokens: `docs/DESIGN_TOKENS.md`
- UI/UX diagnóstico: `docs/UI_UX_MELHORIAS.md`
- Motion design: `docs/MOTION_DESIGN.md`
- Entry-point: `README.md`
