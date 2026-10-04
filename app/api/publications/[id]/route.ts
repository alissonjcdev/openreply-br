import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { apagarArquivo } from "@/lib/publishing/storage";
import { incluirPublicacao, serializarPublicacao } from "@/lib/publishing/serialize";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const editarSchema = z.object({
  caption: z.string().max(2200).optional(),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
  automationId: z.string().min(1).nullable().optional(),
});

async function buscar(id: string, workspaceId: string) {
  return prisma.publication.findFirst({ where: { id, workspaceId }, include: incluirPublicacao });
}

export async function GET(_: NextRequest, { params }: Ctx) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const p = await buscar((await params).id, workspaceId);
  if (!p) return NextResponse.json({ success: false, error: "Não encontrada" }, { status: 404 });
  return NextResponse.json({ success: true, data: serializarPublicacao(p) });
}

/** Edita legenda, horário ou campanha. Só antes de publicar; uma que falhou volta para a fila. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const p = await buscar(id, workspaceId);
  if (!p) return NextResponse.json({ success: false, error: "Não encontrada" }, { status: 404 });
  if (!["SCHEDULED", "FAILED"].includes(p.status))
    return NextResponse.json({ success: false, error: "Essa publicação já está saindo ou já saiu." }, { status: 409 });

  const parsed = editarSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Dados inválidos" }, { status: 400 });
  const d = parsed.data;
  if (d.automationId) {
    const ok = await prisma.automation.findFirst({ where: { id: d.automationId, workspaceId }, select: { id: true } });
    if (!ok) return NextResponse.json({ success: false, error: "Campanha não encontrada." }, { status: 400 });
  }

  const atualizada = await prisma.publication.update({
    where: { id },
    data: {
      ...(d.caption !== undefined ? { caption: d.caption } : {}),
      ...(d.automationId !== undefined ? { automationId: d.automationId } : {}),
      ...(d.scheduledAt ? { scheduledAt: new Date(d.scheduledAt) } : {}),
      // reagendar uma que falhou: volta zerada para a fila
      ...(p.status === "FAILED" ? { status: "SCHEDULED", attempts: 0, lastError: null, containerId: null } : {}),
    },
    include: incluirPublicacao,
  });
  return NextResponse.json({ success: true, data: serializarPublicacao(atualizada) });
}

/** Cancela (não apaga do Instagram o que já saiu). */
export async function DELETE(_: NextRequest, { params }: Ctx) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const p = await buscar(id, workspaceId);
  if (!p) return NextResponse.json({ success: false, error: "Não encontrada" }, { status: 404 });
  if (p.status === "PUBLISHED") return NextResponse.json({ success: false, error: "Já publicada: apague pelo Instagram." }, { status: 409 });

  const cancelada = await prisma.publication.updateMany({
    where: { id, status: { in: ["SCHEDULED", "FAILED"] } },
    data: { status: "CANCELED" },
  });
  if (cancelada.count === 0) return NextResponse.json({ success: false, error: "Está publicando agora; não dá para cancelar." }, { status: 409 });
  await Promise.all(p.media.map((m) => apagarArquivo(m.storageKey)));
  return NextResponse.json({ success: true });
}
