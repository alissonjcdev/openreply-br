import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { getWorkspaceInstagramAccount } from "@/lib/instagram-accounts";
import { decryptToken } from "@/lib/meta/oauth";
import { publishingQuota } from "@/lib/publishing/graph";

export const dynamic = "force-dynamic";

/**
 * Cota de publicação das últimas 24h (a Meta limita a 100). Também confirma que
 * o token tem instagram_business_content_publish: sem ela a Meta responde erro.
 */
export async function GET(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const conta = await getWorkspaceInstagramAccount(workspaceId, request.nextUrl.searchParams.get("instagramAccountId"));
  if (!conta || conta.provider !== "META") return NextResponse.json({ success: false, error: "Sem conta da Meta conectada." }, { status: 400 });
  try {
    const cota = await publishingQuota(conta.instagramId, decryptToken(conta.accessToken));
    return NextResponse.json({ success: true, data: { ...cota, canPublish: true } });
  } catch (e) {
    return NextResponse.json({
      success: true,
      data: { canPublish: false, error: e instanceof Error ? e.message : String(e), hint: "Reconecte a conta em /api/instagram/connect para liberar a permissão de publicar." },
    });
  }
}
