/**
 * Arquivos das publicações. Ficam num volume do container web (MEDIA_DIR) e são
 * servidos publicamente em /api/media/{id}: a Meta precisa baixar a mídia por
 * uma URL aberta. O id é um cuid (não dá para adivinhar) e o arquivo pode ser
 * apagado depois que o post sai.
 */

import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getBaseUrl } from "@/lib/env";

export const MEDIA_DIR = process.env.MEDIA_DIR ?? path.join(process.cwd(), ".media");

export const LIMITES = {
  imagem: 8 * 1024 * 1024, // a Meta aceita JPEG até 8 MB
  video: 300 * 1024 * 1024, // reels até ~300 MB
};

export const TIPOS_IMAGEM = ["image/jpeg", "image/png"];
export const TIPOS_VIDEO = ["video/mp4", "video/quicktime"];

const extensao: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

export function chaveDoArquivo(workspaceId: string, mediaId: string, contentType: string) {
  return path.posix.join(workspaceId, `${mediaId}.${extensao[contentType] ?? "bin"}`);
}

export async function salvarArquivo(storageKey: string, dados: Buffer) {
  const destino = path.join(MEDIA_DIR, storageKey);
  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(destino, dados);
}

export async function apagarArquivo(storageKey: string | null | undefined) {
  if (!storageKey) return;
  await rm(path.join(MEDIA_DIR, storageKey), { force: true });
}

export async function abrirArquivo(storageKey: string, faixa?: { inicio: number; fim?: number }) {
  const caminho = path.resolve(MEDIA_DIR, storageKey);
  // impede escapar da pasta com "../"
  if (!caminho.startsWith(path.resolve(MEDIA_DIR) + path.sep)) throw new Error("caminho inválido");
  const info = await stat(caminho);
  const fim = Math.min(faixa?.fim ?? info.size - 1, info.size - 1);
  const inicio = faixa?.inicio ?? 0;
  return { tamanho: info.size, inicio, fim, stream: createReadStream(caminho, { start: inicio, end: fim }) };
}

/** URL pública que a Meta vai baixar. */
export function urlPublica(media: { id: string; externalUrl: string | null }) {
  return media.externalUrl ?? `${getBaseUrl().replace(/\/$/, "")}/api/media/${media.id}`;
}
