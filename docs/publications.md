# Publicações (publicar e agendar posts)

Recurso desta versão em português. Publica foto, carrossel (2 a 10 itens) e reel no Instagram, na hora ou num horário marcado, sem depender do seu computador.

## Como funciona
1. Você sobe a mídia em **Publicações → Nova publicação** (JPEG/PNG até 8 MB, MP4/MOV até 300 MB) ou manda pelo MCP (`openreply_publication_create`).
2. O arquivo fica no volume do servidor e é servido em `/api/media/{id}`. É de lá que a Meta baixa.
3. O cron `publish-due` roda a cada minuto (`scripts/cron.sh`). Quando chega o horário, ele cria o contêiner na Meta, espera o processamento (vídeo pode levar minutos) e publica.
4. Se a Meta falhar, ele tenta de novo em 2, 4 e 8 minutos. Depois disso a publicação fica como **Com erro**, com o motivo, e dá para tentar de novo pelo painel.
5. Se você escolheu uma campanha, ela recebe o post e liga sozinha assim que ele sai.

## Requisitos
- Conta conectada pelo **app da Meta** (Login do Instagram). O Zernio não publica.
- Permissão `instagram_business_content_publish` no app. Depois de habilitar, reconecte a conta em `/api/instagram/connect`. Isso atualiza o token e mantém as campanhas. Não use "Desconectar".
- Volume persistente para a mídia. No `docker-compose.coolify.yml` ele se chama `openreply-media`, montado em `MEDIA_DIR=/data/media`.
- `NEXTAUTH_URL` público em HTTPS: a Meta precisa alcançar `/api/media/{id}`.

## API
| Método | Rota | O que faz |
|---|---|---|
| POST | `/api/publications/media` | Sobe arquivos (multipart, campo `file`) ou registra URLs públicas (`{ urls: [{ url, kind }] }`) |
| POST | `/api/publications` | Cria: `{ mediaIds, caption, scheduledAt?, mediaType?, automationId? }`. Sem `scheduledAt` = publica agora |
| GET | `/api/publications` | Lista (filtro `status`) |
| PATCH | `/api/publications/{id}` | Muda legenda, horário ou campanha (antes de publicar) |
| DELETE | `/api/publications/{id}` | Cancela |
| POST | `/api/publications/{id}/publish` | Publica agora ou tenta de novo |
| GET | `/api/publications/quota` | Cota das últimas 24h (a Meta limita a 100). Também confirma a permissão |

A Meta limita a 100 publicações por conta a cada 24 horas.
