import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { avancar } from "@/lib/publishing/engine";
import { incluirPublicacao, serializarPublicacao } from "@/lib/publishing/serialize";

export const dynamic = "force-dynamic";

/** "Publicar agora": antecipa o horário e já roda o primeiro passo. */
export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const p = await prisma.publication.findFirst({ where: { id, workspaceId } });
  if (!p) return NextResponse.json({ success: false, error: "Não encontrada" }, { status: 404 });

  if (p.status === "SCHEDULED" || p.status === "FAILED") {
    await prisma.publication.updateMany({
      where: { id, status: { in: ["SCHEDULED", "FAILED"] } },
      data: { status: "SCHEDULED", scheduledAt: new Date(), ...(p.status === "FAILED" ? { attempts: 0, lastError: null, containerId: null } : {}) },
    });
  }
  const etapa = await avancar(id);
  const atual = await prisma.publication.findUniqueOrThrow({ where: { id }, include: incluirPublicacao });
  return NextResponse.json({ success: true, etapa, data: serializarPublicacao(atual) });
}
