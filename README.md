# NoteThread 🧵

Bloco de notas em **threads infinitas estilo chat** — como conversar com você mesmo no WhatsApp. Sync em tempo real entre dispositivos + offline-first. PWA-ready (mobile e desktop no navegador, sem dependências pesadas).

> **Entry-point da documentação.** Para planejar o lançamento estável, veja **[docs/ROADMAP_ESTAVEL.md](docs/ROADMAP_ESTAVEL.md)** — checklist único web + mobile.

## Stack

- **Frontend:** JS puro + `public/app.js` (~1950 linhas), `styles.css` (temas via `data-theme`), `sw.js` (cache `notethread-v8`), `manifest.webmanifest`
- **Backend:** Node.js + `ws@8` — `server/www.js` (servidor único: estático + WebSocket na mesma porta) + `server/sync.js` (broadcast por `userId`, persistência `data.json`)
- **PWA:** `manifest.webmanifest` + `sw.js` + `icon-192/512.png`

## Features (vs spec)

| Área | Status | Onde |
|---|---|---|
| 2.1 Threads (múltiplas conversas) | ✅ | `app.js:Store.threadList` |
| 2.2 Timeline + infinite scroll | ✅ | `PAGE_SIZE=25` `app.js:14` |
| 2.3 Composer (Enter envia, Shift+Enter quebra) | ✅ | `app.js:1544` |
| 3. Sync multi-device realtime | ✅ | `server/sync.js:50` `installSync` |
| 3. Offline-first (localStorage) | ✅ | `app.js:146` `Store` |
| 4. Auth (e-mail/Google mock) | ⚠️ mock | `app.js:790` |
| 4. Busca global + tags | ✅ | `app.js:458` |
| 5. Temas (6) + Auto | ✅ | `styles.css:25` |
| 5. Sons sintetizados (cuelume) | ✅ | `app.js:105` |

> Detalhe histórico de versões v2–v8.3 no arquivo anterior — movido para `docs/PROGRESSO.md`.

## Como rodar

```bash
npm install
npm start          # frontend + sync na mesma porta (default 3000)
# abra http://localhost:3000
PORT=8080 npm start
```

Teste multi-device: abra em 2 abas/janelas com o **mesmo e-mail** → nota em A aparece em B em realtime. Offline: desligue Wi-Fi, continue escrevendo, reconecte → reconcilia.

## Deploy

Servidor único resolve mixed-content: mesmo `origin` para HTTP e `ws/wss`. Em produção defina:

```html
<script>window.NOTE_THREAD_SYNC_URL='wss://seu-servidor.com';</script>
```
em `public/index.html:221`. `Procfile:1` já aponta para `node server/www.js` (Render/Railway).

## Documentação

| Doc | O que é |
|---|---|
| **[docs/ROADMAP_ESTAVEL.md](docs/ROADMAP_ESTAVEL.md)** | **Checklist único para v1 estável web+mobile** (o que falta, fases 0–3) |
| [docs/PROGRESSO.md](docs/PROGRESSO.md) | Snapshot do que já funciona + correções feitas na reconstrução |
| [docs/MOBILE_TASKS.md](docs/MOBILE_TASKS.md) | Auditoria técnica mobile detalhada (viewport 375×812) |

## Arquitetura

```
public/  index.html  app.js  styles.css  sw.js  manifest.webmanifest  icon-*.png
server/  www.js (prod)  sync.js (núcleo)  start.js  data.json (ignorado)
```

Fluxo: `composer → Store.upsertNote() → localStorage → Sync.send('note:upsert') → broadcast → snapshot no hello`.

> Para produção, `server/sync.js` é trocável por Firebase/Supabase mantendo a mesma API `Sync.on/send` (`README` original `L98`).

## Limitações atuais (sandbox)

- `data.json` em memória/arquivo — não é BD de produção
- OAuth simulado — pronto para plugar provedor real
- Sem WSS/CSP/rate-limit neste demo (ver roadmap)
