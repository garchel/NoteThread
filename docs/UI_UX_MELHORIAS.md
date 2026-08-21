# UI/UX — Diagnóstico e Melhorias

> Análise senior — base `public/index.html:1`, `styles.css:1`, `js/` UI. Última atualização: 21/08/2026

## Diagnóstico

### Pontos fortes
- Metáfora chat-thread diferenciada; `Explorador` IDE funciona para power users.
- Temas via `data-theme` `styles.css:25` bem estruturado (CSS vars).
- Micro-interações (`bubbleIn`, `toast`, `haptic`) acima de MVP.

### Problemas estruturais

**1. Hierarquia fraca** `styles.css:132`
- Sidebar e chat com mesmo peso visual (`--bg-elev` vs `--bg-chat` quase idênticos em `lavender`).
- Header `backdrop-filter` `styles.css:359` quebra contraste em `dark`/`midnight`.

**2. Densidade e respiro**
- `sidebar:300px` fixo `styles.css:17` sem colapso; em 1366px sobra pouco para chat; em 375px vira overlay sem backdrop.
- `composer` 4 `fmt-btn` 44px + `attach` + `send` = 82px de altura `styles.css:443` — rouba viewport mobile.

**3. Tipografia sem escala**
- `Plus Jakarta Sans` + `Nunito` `index.html:13` sem escala (tudo 14-15px). `chat-name 17px` `styles.css:363` ≈ corpo `15px`.

**4. Componentes inconsistentes**
- 4 linguagens de botão (`btn-primary` `178`, `btn-google` `157`, `btn-icon-sm` `213`, `seg-btn` `803`).
- Larguras arbitrárias de popovers/modais (`560px`, `520px`, `340px`) quebram em 375px mesmo após `styles.css:554`.
- Ícones: emoji unicode + SVG stroke `ICON` `js/icons.js:1` com pesos diferentes.

**5. Feedback e estados vazios**
- `empty-state` genérico `index.html:95` sem CTA contextual.
- `load-older` `styles.css:386` sem skeleton — salto brusco.
- `composer:disabled` `styles.css:465` com `opacity .5` insuficiente.

**6. Acessibilidade**
- Contraste `text-dim #8c86a3` sobre `bg #f4f1fb` falha WCAG AA em `lavender`; `tag-chip` branco translúcido `styles.css:728`.
- `aria-live polite` em `messages` `index.html:93` lê todas as notas em sequência.
- Ordem de tab no `composer-bar` + `composer-row` ilógica.

**7. Mobile**
- `safe-area-inset` só em `sidebar/composer/header` `styles.css:740`, falta em `modal`/`toast`.
- `pull-indicator` sem `overscroll-behavior: contain` `styles.css:383` → bounce duplo iOS.

---

## Roadmap de melhorias

### Quick wins (1-2 dias, alto impacto)
| # | Melhoria | Arquivos | Critério |
|---|----------|----------|----------|
| 1 | **Escala tipográfica + espaçamento 4/8px** — vars `--text-xs/sm/base/lg/xl` e `--space-1..6`, aplicar em `chat-name`, `bubble`, `tnode`, `composer` | `styles.css:1` | Hierarquia visível; espaçamentos múltiplos de 4 |
| 2 | **Unificar botões** — componente único com variantes `primary / secondary / ghost` | `styles.css:157` | 1 linguagem para todos os CTAs |
| 3 | **Corrigir contraste** — `text-dim` `#8c86a3` → `#6b6583` em `lavender`; `tag-chip` com fundo sólido `accent-soft` | `styles.css:9` | Lighthouse Accessibility ≥95, WCAG AA |
| 4 | **Backdrop mobile + safe-area** — overlay `rgba(0,0,0,.32)` quando `app.show-chat` false; `modal`/`toast` com `env(safe-area-inset-*)` | `styles.css:645` | Contexto preservado; sem notch |
| 5 | **Skeleton + empty-states contextuais** — skeleton para `load-older` e CTAs por tipo de vazio (sem threads vs sem resultados) | `index.html:95`, `styles.css:386` | Sem salto brusco; guia ação |

### Médio prazo (para loja)
- Design tokens documentados + Figma auto-layout.
- Densidade adaptativa (compacta desktop / confortável mobile).
- `prefers-reduced-motion` para animações.
- Ordem de tab e `aria-live` corrigidos.

## Status
- [x] Diagnóstico documentado
- [ ] 1. Escala tipográfica
- [ ] 2. Botões unificados
- [ ] 3. Contraste
- [ ] 4. Backdrop/safe-area
- [ ] 5. Skeleton/empty-states
