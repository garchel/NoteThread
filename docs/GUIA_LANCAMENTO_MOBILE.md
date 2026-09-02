# Guia de Lançamento Mobile — etapas que dependem de você

> Gerado em 02/09/2026 pelo agente (verificado: política Play de 12 testers, PWABuilder/assetlinks, OAuth non-sensitive).
> Ordem = dependência. Cada etapa diz **o que entregar de volta** para o agente continuar.

## Visão geral

| # | Etapa | Onde | Tempo ativo | Espera externa | Desbloqueia |
|---|-------|------|-------------|----------------|-------------|
| 1 | Comprar domínio + apontar pra Vercel | Registrador + Vercel | ~30 min | Propagação DNS (min–2h) | OAuth, loja, assetlinks |
| 2 | Site URL + Redirect URLs no Supabase | Supabase Dashboard | ~10 min | — | Login em prod |
| 3 | OAuth consent screen → Production | Google Cloud Console | ~15 min | Instantâneo–2 dias (scopes não-sensíveis) | Sem cap de 100 usuários |
| 4 | Conta Sentry + DSN | sentry.io | ~20 min | — | Observabilidade real |
| 5 | Conta Play Console ($25) + criar app | play.google.com/console | ~1h | Verificação identidade 1–2 dias | Upload de AAB |
| 6 | Gerar AAB no PWABuilder | pwabuilder.com | ~1h | — | App instalável |
| 7 | Copiar SHA-256 → assetlinks.json | Play Console | ~10 min | — | TWA sem barra de endereço |
| 8 | Teste em device real | Seu Android | Meio dia | — | Confiança pré-loja |
| 9 | Closed testing 12×14 dias + production access | Play Console | ~30 min setup | **14 dias obrigatórios** + review 3–7 dias | Play Store pública |

> **Caminho crítico = etapa 9 (14 dias de relógio).** Comece as etapas 1–3 e 5 o quanto antes, em paralelo.

---

## 1. Domínio + Vercel

**Nome:** checagem RDAP de 02/09: `savechat.app`, `savechat.com`, `savechat.com.br`, `savechat.net` → **tomados**. `savechat.io` e `getsavechat.com` → **livres** (confirme preço/validade no registrador antes de pagar). `.io` no Cloudflare Registrar ou Namecheap (~US$35–60/ano).

**Passos:**
1. Compre o domínio no registrador.
2. Vercel → projeto SaveChat → **Settings → Domains → Add** → digite o domínio.
3. O Vercel mostra os registros DNS a criar. Geralmente:
   - `A` `@` → `76.76.21.21`
   - `CNAME` `www` → `cname.vercel-dns.com`
4. Cole esses valores no painel de DNS do registrador.
5. Aguarde propagação; o Vercel emite o certificado HTTPS (Let's Encrypt) sozinho.

**Entregue de volta:** "domínio no ar em https://…" → agente verifica HTTPS, roda Lighthouse em prod (IMP-2) e testa o login ponta a ponta.

---

## 2. Supabase Auth URLs

1. supabase.com/dashboard → projeto SaveChat → **Authentication → URL Configuration**.
2. **Site URL** → `https://SEUDOMINIO` (ex. `https://savechat.io`).
3. **Redirect URLs** → adicione `https://SEUDOMINIO/**` (mantenha os `http://localhost…` de dev).
4. Salve. (O callback do Google continua sendo o do Supabase — `https://…supabase.co/auth/v1/callback` — e não muda com seu domínio.)

**Erro se pular esta etapa:** `redirect_uri_mismatch` no 1º login em produção.

---

## 3. OAuth consent screen → Production (remove o cap de 100)

No **Google Cloud Console** (o mesmo projeto onde criou o OAuth client usado pelo Supabase — Authentication → Providers → Google mostra o client ID):

1. **APIs & Services → OAuth consent screen**.
2. Confira/preencha:
   - App name: `SaveChat`
   - User support e-mail: seu e-mail
   - App home page: `https://SEUDOMINIO`
   - App privacy policy: `https://SEUDOMINIO/privacy.html` (já servido pelo site)
   - Authorized domains: `SEUDOMINIO` (e o `…supabase.co` se listar)
3. Scopes: só `openid email profile` (**não-sensíveis**) — não exigem verificação longa.
4. **Publish app → confirmar "Push to production"**.
5. Status vira "In production". Para scopes não-sensíveis a aprovação é automatizada (instantânea a ~2 dias). Se o Google pedir verificação de marca mesmo assim, o app continua funcionando com o banner "não verificado" enquanto isso.

**Entregue de volta:** print/status "In production" → agente testa login com conta fora dos test users.

---

## 4. Sentry (IMP-5)

1. sentry.io → sign up (plano free: 5k erros/mês) — sem cartão.
2. **Create project → Platform "JavaScript"** → copiar o **DSN** (`https://xxx@oXXX.ingest.sentry.io/XXXX`).
3. Envie o DSN ao agente (ou cole em `public/index.html` na linha `window.SENTRY_DSN = ''`).
4. Agente cola, bumpa versão, publica e verifica eventos chegando no painel.

---

## 5. Play Console ($25, vitalício)

1. play.google.com/console → criar conta **pessoal** → pagar US$25 → verificar identidade (documento + selfie; aprovação 1–2 dias).
   > ⚠️ Conta pessoal criada após 13/11/2023 exige **closed testing 12×14 dias** (etapa 9). Conta de organização dispensa, mas exige D-U-N-S e verificação de CNPJ — não vale a pena para este app.
2. **Create app**: nome `SaveChat: Notas como Conversas`, idioma `pt-BR`, App (não Game), Free.
3. **Store listing**: cole tudo de `docs/STORE_LISTING.md` (título, descrições prontos). Privacy policy URL: `https://SEUDOMINIO/privacy.html`.
4. **App content**:
   - Privacy policy: mesma URL acima.
   - Data safety: siga a tabela em `docs/STORE_LISTING.md` (coleta e-mail + conteúdo do usuário; criptografia em trânsito; exclusão via "Apagar tudo").
   - Content rating: questionário (~4 respostas — app de notas, sem conteúdo gerado compartilhado) → resultado "Todos".
   - Target audience: 13+; Ads: não.
5. Deixe o app em rascunho — o AAB vem na etapa 6.

**Entregue de volta:** nome do package escolhido (ex. `com.savechat.app` — **imutável depois de publicado**) para o agente conferir com o manifest antes de gerar o AAB.

---

## 6. PWABuilder → AAB

Pré-requisito: etapas 1–3 prontas (o app precisa estar no ar com login funcionando).

1. pwabuilder.com → cole `https://SEUDOMINIO` → **Start**.
2. Confira o score (manifest completo, SW, ícones já estão ✅) → **Package for stores → Android**.
3. Opções:
   - **Package ID**: o escolhido na etapa 5 (ex. `com.savechat.app`).
   - App name: `SaveChat`.
   - **Signing key: "New signing key"** (o PWABuilder gera keystore e senhas).
4. Baixe o `.zip`: contém o **`.aab`**, `signing.keystore` e `signing-key-info.txt`.
5. **Guarde os 3 arquivos para sempre** (1Password/drive pessoal, fora do repo): perder o keystore = não consegue atualizar o app. O agente também salva os nomes/campos no doc de release.
6. Play Console → **Testing → Closed testing → Create release** → upload do `.aab`.

---

## 7. assetlinks.json (TWA sem barra de endereço)

**Pegadinha clássica:** o SHA-256 correto é o do **app signing key do Google**, NÃO o da keystore do PWABuilder.

1. Play Console → seu app → **Setup → App integrity** → copie o **SHA-256 do app signing key cert**.
2. Envie ao agente junto com o package ID.
3. Agente cria `public/.well-known/assetlinks.json` com o fingerprint, publica e valida (`https://SEUDOMINIO/.well-known/assetlinks.json`).

> Sem este arquivo servido no domínio: o TWA abre com barra de endereço (e em Chrome 86+ o requisito de verificação digital pode derrubar o app). É bloqueador de UX, não de upload.

---

## 8. Teste em device real (LB-M3)

Abra `https://SEUDOMINIO` no Android (Chrome), login com sua conta Google, e percorra:

- [ ] Login Google + sincronização (status 🟢)
- [ ] Criar conversa/caderno; long-press em mensagem (menu) e em conversa (ctx-menu)
- [ ] Swipe sidebar ↔ chat; teclado abre sem cobrir o composer
- [ ] Notch/safe-area (se o device tiver); pull-to-refresh; pinch no lightbox de imagem
- [ ] Busca com resultados longos (o `40vh` precisa caber em tela pequena — iPhone SE/Android pequeno)
- [ ] Lembrete disparando notificação; toque abre a conversa
- [ ] Instalar como PWA (menu Chrome → "Instalar app") e abrir standalone
- [ ] "Apagar tudo" → recarregar → dados não voltam (valida delete remoto)

**Entregue de volta:** lista de itens com ✅/❌ → agente corrige o que aparecer.

---

## 9. Closed testing 12×14 + production access (o relógio do Google)

Regra atual (conf. pesquisa 02/09/2026; atualizada de 20→12 testers em dez/2024):

- Contas **pessoais criadas após 13/11/2023** precisam de: release em **Closed testing** com **≥12 testers opt-in** por **14 dias corridos** antes de publicar em produção.
- A contagem dos 14 dias só inicia quando a release **é aprovada** E os **12 já estão optados** → recrute os testers ANTES de subir o AAB.
- Tester conta = conta Google real em device real, aceita o opt-in link e **não sai do teste** (desinstalar não zera, mas sair da lista sim).
- Após os 14 dias: Dashboard → **Apply for production access** (questionário sobre o teste) → review ~3–7 dias → liberado produção.

**Passos:**
1. Monte lista de ≥12 e-mails (família/amigos; canais de WhatsApp resolvem) — peça 15–18 para folga.
2. Play Console → **Closed testing → Email lists** → criar lista com os e-mails.
3. Na release fechada (etapa 6), selecione essa lista → **Rollout**.
4. Aprovada → mande o **opt-in link** aos testers: eles abrem no Android, aceitam, instalam.
5. Monitore Play Console → "Testers opted in: N" até ≥12.
6. Agende 14 dias; depois volte ao Dashboard e responda o questionário de production access.

---

## Resumo do que me entregar

| Após etapa… | Me mande | Eu faço |
|---|---|---|
| 1 | Domínio no ar | HTTPS + Lighthouse prod + teste de login |
| 3 | "OAuth In production" | Login com conta externa |
| 4 | DSN do Sentry | Colar em index.html, bump versão, verificar eventos |
| 5/6 | Package ID | Conferir manifest + opções PWABuilder junto |
| 7 | SHA-256 (App integrity) | `public/.well-known/assetlinks.json` + validar |
| 8 | Checklist ✅/❌ | Correções |
| 9 | "12 optados, relógio correto" | Preparar release de produção (listing final, version bump) |

## Notas técnicas de apoio (já verificado no repo)

- `vercel.json` é domain-agnostic (CSP com `'self'`) — nada a mudar no código quando o domínio entrar.
- Manifest `start_url` relativo → funciona em qualquer host.
- Play exige target API recente no AAB — PWABuilder gera com target atual por padrão.
- Assets de loja prontos: ícone 512, feature graphic 1024×500, 2 screenshots (`docs/STORE_LISTING.md`).
