import { createHash, timingSafeEqual } from "crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/db/client";

// Bearer token for automation clients (our MCP server). The env holds only the
// SHA-256 of the token, so the plain value never lives on the server; the token
// acts as the user named by OPENREPLY_API_USER_EMAIL, with that user's role.
const TOKEN_HASH = process.env.OPENREPLY_API_TOKEN_SHA256?.trim().toLowerCase();
const TOKEN_USER_EMAIL = process.env.OPENREPLY_API_USER_EMAIL?.trim().toLowerCase();

function matchesToken(token: string): boolean {
  if (!TOKEN_HASH || !/^[0-9a-f]{64}$/.test(TOKEN_HASH)) return false;
  const actual = createHash("sha256").update(token).digest();
  return timingSafeEqual(actual, Buffer.from(TOKEN_HASH, "hex"));
}

export async function getApiTokenUserId(): Promise<string | null> {
  if (!TOKEN_HASH || !TOKEN_USER_EMAIL) return null;

  let authorization: string | null = null;
  try {
    authorization = (await headers()).get("authorization");
  } catch {
    // Outside a request scope (build, worker): no token to read.
    return null;
  }

  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  if (!match || !matchesToken(match[1])) return null;

  const user = await prisma.user.findFirst({
    where: { email: { equals: TOKEN_USER_EMAIL, mode: "insensitive" } },
    select: { id: true },
  });
  return user?.id ?? null;
}
