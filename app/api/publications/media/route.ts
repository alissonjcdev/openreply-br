import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { LIMITES, TIPOS_IMAGEM, TIPOS_VIDEO, chaveDoArquivo, salvarArquivo, urlPublica } from "@/lib/publishing/storage";

export const dynamic = "force-dynamic";

const externoSchema = z.object({
  urls: z.array(z.object({ url: z.string().url(), kind: z.enum(["IMAGE", "VIDEO"]) })).min(1).max(10),
});

/**
 * Sobe a mídia de uma publicação ainda não criada.
 * - multipart/form-data com um ou mais campos "file" (JPEG/PNG até 8 MB, MP4/MOV até 300 MB);
 * - ou JSON { urls: [{ url, kind }] } para mídia que já tem endereço público.
 * Devolve os ids na ordem recebida, para usar em POST /api/publications.
 */
export async function POST(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const tipo = request.headers.get("content-type") ?? "";
  const criadas = [];

  if (tipo.includes("application/json")) {
    const parsed = externoSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: "Envie { urls: [{ url, kind }] }." }, { status: 400 });
    for (const item of parsed.data.urls) {
      criadas.push(
        await prisma.publicationMedia.create({
          data: { workspaceId, kind: item.kind, contentType: item.kind === "IMAGE" ? "image/jpeg" : "video/mp4", externalUrl: item.url },
        })
      );
    }
  } else {
    const form = await request.formData().catch(() => null);
    const arquivos = (form?.getAll("file") ?? []).filter((f): f is File => f instanceof File);
    if (arquivos.length === 0) return NextResponse.json({ success: false, error: "Nenhum arquivo enviado." }, { status: 400 });
    if (arquivos.length > 10) return NextResponse.json({ success: false, error: "No máximo 10 arquivos." }, { status: 400 });

    for (const arquivo of arquivos) {
      const imagem = TIPOS_IMAGEM.includes(arquivo.type);
      const video = TIPOS_VIDEO.includes(arquivo.type);
      if (!imagem && !video)
        return NextResponse.json({ success: false, error: `${arquivo.name}: use JPEG, PNG, MP4 ou MOV.` }, { status: 400 });
      if (arquivo.size > (imagem ? LIMITES.imagem : LIMITES.video))
        return NextResponse.json({ success: false, error: `${arquivo.name}: arquivo grande demais.` }, { status: 400 });
    }
    for (const arquivo of arquivos) {
      const imagem = TIPOS_IMAGEM.includes(arquivo.type);
      const media = await prisma.publicationMedia.create({
        data: { workspaceId, kind: imagem ? "IMAGE" : "VIDEO", contentType: arquivo.type, size: arquivo.size },
      });
      const storageKey = chaveDoArquivo(workspaceId, media.id, arquivo.type);
      await salvarArquivo(storageKey, Buffer.from(await arquivo.arrayBuffer()));
      criadas.push(await prisma.publicationMedia.update({ where: { id: media.id }, data: { storageKey } }));
    }
  }

  return NextResponse.json({
    success: true,
    data: criadas.map((m) => ({ id: m.id, kind: m.kind, contentType: m.contentType, size: m.size, url: urlPublica(m) })),
  });
}
