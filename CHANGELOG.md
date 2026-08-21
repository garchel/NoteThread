# Changelog — NoteThread

Todas as mudanças notáveis serão documentadas aqui (semver).

## [1.0.0] — 2026-08-21
### Adicionado
- Checklist único `docs/ROADMAP_ESTAVEL.md` (Fases 0–4)
- Reorganização `README.md` + `docs/PROGRESSO.md` + `docs/MOBILE_TASKS.md`
- Fix mobile: popovers responsivos (`pin-popover`/`settings-popover` `calc(100vw-16px)`), touch `44px` em `.fmt-btn`, emoji grid 4 colunas mobile, `safe-area-inset`, placeholder ellipsis
- PWA: `meta theme-color` dinâmico por tema + `viewport-fit=cover`
- Server: headers `CSP`/`X-Frame-Options`/`Cache-Control`, rate-limit WS 30msg/s, limite payload 1.5MB, sanitização texto 5000 chars
- Lightbox pinch-to-zoom + double-tap
- CI `/.github/workflows/ci.yml` (health + headers), `.env.example`, `privacy.html`/`terms.html`

### Corrigido
- `applyTheme` duplicado removido

## [0.8.x] — histórico v2–v8.3
Ver `README.md` anterior / `docs/PROGRESSO.md` — threads, markdown, drag-and-drop, sons `cuelume`.
