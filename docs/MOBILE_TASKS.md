# Auditoria Mobile — NoteThread (detalhe técnico)

> **Companion do roadmap.** O checklist priorizado está em **[ROADMAP_ESTAVEL.md](ROADMAP_ESTAVEL.md) Fase 3**. Este arquivo mantém a evidência viewport `375×812` (iPhone X via Playwright).

## ✅ O que JÁ FUNCIONA bem

| Item | Status | Nota |
|---|---|---|
| Auth screen | ✅ | Card centralizado, touch ok |
| Sidebar full-screen | ✅ | `translateX` 100% |
| btn Voltar (‹) | ✅ | `app.js:830` mobile-only |
| Chat / bolhas / composer | ✅ | Layout 100% |
| Animações ≤0.25s | ✅ | `styles.css:839` `bubbleIn .2s` |
| Status dot 🟢🟠🔴 | ✅ | `app.js:330` `setStatus` recria SVG |

## ⚠️ Problemas por severidade (snapshot original)

### 🔴 CRÍTICO — bloqueia loja

| # | Problema | Evidência | Status atual |
|---|----------|-----------|--------------|
| 1 | Popover de msg só `right-click` | bolha sem menu em touch | ✅ **Corrigido** `app.js:1223` `onTouchStart 500ms` |
| 2 | Nav sidebar→chat unidirecional | só `btn-back` | ✅ **Corrigido** `app.js:629` `bindSwipe` + `btn-back` |
| 3 | `ctx-menu` thread só `contextmenu` | não abre em touch | ✅ **Corrigido** `app.js:1002` `onTnodeTouchStart` |

> Re-testar em device real 375×812 antes de marcar como pronto.

### 🟠 ALTO — degrada UX

| # | Problema | Arquivo | Status |
|---|----------|---------|--------|
| 4 | Settings popover transborda | `styles.css:598` `340px` em 375px | ⏳ Pendente → `ROADMAP M3.5` `max-width:100vw-16px` |
| 5 | Touch targets pequenos | `styles.css:812` `.fmt-btn 30×28` | ⏳ Pendente → `M3.4` ≥44px |
| 6 | Sem haptic | — | ✅ **Corrigido** `app.js:32` `navigator.vibrate` |
| 7 | Teclado cobre composer | `textarea` sem `scrollIntoView` | ✅ **Corrigido** `app.js:1565` `scrollIntoView` (validar `visualViewport`) |

### 🟡 MÉDIO — polimento

| # | Task | Arquivo | Roadmap |
|---|------|---------|---------|
| 8 | Placeholder truncado | `index.html:113` | M3.8 |
| 9 | Emoji grid 6 cols apertada | `styles.css:589` | M3.9 → 4 cols mobile |
| 10 | Pin popover `520px` | `styles.css:554` | M3.5 |
| 11 | Lightbox sem pinch | `app.js:1241` | M3.10 |
| 12 | Sem pull-to-refresh | — | M3.12 |
| 13 | Search `40vh` grande | `styles.css:241` | M3.13 |

### 🟢 BAIXO — nice to have

| # | Item | Roadmap |
|---|------|---------|
| 14 | Swipe gestures | M3.3 ✅ |
| 15 | Skeleton loading | Futuro |
| 16 | `theme-color` dinâmico | W2.2 |
| 17 | `safe-area-inset` notch | M3.11 `env(safe-area-*)` |

---

## Plano original (mantido p/ histórico) → ver ROADMAP Fase 3

- **Fase 1 críticos:** long-press bolha/tnode + swipe — **já implementado**, falta re-teste
- **Fase 2 alto:** touch 44px + popovers responsivos + `scrollIntoView` + `vibrate`
- **Fase 3 polimento:** placeholder, emoji 4 cols, pinch, `safe-area`, `theme-color`

> Para priorização e critérios de aceite atualizados, siga **[ROADMAP_ESTAVEL.md](ROADMAP_ESTAVEL.md)**.
