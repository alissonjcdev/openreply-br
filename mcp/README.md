# MCP do OpenReply

Conecta o Claude (Claude Desktop ou Claude Code) ao seu OpenReply. Você pede numa
conversa e ele cria, edita, pausa e apaga campanhas, mostra os posts, os registros
de envio e os números do painel.

## Ferramentas

| ferramenta | o que faz |
|---|---|
| `openreply_health` | saúde da instância (banco, Redis, fila, worker) |
| `openreply_accounts` | contas do Instagram conectadas |
| `openreply_posts` | posts e reels recentes, pra escolher onde a campanha roda |
| `openreply_campaigns` | lista as campanhas com números |
| `openreply_campaign_create` | cria uma campanha |
| `openreply_campaign_update` | altera uma campanha |
| `openreply_campaign_set_active` | ativa ou pausa |
| `openreply_campaign_duplicate` | duplica |
| `openreply_campaign_delete` | apaga |
| `openreply_logs` | registro de cada DM enviada, pulada ou com falha |
| `openreply_stats` | DMs, cliques, CTR, palavras que mais puxaram |
| `openreply_diagnostics` | diagnóstico detalhado |
| `openreply_request` | chamada livre a qualquer rota `/api/*` |

## Instalação

Precisa de Node 20+.

```bash
cd mcp
npm install
```

### 1. Crie o token

```bash
OPENREPLY_URL=https://reply.seudominio.com node cli.mjs gen-token
```

O comando mostra o `OPENREPLY_API_TOKEN_SHA256`. Coloque no servidor do OpenReply,
junto com `OPENREPLY_API_USER_EMAIL` (o e-mail com que você entra no painel), e faça
o redeploy. O servidor guarda só o hash; o token em si fica no Keychain do macOS
ou, em outros sistemas, na variável `OPENREPLY_TOKEN`.

Teste:

```bash
OPENREPLY_URL=https://reply.seudominio.com node cli.mjs check
```

### 2. Registre no Claude

Claude Code:

```bash
claude mcp add --scope user openreply \
  -e OPENREPLY_URL=https://reply.seudominio.com \
  -- node /caminho/para/openreply/mcp/server.mjs
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "openreply": {
      "command": "node",
      "args": ["/caminho/para/openreply/mcp/server.mjs"],
      "env": { "OPENREPLY_URL": "https://reply.seudominio.com" }
    }
  }
}
```

Fora do macOS, acrescente `"OPENREPLY_TOKEN": "<token>"` no `env`.

## Segurança

- O token age como o usuário de `OPENREPLY_API_USER_EMAIL`, com o mesmo papel dele.
- Pra revogar, apague `OPENREPLY_API_TOKEN_SHA256` no servidor (ou gere outro).
- As ferramentas que criam, alteram ou apagam campanhas mexem na sua conta real.
