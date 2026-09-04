# Changelog — SaveChat

Todas as mudanças notáveis serão documentadas aqui (semver).

## [1.4.1] — 2026-09-02
### Adicionado
- Botão "Atualizar app" no menu do perfil: verificação automática na abertura (compara com o CHANGELOG servido), indicador de status (atualizado ✓ / nova versão disponível / offline) e instalação da nova versão no clique
- Ponto âmbar no avatar quando há versão nova disponível
- Atualização controlada: o Service Worker agora espera o clique (SKIP_WAITING) em vez de assumir a nova versão sozinho
- Versão única centralizada em `window.APP_VERSION` (Sobre, Sentry e verificação usam a mesma fonte)

### Melhorado
- Navegação e CHANGELOG agora são network-first no Service Worker — a versão nova chega sem duplo reload

## [1.4.0] — 2026-09-01
### Adicionado
- Rebrand final para SaveChat: logo própria em toda a UI, favicon com badge de lembretes, ícones PWA dedicados (any + maskable)
- Geração de assets de loja: screenshots 824×1830 no manifest, feature graphic 1024×500, textos da Play em docs/STORE_LISTING.md
- Movido para public/: este changelog agora é servido pelo site — o toast "Nova versão" lê o que mudou de verdade (antes 404 em prod)
- Terminologia oficial na UI (docs/GLOSSARIO.md): Conversa, Mensagem, Caderno
- Menu do título da conversa com backlinks "Mencionado em"
- Motion fino: transform-origin dinâmico nos popovers, crossfade na troca de tema (View Transitions), lift no drag & drop da árvore
- Emojis com carregamento sob demanda; pipeline de build minificado (dist/) para preview de prod
- Hardening do banco: EXECUTE público revogado no event trigger de auto-RLS (advisors de segurança do Supabase)

### Corrigido
- E-mail de contato legal (privacidade/termos) apontava para domínio da marca antiga
- Versão sincronizada: package.json, tela Sobre, Sentry release e tag git

## [1.3.0] — 2026-08-24
### Adicionado
- Rebrand para ChatSolo: logo própria (login, explorer, favicon, manifest PWA)
- Import de backup JSON (merge por id, sem duplicar) — complementa o export existente
- Menu dropdown no nome da nota: backlinks "Mencionado em" + opção Convidar (placeholder)
- Preview de nota linkada em card fixo (estilo card pinado), sempre visível independente do scroll
- Menção com aparência de chip-link no campo de input (camada espelho)

### Corrigido
- Settings popover cortado/travado ao alternar notas (reset de maxHeight/overflow a cada abertura)
- Fonte branca nos temas dark/midnight (nome do usuário, tela de login)
- Bolhas dos temas claros com fundo saturado + texto branco (--on-bubble; contraste 3.2–4.3:1)
- Seta ▾ da mensagem movida para o canto superior direito
- Checkbox de checklist só alterna ao clicar no próprio checkbox
- Foco do composer com raio arredondado coerente (24px)
- Scrollbar customizada no fluxo de mensagens

### Acessibilidade
- Touch targets ≥44px via hit-area ::after em 6 controles pequenos
- Focus trap no modal + Esc fecha + foco devolvido ao gatilho

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
