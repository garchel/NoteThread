# Design Tokens — NoteThread

> Tokens extraídos de `public/styles.css:1`. Use como fonte da verdade para Figma e código.
> Atualizado em 24/08/2026 — reflete o tema padrão **cozy** do `:root` (o doc antigo mostrava valores lavender que hoje são só uma variação).

## Cores (tema padrão `:root` cozy)
- `--bg: #F8F5EE` (fundo geral)
- `--bg-elev: #ffffff` (elevado)
- `--bg-chat: #FFFBF5` (chat)
- `--bg-explorer: #FFFDFA` · `--bg-chat-inner: #FFFDF8`
- `--text: #3A2E2A` (texto principal)
- `--text-dim: #786E67` (secundário — WCAG AA ≥4.5:1, corrigido em `0fd7230`)
- `--text-light: #796D60` (terciário, também ≥4.5:1)
- `--border: #F0E6D3` · `--border-light: #F5EFE6`
- `--accent: #E28D42` (primária laranja) · `--accent-teal: #589B99`
- `--accent-soft: #FFF0E0` · `--accent-teal-soft: #E6F2F2`
- `--bubble-me: #E28D42` → `--bubble-me-2: #D97A2B` (gradiente bolha própria)
- `--bubble-cream/--blue/--gray/--sys`: fundos de bolhas remotas/tipadas
- `--on-accent: #3A2E2A` (texto sobre accent — temas claros; branco em dark/midnight)
- `--danger: #e5484d` · `--gold: #f5b942` · `--ok: #589B99`

**Superfícies 60/30/10:** `--surf-chat` > `--surf-explorer` > `--surf-nav`

**Temas** via `data-theme`: `lavender`, `dark`, `mint`, `peach`, `ocean`, `midnight` (+ `auto` segue sistema). Cada um sobrescreve só as vars de cor. Todos os tokens de texto validados ≥ 4.5:1 contra seus fundos.

## Tipografia
| Token | Valor |
|---|---|
| `--text-xs` | 11px |
| `--text-sm` | 12px |
| `--text-base` | 13.5px |
| `--text-md` | 15px |
| `--text-lg` | 17px |
| `--text-xl` | 20px |
| `--text-2xl` | 24px |

- `--app-font: "Quicksand", "Plus Jakarta Sans", sans-serif` (interface)
- `--heading-font: "Baloo 2", "Quicksand", sans-serif` (títulos)
- Selecionável em Configurações → Fonte (Quicksand, Comfortaa, Baloo 2, Fredoka, Nunito)

## Espaçamento (4/8)
`--space-1: 4px` · `--space-2: 8px` · `--space-3: 12px` · `--space-4: 16px` · `--space-5: 20px` · `--space-6: 24px`

## Outros
- `--sidebar-w: 300px` · `--nav-w: 64px`
- `--radius: 20px` · `--radius-lg: 24px`
- `--shadow-sm/md/lg` (tom quente rgba(139,111,78,…))
- Densidade: `data-density="comfortable" | "compact"`
- Glifos decorativos por tema: `--glyph-stars/hearts/clouds/leaves/circles`

## Uso no Figma
- Criar styles com mesmos nomes e valores (usar o tema alvo, não copiar o cozy cegamente).
- Auto-layout com `space` tokens.
- Trocar tema via `data-theme` no frame.
