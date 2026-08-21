# Changelog — NoteThread

Todas as mudanças notáveis serão documentadas aqui (semver).

## [1.2.0] — 2026-08-21
### Adicionado
- Busca com filtros `in:`, `#tag`, `depois:`, `antes:` + chips
- Backlink reverso "Mencionado em" para menções `@`
- Paginação real `.range()` no Supabase (thread com 5k notas abre rápido)
- "What's new" no toast de update (mostra 2 itens do changelog)
- Imagens no Supabase Storage (bucket `note-images`, 5MB, fallback base64)
- Checklists clicáveis com persistência + ocultar concluídas (fade)

### Corrigido
- Singleton Supabase (Multiple GoTrueClient), status laranja preso, modal exclusão nota

## [1.1.0] — 2026-08-21
### Adicionado
- Menções `@` com autocomplete + lembretes com Notification API + badge ⏰
- Persistência de login (lembrar-me), modal exclusão nota, área arrow, checkboxes
- Pull-to-refresh com indicador visual

## [1.0.0] — 2026-08-21
### Adicionado
- Checklist único `docs/ROADMAP_ESTAVEL.md` (Fases 0–4)
- Reorganização `README.md` + `docs/PROGRESSO.md` + `docs/MOBILE_TASKS.md`
- Fix mobile: popovers responsivos, touch 44px, emoji grid 4 colunas, safe-area
- PWA: `meta theme-color` dinâmico, `viewport-fit=cover`
- Server: headers `CSP`/`Cache-Control`, rate-limit, sanitização
- Lightbox pinch-to-zoom + CI, `.env.example`, `privacy.html`/`terms.html`
