# NoteThread — Progresso (snapshot 17/08/2026)

> **⚠️ Este arquivo é histórico.** O checklist atual de lançamento está em **[ROADMAP_ESTAVEL.md](ROADMAP_ESTAVEL.md)** — use-o como fonte da verdade para web+mobile estável.

## 1. Origem

App reconstruído localmente via Ctrl+C/V de plataforma que não permitia exportar. `public/index.html` e ícones PWA foram recriados.

## 2. O que JÁ FUNCIONA ✅

**Frontend (PWA, JS puro)** — `public/` com `index.html`, `app.js` (~1959 linhas), `styles.css`, `sw.js` (`notethread-v8`), `manifest.webmanifest`, `icon-192/512.png`, `icon.svg`. Login mock, threads chat, lazy `PAGE_SIZE=25`, Markdown, 6 temas + Auto, sons `cuelume`, busca global, pastas/árvore IDE, favoritos, pin/drag-and-drop, lightbox, offline-first `localStorage`.

**Backend (Node + `ws`)** — `server/www.js` servidor único (estático+WS mesma porta `PORT`), `server/sync.js` broadcast por `userId` + `data.json`, `server/start.js` wrapper. Protocolo `hello→snapshot`, `note:upsert/edit/delete/pin/reorder/tags`, `thread:upsert/delete/move`, `folder:upsert/delete`.

**Validado** — `npm start` :3000 `200` + `health` ok; sync realtime PC→celular mesmo e-mail.

## 3. Correções feitas na reconstrução

| # | Problema | Solução |
|---|----------|---------|
| 1 | `index.html` faltando | Movido para `public/index.html` |
| 2 | `npm start` quebrado | `package.json:6` → `node server/start.js` |
| 3 | Sync isolava por device | `hello` agora usa `mail` como chave |
| 4 | Não deployável em host único | `server/www.js` frontend+WS mesma porta |
| 5 | `SYNC_URL` fixa `:3001` | `app.js:24` mesma origem + `window.NOTE_THREAD_SYNC_URL` |
| 6 | Ícones PWA ausentes | Gerados `icon-192/512.png` placeholders |
| 7 | Sem `.gitignore`/`Procfile` | Adicionados |

## 4. O que falta → ver ROADMAP

Todo o planejamento de **host, BD, auth real, PWA, CI, loja** foi movido para **[ROADMAP_ESTAVEL.md](ROADMAP_ESTAVEL.md) (Fases 0–4)**.

Resumo antigo (mantido para contexto):

- **A.** Push GitHub (`No commits yet`, `origin garchel/NoteThread`)
- **B.** Hospedar backend (Render, `npm start`) — risco `data.json` volátil → BD
- **C.** APK via PWABuilder (já PWA-ready, mas ícones placeholder)
- **D.** Lojas + monetização (AdMob/Billing exigem Capacitor)

## 5. Arquivos importantes

- `public/index.html:221` bloco `NOTE_THREAD_SYNC_URL` para prod
- `public/app.js` Store offline-first + Sync + Sound + UI
- `public/sw.js` `notethread-v8`
- `server/www.js` prod · `server/sync.js` núcleo · `server/index.js` legado

## 6. Decisões pendentes (dono)

- [ ] Host (Render/Railway/VPS) e BD já de início?
- [ ] Ícones/nome definitivos?
- [ ] Monetização (ads/IAP) e migração Capacitor?
- [ ] Limpar `attachtest.js`, `icon.svg` raiz duplicado, `server/static.js` legado

> Ver **[ROADMAP_ESTAVEL.md](ROADMAP_ESTAVEL.md)** para checklist priorizado.
