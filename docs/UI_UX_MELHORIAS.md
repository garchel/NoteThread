# UI/UX — Diagnóstico e Melhorias

> Análise senior — base `public/index.html`, `styles.css`, `js/ui/*.js`. Última atualização: 24/08/2026 (re-auditoria contra o código; linhas citadas podem ter deslocado).
> Motion design tem arquivo próprio: `MOTION_DESIGN.md`

## Diagnóstico

### Pontos fortes
- Metáfora chat-thread diferenciada; `Explorador` IDE funciona para power users.
- Temas via `data-theme` bem estruturados (CSS vars, 7 temas, todos com contraste validado).
- Micro-interações (`bubbleIn`, `pop-in` no envio, `flash` no jump-to-note, haptic, sons) acima de MVP.
- ✅ **(24/08)** Acessibilidade HIGH resolvida: contraste ≥4.5:1 nos 7 temas, zoom mobile habilitado, aria-labels nos botões icon-only, labels ARIA no login (commit `0fd7230`).
- Escala tipográfica e espaçamento 4/8 existem como tokens (`--text-xs..2xl`, `--space-1..6`) — o doc antigo pedia criá-los.
- Backdrop mobile quando a sidebar está aberta já existe (`.app::before` + `.app:not(.show-chat)`).
- Empty state da sidebar tem CTA (`.tree-empty .te-btn` → cria primeira nota).

### Problemas restantes

**1. Hierarquia fraca**
- Sidebar e chat com mesmo peso visual em alguns temas (`--surf-*` ajudam mas `lavender` ainda fica flat).
- Header `backdrop-filter` sobre fundo opaco é custo sem efeito (o banner cozy cobre o header).

**2. Densidade e respiro**
- `sidebar:300px` fixo sem colapso em desktop; em 1366px sobra pouco para o chat.
- Composer cozy: barra de formatação + input ≈ 82px de altura — rouba viewport mobile.

**3. Tipografia**
- ~30 regras de texto em 10–11.5px (badges 10px) abaixo do piso recomendado de 12px.

**4. Componentes inconsistentes**
- 4 linguagens de botão (`btn-primary`, `btn-google`, `btn-icon-sm`, `seg-btn`).
- Larguras de modais variadas (`380px` base → `560px` override no mesmo seletor `.modal-card`).
- Ícones: emoji unicode (🧵⏰🔔💡) convivendo com SVG stroke — pesos visuais diferentes.

**5. Feedback e estados vazios**
- Empty state do canvas sem CTA contextual (a sidebar tem, o canvas não).
- `load-older` sem skeleton (classe `.skeleton` existe no CSS mas ninguém a usa).
- `composer:disabled` só `opacity .5`.
- Falha de rede/timeout no composer sem feedback próprio (só o dot do sync-status).

**6. Acessibilidade — pendências pós-fix HIGH**
- Touch targets < 44px: `.btn-icon-sm` 32px, `.toggle-pass` 32px, `.sync-status` 24px, `.np-close` 26px, `.attach-rm` 20px, `.cozy-composer-bar .fmt-btn` 34px (override do base 44px).
- Modal sem focus trap nem retorno de foco ao gatilho (`js/ui/navigation.js`).
- `.bubble .del` hover-only — touch depende só do menu ▾.
- Inputs de settings (checkbox/range) sem `<label for>` — caption é `<span>` solto.
- ✅ Contraste dos tokens corrigido nos 7 temas (`0fd7230`); `aria-live="off"` correto no log de mensagens (o doc antigo apontava `polite` lendo tudo — já corrigido).

**7. Mobile**
- Toast sem `safe-area-inset-top` (fixo `top:14px`) e sem animação de saída.
- Search results `max-height:40vh` — validar em iPhone SE.
- ✅ Backdrop, safe-area modal/sidebar/header/composer, pull-to-refresh e placeholder truncado já implementados (o doc antigo os listava como pendentes).

**8. Dívida técnica de CSS**
- Duplicações reais (last-wins esconde bugs): `.settings-section` ×2, `.settings-label` ×3, `.bubble .meta` ×3, `.msg-toggle` bloco duplicado, `.explorer-actions` ×2, `.pin-badge` ×2.
- `transition: all` em 9 lugares — especificar propriedades (causa repaint desnecessário).
- Sem `tabular-nums` em timestamps/contagens (layout "dança"); sem `text-wrap: balance` em headings.
- 6 famílias Google Fonts (~15 arquivos) para 2 usadas por padrão — subsetar.

---

## Roadmap de melhorias

### Quick wins (1-2 dias, alto impacto)
| # | Melhoria | Critério |
|---|----------|----------|
| 1 | **Unificar botões** — variantes `primary / secondary / ghost` | 1 linguagem para todos os CTAs |
| 2 | **Touch targets ≥44px** — hit area estendida via pseudo-elemento nos 6 controles pequenos | Nenhum alvo < 44px |
| 3 | **Focus trap no modal** + retorno de foco ao gatilho | Tab preso no modal; foco devolvido |
| 4 | **Skeleton no load-older** + CTA no empty state do canvas | Sem salto brusco; ação guiada |
| 5 | **Toast**: safe-area-top + animação de saída | Sem corte sob notch; despedida suave |

### Médio prazo (para loja)
- Densidade adaptativa (compacta desktop / confortável mobile).
- Feedback de erro de sync no composer (toast + retry inline).
- Limpeza das duplicações CSS + eliminação de `transition: all`.
- `tabular-nums` em `.meta`, contagens e relógios; `text-wrap: balance` em headings.
- Subsetar fontes Google (2 famílias padrão).
- Substituir emojis estruturais por SVG do próprio `icons.js`.
- Medir Lighthouse PWA/Performance e registrar baseline.

## Status
- [x] Diagnóstico documentado
- [x] Escala tipográfica/espaçamento (tokens existem)
- [x] Contraste WCAG AA nos 7 temas (commit `0fd7230`)
- [x] Backdrop mobile + safe-area (modal/sidebar/header/composer)
- [x] Acessibilidade HIGH: zoom, aria-labels, labels de login (`0fd7230`)
- [x] Botões unificados (v73 — sistema `.btn` + variantes primary/secondary/ghost/danger; legados como aliases)
- [x] Touch targets ≥44px (v71 — hit-area `::after`, validado 375×812)
- [x] Focus trap no modal (v71 — Tab preso, Esc fecha, foco devolvido ao gatilho)
- [x] Skeleton/empty-state canvas (v73 — skeleton shimmer no load-older + CTA "Nova anotação")
- [x] Toast safe-area + exit animation (v73)

### Médio prazo — status
- [x] Densidade adaptativa (v75 — mobile compact ganha padding intermediário via media query).
- [x] Feedback de erro de sync no composer (v73 — banner inline + botão "Tentar agora").
- [x] Limpeza das duplicações CSS (`.settings-section/.label`, `.explorer-actions`, `.bubble .meta`, `.msg-toggle`) + eliminação de `transition: all` (9→0, v75).
- [x] `tabular-nums` em `.meta`, `.count`, `.nav-badge` (v75); `text-wrap: balance` em `.chat-name`.
- [x] Subsetar fontes Google (v75 — head carrega Jakarta+Baloo 2; Comfortaa/Quicksand/Fredoka/Nunito sob demanda via `loadFontFamily`).
- [x] Substituir emojis estruturais por SVG (v75 — ⏰/⚠ dos lembretes → `svgClock`/`svgAlert`).
- [x] Medir Lighthouse PWA/Performance e registrar baseline (`docs/LIGHTHOUSE_BASELINE.md`).
