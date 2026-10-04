import { NextRequest, NextResponse } from "next/server";
import { avancarPendentes } from "@/lib/publishing/engine";

export const dynamic = "force-dynamic";

/**
 * Publica o que chegou no horário e acompanha o que está processando na Meta.
 * Roda a cada minuto pelo scripts/cron.sh.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET;
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const data = await avancarPendentes();
  return NextResponse.json({ success: true, data });
}
