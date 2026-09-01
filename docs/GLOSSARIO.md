# Glossário — Terminologia Oficial do SaveChat

> Norma para toda a UI, documentação e comunicação. Última atualização: 25/08/2026.
> Princípio: **verbos e micro-ações em linguagem de chat; substantivos globais em linguagem de notas.**
> Público-alvo: pessoas que usam WhatsApp/Telegram para salvar informações.

## Os 3 termos

| Termo (UI) | Código interno | Definição | Exemplo de uso |
|---|---|---|---|
| **Conversa** | `thread` | O "chat" — contém mensagens. Tem nome, cor e pode ficar dentro de um caderno. | "Nova conversa", "Renomear conversa", "Excluir conversa" |
| **Mensagem** | `note` | Cada unidade enviada dentro de uma conversa (as bolhas). Pode ter checklist, imagem, tags, lembrete. | "Enviar mensagem", "Nova mensagem em X" |
| **Caderno** | `folder` | Agrupador de conversas na sidebar ("MEUS CADERNOS"). | "Novo caderno", "mover para caderno" |

## Regra de ouro

- **Dentro da conversa** = linguagem de chat → *mensagem*
- **Fora dela** (busca, exportação, marketing) = linguagem de notas → *"suas notas"*

O usuário **age** como no WhatsApp ("enviar mensagem") mas **pensa** sobre o acervo como notas ("buscar entre minhas notas").

## Mapeamento correto vs incorreto

| ❌ Errado | ✅ Certo | Motivo |
|---|---|---|
| Botão "NOVA ANOTAÇÃO" | "NOVA CONVERSA" | cria thread, não note |
| "Excluir nota" no menu da conversa | "Excluir conversa" | apaga a thread inteira |
| "Escolha um caderno…" (empty state) | "Crie sua primeira conversa" | o item listado é thread |
| "Renomear nota" (modal do título) | "Renomear conversa" | renomeia a thread |
| "in:caderno" (busca) | "in:conversa" | filtra por nome de thread |

## Casos que permanecem

- **"Buscar notas…"** ✓ — ação global sobre o acervo
- **"Exportar notas (JSON)"** ✓ — global
- **"Apagar tudo"** — remove conversas, cadernos e mensagens
- **Placeholder do composer**: "Enviar mensagem…" — ato de escrever
- **Código interno**: mantém `thread/note/folder` (refactor sem ganho)

## Filtros de busca

- `in:<nome>` → filtra por **conversa** (aceita qualquer substring do nome; `in:trabalho`, `in:conversa`)
- `#tag` → filtra por tag da mensagem
- `depois:` / `antes:` → data das mensagens
