// Cliente HTTP da API do OpenReply.
// Endereço: variável OPENREPLY_URL (ex.: https://reply.seudominio.com).
// Credencial: variável OPENREPLY_TOKEN, ou o Keychain do macOS (serviço openreply-mcp).
import { execFileSync } from "node:child_process";

export const KEYCHAIN_SERVICE = "openreply-mcp";
export const BASE_URL = (process.env.OPENREPLY_URL || "").replace(/\/$/, "");
const IS_MAC = process.platform === "darwin";

export function keychainGet(account) {
  if (!IS_MAC) return null;
  try {
    return execFileSync("security", ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account, "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

export function keychainSet(account, secret) {
  if (!IS_MAC) throw new Error("Keychain só existe no macOS: use a variável OPENREPLY_TOKEN.");
  execFileSync("security", ["add-generic-password", "-U", "-s", KEYCHAIN_SERVICE, "-a", account, "-w", secret], {
    stdio: "ignore",
  });
}

export function keychainDelete(account) {
  if (!IS_MAC) return;
  try {
    execFileSync("security", ["delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account], { stdio: "ignore" });
  } catch {}
}

// Token de API (Bearer) tem prioridade; senão, cookie de sessão do navegador.
function authHeaders() {
  const token = process.env.OPENREPLY_TOKEN || keychainGet("token");
  if (token) return { authorization: `Bearer ${token}` };
  const session = keychainGet("session");
  if (session) return { cookie: `__Secure-authjs.session-token=${session}` };
  return {};
}

export function hasCredential() {
  return Boolean(process.env.OPENREPLY_TOKEN || keychainGet("token") || keychainGet("session"));
}

export async function api(method, path, { query, body, auth = true } = {}) {
  if (!BASE_URL) throw new Error("Defina OPENREPLY_URL com o endereço do seu OpenReply (ex.: https://reply.seudominio.com).");
  const url = new URL(BASE_URL + path);
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    method,
    redirect: "manual",
    headers: {
      accept: "application/json",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(auth ? authHeaders() : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text.slice(0, 2000);
  }
  const ok = res.ok;
  if (res.status === 401) {
    return {
      ok,
      status: res.status,
      data,
      hint: hasCredential()
        ? "Credencial recusada: renove com `node mcp/cli.mjs set-token` (ou defina OPENREPLY_TOKEN)."
        : "Sem credencial: rode `node mcp/cli.mjs set-token` (ou defina OPENREPLY_TOKEN).",
    };
  }
  return { ok, status: res.status, data };
}

// Envia arquivos locais (multipart) para uma rota do OpenReply.
export async function apiUpload(path, filePaths) {
  if (!BASE_URL) throw new Error("Defina OPENREPLY_URL com o endereço do seu OpenReply (ex.: https://reply.seudominio.com).");
  const { readFile } = await import("node:fs/promises");
  const { basename, extname } = await import("node:path");
  const tipos = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".mp4": "video/mp4", ".mov": "video/quicktime" };
  const form = new FormData();
  for (const p of filePaths) {
    const tipo = tipos[extname(p).toLowerCase()];
    if (!tipo) throw new Error(`${p}: use JPEG, PNG, MP4 ou MOV.`);
    form.append("file", new Blob([await readFile(p)], { type: tipo }), basename(p));
  }
  const res = await fetch(new URL(BASE_URL + path), { method: "POST", redirect: "manual", headers: { accept: "application/json", ...authHeaders() }, body: form });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text.slice(0, 2000);
  }
  return { ok: res.ok, status: res.status, data };
}
