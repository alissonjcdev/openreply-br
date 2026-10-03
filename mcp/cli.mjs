#!/usr/bin/env node
// Configura a credencial do MCP do OpenReply.
//
//   gen-token     cria um token novo. No macOS ele vai direto pro Keychain; em
//                 outros sistemas é mostrado uma única vez pra você pôr em
//                 OPENREPLY_TOKEN. Mostra o SHA-256 que vai no servidor
//                 (OPENREPLY_API_TOKEN_SHA256): o servidor nunca guarda o token.
//   set-token     salva no Keychain um token copiado (lê da área de transferência).
//   set-session   salva o cookie de sessão do navegador, como alternativa ao token.
//   check         testa a credencial contra OPENREPLY_URL.
//   clear         remove as credenciais do Keychain.
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { keychainSet, keychainDelete, hasCredential, api, BASE_URL } from "./lib.mjs";

const IS_MAC = process.platform === "darwin";
const clip = () => execFileSync("pbpaste", { encoding: "utf8" }).trim();
const clearClip = () => execFileSync("sh", ["-c", "printf '' | pbcopy"]);
const [cmd] = process.argv.slice(2);

async function check() {
  const r = await api("GET", "/api/instagram/accounts");
  console.log(r.ok ? `ok: credencial aceita por ${BASE_URL}` : `falhou (${r.status}): ${JSON.stringify(r.data).slice(0, 200)}`);
}

if (cmd === "gen-token") {
  const token = randomBytes(36).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  if (IS_MAC) {
    keychainSet("token", token);
    console.log("Token novo salvo no Keychain do macOS.");
  } else {
    console.log("Token (guarde agora, ele não aparece de novo):");
    console.log(`  OPENREPLY_TOKEN=${token}`);
  }
  console.log("\nNo servidor do OpenReply, defina e faça o redeploy:");
  console.log(`  OPENREPLY_API_TOKEN_SHA256=${hash}`);
  console.log("  OPENREPLY_API_USER_EMAIL=<o e-mail com que você entra no painel>");
} else if (cmd === "set-session" || cmd === "set-token") {
  if (!IS_MAC) {
    console.error("No Windows/Linux, use a variável OPENREPLY_TOKEN em vez do Keychain.");
    process.exit(1);
  }
  const v = clip();
  if (!v) {
    console.error("área de transferência vazia");
    process.exit(1);
  }
  keychainSet(cmd === "set-token" ? "token" : "session", v);
  clearClip();
  console.log(`${cmd === "set-token" ? "token" : "sessão"} salvo no Keychain (${v.length} caracteres)`);
  if (BASE_URL) await check();
} else if (cmd === "clear") {
  keychainDelete("token");
  keychainDelete("session");
  console.log("credenciais removidas");
} else if (cmd === "check") {
  if (!hasCredential()) console.log("sem credencial");
  else await check();
} else {
  console.log(`uso: node mcp/cli.mjs <gen-token | set-token | set-session | check | clear>
  OPENREPLY_URL=${BASE_URL || "(não definido)"}`);
}
