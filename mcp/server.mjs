#!/usr/bin/env node
// MCP do OpenReply: campanhas de comentário -> DM, contas, posts, logs e saúde da instância.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { api, BASE_URL } from "./lib.mjs";

const server = new McpServer({ name: "openreply", version: "0.2.0" });

const reply = (obj) => ({
  content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }],
  isError: obj && typeof obj === "object" && obj.ok === false,
});

const safe = (fn) => async (args) => {
  try {
    return reply(await fn(args));
  } catch (e) {
    return reply({ ok: false, error: e.message });
  }
};

const accountArg = z
  .string()
  .optional()
  .describe("ID interno da conta Instagram no OpenReply (ver openreply_accounts). Omitido = todas.");

// Campos de campanha aceitos pela API (POST/PATCH /api/automations).
const campaignFields = {
  name: z.string().max(100).describe("Nome da campanha"),
  goal: z.string().max(120).nullable().optional(),
  postId: z.string().nullable().optional().describe("ID da mídia (ver openreply_posts). Ou use matchAnyPost / pendingNextReel."),
  postUrl: z.string().url().nullable().optional(),
  pendingNextReel: z.boolean().optional().describe("Vincular ao próximo reel publicado"),
  matchAnyPost: z.boolean().optional().describe("Vale para qualquer post da conta"),
  keywords: z.array(z.string().min(1).max(50)).max(10).optional().describe("Palavras-chave (até 10)"),
  matchAnyWord: z.boolean().optional().describe("Dispara com qualquer comentário"),
  wholeWordMatch: z.boolean().optional().describe("true = palavra inteira; false = trecho"),
  dmTriggerEnabled: z.boolean().optional().describe("Também disparar por DM / resposta a story"),
  dmMessage: z.string().max(1000).describe("Mensagem da DM. Aceita {username}."),
  linkButtonLabel: z.string().max(20).nullable().optional(),
  trackedDestinationUrl: z.string().nullable().optional().describe("URL do link (vira link rastreado). '' remove."),
  secondaryDestinationUrl: z.string().nullable().optional(),
  secondaryButtonLabel: z.string().max(20).nullable().optional(),
  openingDmEnabled: z.boolean().optional().describe("DM de abertura com botão antes do link"),
  openingDmMessage: z.string().max(1000).nullable().optional(),
  openingDmButtonLabel: z.string().max(64).nullable().optional(),
  requireFollow: z.boolean().optional().describe("Exigir seguir antes de liberar o link"),
  followPromptMessage: z.string().max(1000).nullable().optional(),
  followPromptButtonLabel: z.string().max(20).nullable().optional(),
  followUpEnabled: z.boolean().optional(),
  followUpMessage: z.string().max(1000).nullable().optional(),
  followUpDelayMinutes: z.number().int().min(0).max(1440).optional(),
  publicReplyEnabled: z.boolean().optional().describe("Responder publicamente no comentário"),
  publicReplyMessages: z.array(z.string().max(1000)).max(10).optional().describe("Variações da resposta pública"),
  isActive: z.boolean().optional(),
};

const partial = Object.fromEntries(Object.entries(campaignFields).map(([k, v]) => [k, v.optional()]));
const strip = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

// ---------- Instância ----------

server.registerTool(
  "openreply_health",
  {
    description: `Saúde da instância do OpenReply (${BASE_URL || "OPENREPLY_URL"}): banco, Redis, fila de envio e heartbeat do worker. Não precisa de credencial.`,
    inputSchema: {},
  },
  safe(async () => api("GET", "/api/health", { auth: false }))
);

server.registerTool(
  "openreply_diagnostics",
  {
    description: "Diagnóstico detalhado (webhooks recentes, eventos operacionais, estado das contas).",
    inputSchema: {},
  },
  safe(async () => api("GET", "/api/admin/diagnostics"))
);

// ---------- Contas e posts ----------

server.registerTool(
  "openreply_accounts",
  { description: "Contas Instagram conectadas ao workspace (IDs internos, username, provider).", inputSchema: {} },
  safe(async () => api("GET", "/api/instagram/accounts"))
);

server.registerTool(
  "openreply_posts",
  {
    description: "Posts/reels recentes de uma conta, para escolher o postId de uma campanha.",
    inputSchema: {
      instagramAccountId: accountArg,
      limit: z.number().int().min(1).max(100).optional(),
      all: z.boolean().optional().describe("Carregar todos (mais lento)"),
    },
  },
  safe(async ({ instagramAccountId, limit, all }) =>
    api("GET", "/api/instagram/posts", { query: { instagramAccountId, limit, all: all ? "true" : undefined } })
  )
);

// ---------- Campanhas ----------

server.registerTool(
  "openreply_campaigns",
  {
    description: "Lista as campanhas com palavras-chave, post, status, links rastreados e contagem de DMs.",
    inputSchema: { instagramAccountId: accountArg },
  },
  safe(async ({ instagramAccountId }) => api("GET", "/api/automations", { query: { instagramAccountId } }))
);

server.registerTool(
  "openreply_campaign_create",
  {
    description:
      "Cria uma campanha. Precisa de postId, matchAnyPost ou pendingNextReel; e de keywords ou matchAnyWord. Altera a conta real: confirme o conteúdo com o usuário antes.",
    inputSchema: { instagramAccountId: accountArg, ...campaignFields },
  },
  safe(async (args) => api("POST", "/api/automations", { body: strip(args) }))
);

server.registerTool(
  "openreply_campaign_update",
  {
    description: "Atualiza campos de uma campanha (só os enviados). Altera a conta real.",
    inputSchema: { id: z.string().describe("ID da campanha"), ...partial, reportShareEnabled: z.boolean().optional() },
  },
  safe(async ({ id, ...rest }) => api("PATCH", "/api/automations", { query: { id }, body: strip(rest) }))
);

server.registerTool(
  "openreply_campaign_set_active",
  {
    description: "Ativa ou pausa uma campanha.",
    inputSchema: { id: z.string(), isActive: z.boolean() },
  },
  safe(async ({ id, isActive }) => api("PATCH", "/api/automations", { query: { id }, body: { isActive } }))
);

server.registerTool(
  "openreply_campaign_duplicate",
  { description: "Duplica uma campanha (a cópia nasce pausada ou conforme a regra do app).", inputSchema: { id: z.string() } },
  safe(async ({ id }) => api("POST", "/api/automations/duplicate", { query: { id } }))
);

server.registerTool(
  "openreply_campaign_delete",
  {
    description: "Apaga uma campanha e seus links rastreados. Irreversível: confirme com o usuário antes.",
    inputSchema: { id: z.string() },
  },
  safe(async ({ id }) => api("DELETE", "/api/automations", { query: { id } }))
);

// ---------- Resultados ----------

server.registerTool(
  "openreply_logs",
  {
    description: "Log de envios: cada DM enviada, pulada ou com falha, com o motivo.",
    inputSchema: {
      instagramAccountId: accountArg,
      status: z
        .enum(["SENT", "FAILED", "PENDING", "SKIPPED_RATE_LIMIT", "SKIPPED_PLAN_LIMIT", "SKIPPED_DEDUP"])
        .optional(),
      page: z.number().int().min(1).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
  },
  safe(async (q) => api("GET", "/api/logs", { query: q }))
);

server.registerTool(
  "openreply_stats",
  {
    description: "Números do painel: DMs, cliques, CTR, palavras-chave principais.",
    inputSchema: { instagramAccountId: accountArg },
  },
  safe(async ({ instagramAccountId }) => api("GET", "/api/dashboard/stats", { query: { instagramAccountId } }))
);

// ---------- Livre ----------

server.registerTool(
  "openreply_request",
  {
    description:
      "Chamada livre a qualquer rota /api/* do OpenReply (ex.: /api/instagram/conversations, /api/workspace/members). POST/PATCH/DELETE alteram dados reais.",
    inputSchema: {
      method: z.enum(["GET", "POST", "PATCH", "DELETE"]).default("GET"),
      path: z.string().regex(/^\/api\//).describe("Caminho começando em /api/"),
      query: z.record(z.string(), z.any()).optional(),
      body: z.any().optional(),
    },
  },
  safe(async ({ method, path, query, body }) => api(method, path, { query, body }))
);

await server.connect(new StdioServerTransport());
