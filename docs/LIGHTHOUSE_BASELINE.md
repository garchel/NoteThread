# Lighthouse Baseline — ChatSolo

> Primeira medição registrada: 24/08/2026 (IMP-2 / W2.6).
> Ambiente local (`npm run dev`), Edge headless, viewport default, categoria PWA medida separadamente (Lighthouse 13 removeu a categoria PWA — checks de instalabilidade validados via manifest/SW).

## Baseline v71 (24/08/2026)

| Categoria | Score |
|---|---|
| Performance | **82** |
| Accessibility | **100** ✅ |
| Best Practices | **100** ✅ |
| SEO | **91** |

### Métricas
| Métrica | Valor |
|---|---|
| First Contentful Paint | 2.7s |
| Largest Contentful Paint | 4.9s |
| Total Blocking Time | 0ms |
| Cumulative Layout Shift | 0.005 ✅ |

### Oportunidades de performance (para ≥90)
1. **Multiple page redirects (~1.2s)** — o dev server redireciona `/` → `./index.html`; em prod na Vercel isso não existe → esperado ganhar ~1.2s no deploy real
2. Minify CSS/JS (~50ms) — build step opcional
3. Reduce unused JavaScript (27 KiB) — emojis.js/sound.js podem virar dynamic import

### Notas
- A11y chegou a 100 após escurecer os fundos do botão "Friendly names" (#22c55e→#15803d, #ef4444→#b91c1c)
- Re-medir na URL de produção da Vercel antes de submeter à Play Store
- Meta W2.6: PWA instalável + Performance ≥90 em prod (redirect não existirá lá)
