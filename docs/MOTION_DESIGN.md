# Motion Design — Diagnóstico e Roadmap

> Análise baseada na skill motion-design (LottieFiles) sobre `styles.css` (animações L1636-1759 + transições), `js/ui/*.js` e `index.html`.
> Complementa `UI_UX_MELHORIAS.md`. Última atualização: 24/08/2026.

## Identidade de movimento recomendada

O app é visualmente **cozy-playful**, mas o movimento atual é genérico (`ease` em ~90%). Adotar **Playful contido**:

```css
/* Brand Motion Identity — adicionar ao :root */
--ease-spring: cubic-bezier(0.34, 1.3, 0.64, 1);  /* assinatura: ~8% overshoot */
--ease-exit:   cubic-bezier(0.3, 0, 1, 1);        /* saídas (MD3 accelerate) */
--ease-soft:   cubic-bezier(0.2, 0, 0, 1);        /* on-screen */
--dur-fast:    120ms;   /* press, micro-feedback */
--dur-base:    200ms;   /* entradas padrão */
--dur-slow:    300ms;   /* modal, popover */
```

Mobile: durações ×0.8. Reduced-motion: a regra kill-all global existente já cobre tudo novo.

## Defeitos de motion (corrigir)

### 🔴 Crítico/Alto

| # | Violação | Evidência | Fix |
|---|---|---|---|
| M1 | `bubbleIn` replaya na thread inteira ao trocar de nota ou chegar sync | `.bubble { animation: bubbleIn .2s both }` + `renderMessages(true)` recria todos os nodes | Animar só bolhas novas (classe `.is-new` removida no `animationend`) |
| M2 | Zero animação de saída — popovers/modais/toasts somem com `display:none` | `.hidden { display:none !important }` | Classe `.leaving` com 150ms `var(--ease-exit)` antes do hide (exits = ~70% da entrada) |
| M3 | `transition: max-height .22s` nos filhos da árvore (propriedade de layout = jank) | styles.css L688 | `grid-template-rows: 0fr→1fr` ou medir `scrollHeight` via JS |
| M4 | Press scale aleatório: `.92/.94/.96/.98/.99` conforme o botão | 5 valores para a mesma interação | Padronizar `scale(.96)` com `--ease-spring` no release |
| M5 | `@keyframes flash` anima box-shadow (paint caro) | styles.css L1191, spread 0→14px | Pseudo-elemento com `opacity` |

### 🟡 Médio

| # | Issue | Fix |
|---|---|---|
| M6 | Árvore renderiza sem stagger — todos os `.tnode` juntos | Micro cascade 25ms/node, máx 8 visíveis, total <200ms |
| M7 | Popovers abrem sem origem (escala sempre do centro) | `transform-origin` dinâmico no ponto-gatilho (seta ▾ da bolha, nome da nota) |
| M8 | Troca de tema é corte seco | View Transitions API: crossfade em ~3 linhas |
| M9 | Toast some sem despedida | Slide up + fade 150ms `var(--ease-exit)` |

## Onde animar (oportunidades)

Ordenado por impacto ÷ esforço:

| # | Momento | Emoção alvo | Receita |
|---|---|---|---|
| A1 | **Checkbox marcado** ✅ | Joy (micro) | Tick desenhado (`stroke-dashoffset`, 150ms ease-out, delay 50ms) + scale pop 0.9→1.05→1 no box. É o gesto mais repetido do app |
| A2 | **Nota enviada** | Confiança | `pop-in` já existe ✓ — adicionar secondary: sombra da bolha chega 50ms depois; composer settle sutil |
| A3 | **Fixar mensagem** 📌 | Delight | Badge dourado escala de 0 com `ease-out-back`; hoje aparece pronto. Toast acompanha |
| A4 | **Sync reconectando** 🟠 | Calm | Breathing no ponto `sync-status.connecting`: scale 0.95↔1.05, 2s sine. Primeira camada ambient — só quando desconectado/conectando, NUNCA online |
| A5 | **Empty state (planta)** 🌱 | Cozy | Float vertical ±5px, 4s sine-in-out no SVG. Custo zero, morto no reduced-motion |
| A6 | **Nota chegando de outro usuário** | Surpresa leve | Slide-from-top 12px + fade + tint azulado que decai em ~800ms; hoje surge igual às demais |
| A7 | **Drag & drop de cadernos** | Feedback físico | Lift `scale(1.03)` + sombra cresce ao pegar (counter-motion); gap fecha 200ms ao soltar. Hoje só opacity .5 |
| A8 | **Abrir popover pelo gatilho** | Continuidade espacial | `transform-origin` calculado do botão que abriu |
| A9 | **Stagger na árvore (primeira carga)** | Vida | Cascade 25ms/node, budget <200ms |

## Onde NÃO animar (motion restraint)

Digitar no composer · scroll das mensagens · hover de itens da árvore · resize do textarea.
Interação de alta frequência = atenção proibida (custo se repete a cada disparo).

## Fases de implementação

| Fase | Escopo | Esforço | Status |
|---|---|---|---|
| **Fase 1 — Identidade** | Vars `--ease-*`/`--dur-*`; padronizar press scale (.96); corrigir M1, M3, M5 | Médio | [x] ✅ v74 |
| **Fase 2 — Saídas** | Sistema `.leaving` p/ popover/modal/toast/ctx-menu (M2, M9) | Médio | [x] ✅ v73/v74 (`hideWithExit`) |
| **Fase 3 — Delight** | A1 checkbox tick, A3 pin badge pop, A6 incoming-note tint | Pequeno | [x] ✅ v74 (A6 via `note:remote`) |
| **Fase 4 — Ambient** | A4 sync breathing, A5 planta flutuante (ambos mortos no reduced-motion) | Pequeno | [x] ✅ v74 |
| Backlog | M6/M9 stagger+origem, M7 transform-origin dinâmico, M8 view transitions, A7 dnd lift | — | [ ] |

## Checklist por animação nova (da skill)

- [ ] Propriedades: só `transform` + `opacity`
- [ ] Entrada ease-out, saída ease-in (~70% da duração)
- [ ] Máx 2 propriedades; nada opacity-only para estado importante
- [ ] Stagger total <500ms
- [ ] Respeitada pelo `prefers-reduced-motion`
- [ ] Suportável na 100ª visualização
