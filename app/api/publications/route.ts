import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { getWorkspaceInstagramAccount } from "@/lib/instagram-accounts";
import { avancar } from "@/lib/publishing/engine";
import { incluirPublicacao, serializarPublicacao } from "@/lib/publishing/serialize";

export const dynamic = "force-dynamic";

const criarSchema = z.object({
  instagramAccountId: z.string().min(1).optional().nullable(),
  /** Omitido: IMAGE com 1 imagem, CAROUSEL com várias, REEL com 1 vídeo. */
  mediaType: z.enum(["IMAGE", "CAROUSEL", "REEL"]).optional(),
  caption: z.string().max(2200).optional().default(""),
  /** ISO 8601. Omitido ou no passado = publicar agora. */
  scheduledAt: z.string().datetime({ offset: true }).optional().nullable(),
  mediaIds: z.array(z.string().min(1)).min(1).max(10),
  automationId: z.string().min(1).optional().nullable(),
});

export async function GET(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const status = request.nextUrl.searchParams.get("status");
  const contaId = request.nextUrl.searchParams.get("instagramAccountId");
  const lista = await prisma.publication.findMany({
    where: {
      workspaceId,
      ...(status && status !== "all" ? { status: status as never } : {}),
      ...(contaId && contaId !== "all" ? { instagramAccountId: contaId } : {}),
    },
    include: incluirPublicacao,
    orderBy: { scheduledAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ success: true, data: lista.map(serializarPublicacao) });
}

export async function POST(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const parsed = criarSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  const dados = parsed.data;

  const conta = await getWorkspaceInstagramAccount(workspaceId, dados.instagramAccountId);
  if (!conta) return NextResponse.json({ success: false, error: "Conecte uma conta do Instagram primeiro." }, { status: 400 });
  if (conta.provider !== "META") return NextResponse.json({ success: false, error: "Publicação só funciona com conta conectada pela Meta." }, { status: 400 });

  const media = await prisma.publicationMedia.findMany({ where: { id: { in: dados.mediaIds }, workspaceId, publicationId: null } });
  if (media.length !== dados.mediaIds.length)
    return NextResponse.json({ success: false, error: "Alguma mídia não existe ou já foi usada em outra publicação." }, { status: 400 });
  const ordenadas = dados.mediaIds.map((id) => media.find((m) => m.id === id)!);

  const videos = ordenadas.filter((m) => m.kind === "VIDEO").length;
  const tipo = dados.mediaType ?? (ordenadas.length > 1 ? "CAROUSEL" : videos === 1 ? "REEL" : "IMAGE");
  if (tipo === "IMAGE" && (ordenadas.length !== 1 || videos !== 0))
    return NextResponse.json({ success: false, error: "Foto aceita uma imagem só." }, { status: 400 });
  if (tipo === "REEL" && (ordenadas.length !== 1 || videos !== 1))
    return NextResponse.json({ success: false, error: "Reel aceita um vídeo só." }, { status: 400 });
  if (tipo === "CAROUSEL" && (ordenadas.length < 2 || ordenadas.length > 10))
    return NextResponse.json({ success: false, error: "Carrossel precisa de 2 a 10 itens." }, { status: 400 });

  if (dados.automationId) {
    const campanha = await prisma.automation.findFirst({ where: { id: dados.automationId, workspaceId }, select: { id: true } });
    if (!campanha) return NextResponse.json({ success: false, error: "Campanha não encontrada." }, { status: 400 });
  }

  const quando = dados.scheduledAt ? new Date(dados.scheduledAt) : new Date();
  const agora = quando.getTime() <= Date.now() + 30_000;

  const publicacao = await prisma.publication.create({
    data: {
      workspaceId,
      instagramAccountId: conta.id,
      mediaType: tipo,
      caption: dados.caption,
      scheduledAt: agora ? new Date() : quando,
      automationId: dados.automationId ?? null,
    },
  });
  await Promise.all(
    ordenadas.map((m, position) => prisma.publicationMedia.update({ where: { id: m.id }, data: { publicationId: publicacao.id, position } }))
  );

  // "publicar agora" começa já, sem esperar o próximo minuto do cron
  if (agora) after(() => avancar(publicacao.id).catch((e) => console.error("[publicações] agora", e)));

  const completa = await prisma.publication.findUniqueOrThrow({ where: { id: publicacao.id }, include: incluirPublicacao });
  return NextResponse.json({ success: true, data: serializarPublicacao(completa) }, { status: 201 });
}
