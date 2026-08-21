# Roadmap — NoteThread v1 Estável (Web + Mobile)

> **Checklist único de lançamento.** Consolida `PROGRESSO.md` + `MOBILE_TASKS.md` e adiciona tasks faltantes para uma versão estável.
> Última atualização: 21/08/2026 · Fonte técnica: `README.md`, `server/www.js`, `server/sync.js`, `public/app.js`, `public/manifest.webmanifest`

---

## 0. Definição de Pronto (DoR) para v1

**Web estável =** host HTTPS único + BD persistente + auth real + PWA instalável + Lighthouse PWA ≥90 + sem `confirm()` nativo + sem perda de dados ao reiniciar.

**Mobile estável =** Fase 1 crítica de `MOBILE_TASKS.md:20` 100% resolvida + touch ≥44px + popovers cabem em 375px + swipe/back funcionam + APK/TWA instalável com ícones finais.

---

## FASE 0 — Infra mínima (bloqueia tudo) — 1 dia

| # | Task | Evidência / Arquivo | Critério de aceite |
|---|------|---------------------|--------------------|
| W0.1 | Git: primeiro commit + push | `git status` hoje `No commits yet` | `git push -u origin main` verde |
| W0.2 | Host único HTTPS (Render/Railway) | `server/www.js:34` `process.env.PORT`, `Procfile:1` | `https://.../health` → `{"ok":true}` + `wss://...` conecta |
| W0.3 | Configurar `SYNC_URL` prod | `public/app.js:24` `window.NOTE_THREAD_SYNC_URL`, `public/index.html:221` | APK e web usam `wss://` sem mixed-content |
| W0.4 | Domínio + HTTPS (auto Render) | — | URL final definida para PWABuilder |

## FASE 1 — Web estável / Dados (bloqueia produção)

| # | Task | Origem | Aceite |
|---|------|--------|--------|
| W1.1 | **Persistência real**: migrar `server/sync.js:13` `data.json` → Postgres (Render Postgres / Supabase) + `save()/load()` | `PROGRESSO.md:58` risco free tier | Reiniciar instância não apaga notas; backup diário |
| W1.2 | **Auth real**: Google OAuth → JWT → validar `hello.userId` em `server/sync.js:62` (hoje confia no cliente) | `README` auth mock `app.js:791` | Usuário A não vê dados de B mesmo forjando `userId` |
| W1.3 | **Segurança**: `WSS` obrigatório em prod, `CORS`, `CSP` headers, `rate-limit` no WS, `fs` path traversal já ok `www.js:24` mas faltam headers | Faltava | `npm audit` 0 high; headers `Content-Security-Policy`, `X-Frame-Options` |
| W1.4 | Sanitização já ok `app.js:48` `esc()` + `renderMarkdown:73` mas auditar `innerHTML` em `bubbleEl:1218` | `PROGRESSO` | Sem XSS em `"><svg>` |
| W1.5 | Secrets via `env` (nunca commit `data.json` — já em `.gitignore:5`) | `PROGRESSO:53` | `data.json` ignorado, `DATABASE_URL` em env |
| W1.6 | Observabilidade: logs estruturados + `/health` com `users` `sync.js:179` + uptime (UptimeRobot) + Sentry | Faltava | Alerta se WS down |

## FASE 2 — Web PWA + Qualidade

| # | Task | Arquivo | Aceite |
|---|------|---------|--------|
| W2.1 | **Ícones finais**: substituir `icon-192.png:1972b`/`icon-512.png:8175b` placeholders por ícones 1024px maskable + splash | `PROGRESSO:68` reprovam na loja | PWABuilder score 100, `maskable` sem bordas |
| W2.2 | `manifest.webmanifest:10` `theme_color` dinâmico por `data-theme` + `meta theme-color` | `MOBILE_TASKS:44` | Status bar muda com tema |
| W2.3 | `sw.js:3` `CACHE notethread-v8` → bump + `updateViaCache:none` já ok `app.js:1953` + testar offline `navigate` fallback `sw.js:41` | — | Lighthouse PWA ≥90, funciona avião |
| W2.4 | **CI/CD**: GitHub Actions `lint` + `test` + deploy Render + branch protection | Faltava | PR bloqueia se teste falha |
| W2.5 | **Testes**: unit `Store` (`upsertNote`, `moveThread`, `pageNotes`), integration `sync.js` broadcast, e2e Playwright (login → criar thread → enviar nota → sync 2 clients) | Faltava | `npm test` verde local e CI |
| W2.6 | Performance: headers `Cache-Control` para `public/*`, `compress` (`gzip`), auditar `app.js` 1959 linhas | Faltava | Lighthouse Performance ≥90 |
| W2.7 | Legal: `privacy.html` + `terms.html` + link no `manifest` e login | Faltava p/ loja | URL válida em `manifest` |
| W2.8 | Versionamento `package.json:3` `1.0.0` → `semver` + `CHANGELOG.md` | Faltava | Tag `v1.0.0` |

## FASE 3 — Mobile estável (crítico → polimento)

### 3A. Críticos (bloqueiam lançamento — `MOBILE_TASKS.md:20`)

| # | Task | Status atual | Aceite 375×812 |
|---|------|--------------|----------------|
| M3.1 | `msg-popover` via **long-press 500ms** em bolhas | ✅ Já em `app.js:1223` `onTouchStart` | Touch 1s abre Editar/Excluir/Pinar/Copiar |
| M3.2 | `ctx-menu` (Favoritar/Renomear/Mover/Excluir) via long-press em `tnode` | ✅ Já em `app.js:1002` `onTnodeTouchStart` + `app.js:948` pasta | Long-press thread/pasta abre menu |
| M3.3 | Navegação `sidebar ↔ chat` bidirecional (`btn-back` + swipe) | ✅ Já em `app.js:830` `btn-back` + `app.js:629` `bindSwipe` | Swipe dir mostra sidebar, esq esconde |

> Se 3A falhar em device real, corrigir antes de loja. Teste em Playwright `375×812` já feito `MOBILE_TASKS:3`.

### 3B. Alto impacto (`MOBILE_TASKS.md:25`)

| # | Task | Arquivo | Aceite |
|---|------|---------|--------|
| M3.4 | **Touch targets ≥44×44px**: auditar `styles.css:812` `.fmt-btn 30×28`, `.star 14px` já corrigido `styles.css:301` 44px | `MOBILE_TASKS:29` | WCAG, sem toque errado |
| M3.5 | **Popovers responsivos**: `styles.css:554` `.pin-popover min-width:520px` + `styles.css:598` `.settings-popover 340px` estouram 375px | `MOBILE_TASKS:35` | `max-width: calc(100vw - 16px)` + `left:8px` |
| M3.6 | **Teclado cobre composer**: `app.js:1565` `scrollIntoView` + `visualViewport` resize | `MOBILE_TASKS:30` | Ao abrir teclado, textarea visível |
| M3.7 | **Haptic**: `app.js:32` `navigator.vibrate` em enviar/excluir/pinar | `MOBILE_TASKS:30` | Vibra em Android |

### 3C. Polimento (`MOBILE_TASKS.md:31`)

| # | Task | Aceite |
|---|------|--------|
| M3.8 | Placeholder `textarea` truncado `index.html:113` → versão curta mobile via `@media` | Texto cabe |
| M3.9 | Emoji grid `styles.css:589` `6 cols` → `4 cols` em ≤760px | Sem aperto |
| M3.10 | Lightbox `app.js:1241` pinch-to-zoom (hoje só clique) | Pinch funciona |
| M3.11 | `safe-area-inset` para notch (`padding: env(safe-area-inset-*)`) em `styles.css` | Conteúdo não sob notch |
| M3.12 | Pull-to-refresh (opcional) | — |
| M3.13 | Search `max-height:40vh` `styles.css:241` já ok, testar em SE | Não cobre tela |

## FASE 4 — Loja (APK/TWA)

| # | Task | Rota | Aceite |
|---|------|------|--------|
| L4.1 | Gerar **TWA via PWABuilder** (`pwabuilder.com` + URL HTTPS) — requisitos já ok: `manifest:10` icons, `sw.js` | `PROGRESSO:60` | `.apk` instala e abre standalone |
| L4.2 | **Assets loja**: screenshots  phone/tablet, `feature graphic 1024×500`, descrição, `privacy URL` | Faltava | Play Console sem warnings |
| L4.3 | **Contas**: Play US$25 única, Apple US$99/ano | `PROGRESSO:70` | — |
| L4.4 | **Monetização**: AdMob / Play Billing **exigem Capacitor/Android Studio** — PWABuilder limitado | `PROGRESSO:68` | Decidir: TWA MVP vs Capacitor v2 |
| L4.5 | Beta track interno (20 testers) + crash reports | Faltava | 0 crash em 3 dias |

## FASE 5 — v2 (Capacitor + OAuth público externo)

> Google Cloud avisa ao sair de `Testing` → `External` que precisa verificação. Anotar para quando publicar fora dos test users.

| # | Task | Onde | Aceite |
|---|------|------|--------|
| V5.1 | **OAuth consent screen → External**: `Google Cloud → OAuth consent screen → User Type: External` → App name `NoteThread`, User support e-mail, App logo `icon-1024.png`, App domain `https://SEUAPP.vercel.app`, Authorized domains `vercel.app` + `supabase.co`, Dev e-mail | Cloud Console | Status `In production` |
| V5.2 | **Scopes + Test users**: enquanto `Testing`, adicionar `test users` (`Supabase → Auth → Users`); para `External` solicitar `email` `profile` `openid` (não sensível, sem verificação extensa) | Cloud Console | Sem `Access blocked` |
| V5.3 | **Domínio + Privacy**: publicar `public/privacy.html` + `public/terms.html` e colar URLs em `OAuth consent → Privacy policy / Terms of service` + `Authorized domains` | `public/privacy.html:1` | URLs válidas, Google aprova |
| V5.4 | **Supabase URLs prod**: `Supabase → Authentication → URL Configuration → Site URL = https://SEUAPP.vercel.app` + `Additional Redirect URLs = https://SEUAPP.vercel.app/*` + `https://dcttsnttbtsvpnfwtoaj.supabase.co/auth/v1/callback` já em `Google → Authorized redirect URI` | Supabase | Login Google não dá `redirect_uri_mismatch` |
| V5.5 | **Publicar App Google**: `OAuth consent → Publish App` → se pedir verificação, enviar para Google (leva 3-7 dias) — sem isso limite 100 contas teste | Cloud Console | `Published` |
| V5.6 | **Capacitor v2**: migrar TWA → `npx cap add android`, `AdMob` + `Play Billing`, `splash` nativo, `push` | `L4.4` | AAB na Play |

## FASE 6 — Melhorias de produto & arquitetura (backlog priorizado)

> Levantamento 21/08/2026 após estabilização v1. Ordem = impacto ÷ esforço.

### Produto (diferencial visível)

| # | Task | Detalhe | Aceite |
|---|------|---------|--------|
| P6.1 | ✅ **Busca com filtros** | Implementado `7a86cd5`: `in:trabalho` (conversa), `#tag`, `depois:YYYY-MM-DD`, `antes:YYYY-MM-DD` + chips no contador + placeholder. Ex: `in:trabalho #urgente depois:2026-01-01` | ✅ Filtros funcionam |
| P6.2 | ✅ **Backlinks/menções** | Concluído `f29aa7a`: `@` autocomplete + token `@[Nome](t:id)` + chip navegável + seção "Mencionado em" na thread citada (scan de notas) | ✅ Bidirecional |
| P6.3 | ✅ **Lembretes/notifications** | Implementado `73a38e7`: "Lembrar-me" no menu ▾ (datetime), colunas `remind_at/remind_fired`, scheduler 20s + Notification API + toast, badge ⏰ no explorador. Push com app fechado → v2 Capacitor (`V5.6`) | ✅ Notificação dispara com app aberto |

### Arquitetura (dívida que cobra juros)

| # | Task | Detalhe | Aceite |
|---|------|---------|--------|
| A6.4 | ✅ **Quebrar o `app.js`** | Concluído `775e540`: 18 ES Modules (`js/*` + `js/ui/*`). Onda 1 `a9a2c70` (1.270 linhas) + Onda 2 `775e540` extraiu `settings/auth/tree/composer/sync-events` → `app.js` final **195 linhas**, todos <500. Sem build step, `sw.js v33` precacheia todos, e2e 2/2 verde | ✅ Sem bundler; e2e verde |
| A6.5 | ✅ **Remover o legado** | Removido `17cdd5d`: `server/*` (www/sync/index/static/start), `Procfile`, `attachtest.js`, `WSSync`/`SYNC_URL` no app.js, dep `ws`. Sync = SupaSync direto; sem config → offline honesto | ✅ Deletado; deploy verde |
| A6.6 | ✅ **Testes do fluxo real** | Implementado `17cdd5d`: Playwright + servidor estático zero-dep. 2 specs verdes: (1) criar thread → nota com checkbox → marcar → reload → persiste; (2) menção `@` → token → chip → navegação. Roda no CI (`ci.yml`) | ✅ `npm run e2e` verde local e CI |

### Robustez

| # | Task | Detalhe | Aceite |
|---|------|---------|--------|
| R6.7 | **Imagens em Storage** | `base64` no Postgres/localStorage vai estourar a cota free (500MB) rápido e incha o snapshot. Supabase Storage (bucket privado + URL assinada) na nota resolve e acelera o carregamento | Upload → Storage; snapshot não carrega bytes de imagem |
| R6.8 | **Paginação real no servidor** | `limit(200)` no snapshot é paliativo; usar `.range()` com scroll infinito consultando o banco por página (notas antigas sob demanda) | Thread com 5k notas abre igualmente rápida |
| R6.9 | **PWA update UX** | Auto-reload do SW resolve o bundle travado; um "What's new" no toast de update daria polimento (changelog curto por versão em `sw.js` ou JSON) | Toast mostra 1-2 linhas de novidades antes de recarregar |

---

## Ordem recomendada

1. **Fase 0** (infra) → já permite testar APK local com `wss`.
2. **Fase 1** (BD+Auth) → sem isso, perde dados e vaza isolamento.
3. **Fase 3A+3B** + **W2.1** → mobile instalável.
4. **Fase 2** (CI+testes) em paralelo → garante regressão.
5. **Fase 4** → loja (TWA).
6. **Fase 5** → v2 externo (OAuth publicado + Capacitor).
7. **Fase 6** → produto/arquitetura (P6.1–R6.9), em paralelo ou pós-v2.

## Como validar

```bash
npm start                          # :3000 health ok
# 2 abas mesmo e-mail: nota A → B realtime
# DevTools Lighthouse: PWA ≥90
# Playwright viewport 375×812: long-press bolha + long-press thread + swipe
# Render restart: notas persistem
```

## Referências cruzadas

- Auditoria completa mobile: `docs/MOBILE_TASKS.md`
- Histórico do que já funciona: `docs/PROGRESSO.md`
- Entry-point: `README.md`
