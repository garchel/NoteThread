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

---

## Ordem recomendada

1. **Fase 0** (infra) → já permite testar APK local com `wss`.
2. **Fase 1** (BD+Auth) → sem isso, perde dados e vaza isolamento.
3. **Fase 3A+3B** + **W2.1** → mobile instalável.
4. **Fase 2** (CI+testes) em paralelo → garante regressão.
5. **Fase 4** → loja.

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
