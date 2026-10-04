import { NextRequest } from "next/server";
import { Readable } from "node:stream";
import { prisma } from "@/lib/db/client";
import { abrirArquivo } from "@/lib/publishing/storage";

export const dynamic = "force-dynamic";

/**
 * Serve a mídia de uma publicação. Público de propósito: é daqui que a Meta
 * baixa a imagem ou o vídeo. Aceita Range (o downloader de vídeo da Meta usa).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const media = await prisma.publicationMedia.findUnique({ where: { id }, select: { storageKey: true, contentType: true } });
  if (!media?.storageKey) return new Response("Não encontrado", { status: 404 });

  const range = request.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  try {
    if (range && (range[1] || range[2])) {
      const inicio = range[1] ? Number(range[1]) : undefined;
      const fim = range[2] ? Number(range[2]) : undefined;
      const a = await abrirArquivo(media.storageKey, { inicio: inicio ?? 0, fim });
      if (a.inicio > a.fim) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${a.tamanho}` } });
      return new Response(Readable.toWeb(a.stream) as ReadableStream, {
        status: 206,
        headers: {
          "Content-Type": media.contentType,
          "Content-Length": String(a.fim - a.inicio + 1),
          "Content-Range": `bytes ${a.inicio}-${a.fim}/${a.tamanho}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }
    const a = await abrirArquivo(media.storageKey);
    return new Response(Readable.toWeb(a.stream) as ReadableStream, {
      headers: {
        "Content-Type": media.contentType,
        "Content-Length": String(a.tamanho),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new Response("Não encontrado", { status: 404 });
  }
}
