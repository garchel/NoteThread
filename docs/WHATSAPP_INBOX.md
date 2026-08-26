# WhatsApp → SaveChat (Inbox via Meta Cloud API)

> Planejamento para versão futura. **Não faz parte do escopo do lançamento inicial.**
> Ideia: o usuário conecta sua conta WhatsApp ao SaveChat; mensagens que ele envia para o número oficial do SaveChat (ex.: contato salvo como "SaveChat Notas") entram automaticamente como Mensagens numa Conversa do app.

## Decisão de arquitetura (já fechada)

- **Meta Cloud API (oficial)** desde o dia 1 — evita refazer integração depois. Sem Evolution API / automação não-oficial.
- **Receptor = Supabase Edge Function** — não recriamos backend Node (deletado por decisão do ROADMAP_ESTAVEL). Free tier do Supabase atende o início.
- **Mudança de UX vs ideia original**: em vez de escutar o grupo particular do usuário (impossível na API oficial), o usuário **conversa com o número do SaveChat**. O fluxo mental continua o mesmo: mandou lá, apareceu aqui.

## Visão geral do fluxo

```
Usuário (WhatsApp) ──msg──► Número SaveChat (Meta Cloud API)
                                   │ webhook (POST assinado)
                                   ▼
                    Edge Function: verify-signature + dedup
                                   │
                     ┌─────────────┴─────────────┐
                     │ rota FIXA (sem LLM)       │ rota INTELIGENTE (LLM escolhe a conversa)
                     ▼                           ▼
              conversa vinculada          LLM classifica entre as conversas do usuário
                     └─────────────┬─────────────┘
                                   ▼
                    INSERT em notes (Supabase) ──► Realtime aparece no app
```

## Camadas

| # | Camada | Responsabilidade |
|---|--------|------------------|
| 1 | Webhook (Edge Function) | Verificação GET (`hub.challenge`), validação de assinatura `X-Hub-Signature-256`, dedup por `message.id`, enfileirar processamento |
| 2 | Pareamento (onboarding) | Associar `wa_id` (telefone) → `user_id` → conversa destino |
| 3 | Ingest | Normalizar texto/mídia/checklists para o formato de note; INSERT com RLS correta |
| 4 | Roteador LLM (opcional) | Escolher a conversa certa quando não há vínculo fixo |
| 5 | Settings UI | Conectar/desconectar WhatsApp, escolher modo (fixa/inteligente), status da conexão |
| 6 | Feedback & confiabilidade | Confirmação no WhatsApp, erros, opt-out |

---

## Fase W0 — Spike / pré-requisitos externos (config, não código)

- [ ] Criar Meta App + produto WhatsApp (Meta for Developers).
- [ ] Número de telefone dedicado para o SaveChat (não pode ser número de uso pessoal; pode ser virtual/eSIM).
- [ ] Conta Meta Business criada; iniciar verificação de negócio (obrigatória para subir limites — sem ela: ~250 conversas únicas/dia, suficiente para beta).
- [ ] Testar webhook de entrada no painel da Meta com o número de teste (envia mensagem → recebe payload) **antes de escrever qualquer código nosso**.
- Critério de aceite: payload real de mensagem recebido num request-bin/página de teste.

## Fase W1 — Infraestrutura mínima (Edge Function + tabela)

- [ ] Edge Function `wa-webhook`:
  - GET → verificação `hub.verify_token` / `hub.challenge`.
  - POST → validar HMAC SHA-256 do `X-Hub-Signature-256` contra o app secret; responder 200 rápido (Meta reentrega se timeout).
- [ ] Migração SQL (Supabase):
  - `wa_links (user_id, wa_id, mode 'fixed'|'smart', thread_id, active, created_at)` — 1 linha por usuário.
  - `wa_inbox_log (message_id unique, user_id, payload jsonb, status 'received'|'inserted'|'rejected', error)` — dedup + auditoria.
- [ ] RLS: só o próprio usuário lê/escreve suas linhas; a Function usa service_role isolado.
- Aceite: curl simulando GET/POST da Meta passa/falha conforme esperado; mensagem repetida é ignorada (dedup).

## Fase W2 — Pareamento do usuário (onboarding)

- [ ] Settings → nova seção "WhatsApp": botão **Conectar WhatsApp** mostra um código curto (ex.: `SC-4F7K`), válido 15 min.
- [ ] Usuário envia esse código por mensagem ao número do SaveChat.
- [ ] Edge Function reconhece o código → grava `wa_links` → responde no WhatsApp: "✅ Conectado! Agora envie mensagens e elas chegam no SaveChat."
- [ ] Desconectar na UI desativa o link (mensagens passam a ser ignoradas com resposta educada).
- Aceite: e2e manual — código gerado, enviado pelo WhatsApp real, link criado, desconexão funciona.

## Fase W3 — Ingest básica (rota fixa)

- [ ] Resolver destinatário: `wa_id` → link ativo → `thread_id` fixo.
- [ ] Normalização da mensagem para note:
  - Texto puro → texto da mensagem.
  - Linhas `[ ]` / `[x]` → checklist nativa do app (renderiza de graça).
  - Mídia (imagem/áudio/doc) → upload no Storage Supabase + referência na note (pode ser Fase W6 se pesado).
  - Timestamp do WhatsApp preservado na meta da mensagem.
- [ ] Resposta automática opcional (janela de serviço 24h = grátis): "📥 Recebido no SaveChat" — configurável (on/off).
- Aceite: mensagem enviada no WhatsApp aparece na conversa vinculada em todos os dispositivos via Realtime, offline-first intacto.

## Fase W4 — Roteador LLM (modo inteligente)

- [ ] Toggle por usuário: **Fixa** (conversa única vinculada, sem LLM — padrão, custo zero) | **Inteligente** (LLM escolhe a conversa).
- [ ] Provedor: Gemini Flash (custo mínimo; API key server-side na Edge Function, nunca no cliente).
- [ ] Contrato do prompt: entrada = texto da mensagem + lista compacta das conversas do usuário (nome, caderno, últimas 2–3 mensagens truncadas, ~500 chars cada, cap de ~20 conversas); saída JSON estrito `{thread_id, confidence}`.
- [ ] Política de confiança:
  - `confidence ≥ 0.8` → insere na conversa escolhida; prefixo discreto na meta "via WhatsApp".
  - `< 0.8` → cai na conversa padrão **"Inbox WhatsApp"** (criada automaticamente) + resposta no WhatsApp sugerindo: "Não tenho certeza da conversa. Enviei em Inbox. Diga 'mover para X' para corrigir."
- [ ] Comando de correção: próxima msg "mover para <nome>" reclassifica a anterior (match fuzzy de nome, sem LLM).
- [ ] Guardrails: timeout 8s → fallback Inbox; erro de LLM → fallback Inbox; log da decisão em `wa_inbox_log` para auditoria/custo.
- Aceite: com 5+ conversas semeadas, mensagem "comprar leite" vai pra lista de compras e "ideia de post" vai pra conversa de ideias; caso ambíguo cai no Inbox.

## Fase W5 — Settings UI completa

- [ ] Seção WhatsApp nas configurações (seguindo padrão visual atual, `.btn` variants):
  - Estado: conectado/desconectado + telefone mascarado.
  - Conversa destino (dropdown) quando modo Fixa.
  - Toggle Fixa/Inteligente com explicação de 1 linha.
  - Toggle "confirmar recebimento no WhatsApp".
  - Botão Desconectar (confirmação modal).
- [ ] Terminologia do glossário (v77): falar em "Conversa"/"Mensagem", nunca "anotação".
- [ ] Toast Sonner nos fluxos (conectado, desconectado, erro).
- Aceite: todos os estados visíveis e operáveis; mobile 375px ok (touch targets ≥44px).

## Fase W6 — Robustez & produção

- [ ] Mídia do WhatsApp → Supabase Storage (limite de tamanho, expiração do link assinado da Meta — URLs de mídia vencem em ~24h, baixar no ingest).
- [ ] Rate limiting simples por usuário (ex.: máx 60 msgs/h) para abuso.
- [ ] Opt-out LGPD: comando "SAIR" no WhatsApp desativa o link; seção de privacidade atualizada (dados transitam pela Meta).
- [ ] Página de status/erros visível no app quando entregas falham (banner estilo `#sync-error-banner`).
- [ ] Monitoramento: contagem em `wa_inbox_log`, alerta simples se taxa de `rejected` subir.
- [ ] Subir tier na Meta após verificação de negócio (se houver demanda real).

---

## Custos estimados

| Item | Custo |
|------|-------|
| Webhooks de entrada (receber mensagens) | Grátis e ilimitados |
| Resposta dentro da janela de serviço 24h | Grátis |
| Templates fora da janela (não usaremos) | Pago por conversa — evitar |
| Supabase Edge Functions + Postgres | Free tier no início; ~US$25/mês no Pro se escalar |
| Gemini Flash no roteador | Centavos/mês no volume individual (free tier cobre testes) |
| Número dedicado | Variável (eSIM/virtual) |

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Aprovação/verificação Meta lenta | Começar W0 com antecedência; funcionalidade independe do lançamento |
| Limite de 250 conversas/dia sem verificação | Suficiente para beta; verificar antes de divulgar forte |
| LLM erra o destino | Fallback Inbox + correção por comando; modo Fixa como padrão seguro |
| Privacidade (mensagens passam pela Meta e pela nossa Function) | Transparência na página de privacidade; log mínimo; opt-out fácil |
| Acoplamento: ingest quebrar sync do app | Ingest é insert direto no Supabase — Realtime existente absorve; nada toca o código do front até W5 |

## Ordem recomendada

W0 (config externa, paralela a qualquer coisa) → W1 → W2 → W3 (aqui já é útil de verdade) → W4 (o diferencial inteligente) → W5 → W6.

W0–W3 podem ser feitas sem tocar em nenhuma linha do front-end atual.
