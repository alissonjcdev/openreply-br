import type { Publication, PublicationMedia } from "@/app/generated/prisma/client";
import { urlPublica } from "./storage";

export const incluirPublicacao = {
  media: { orderBy: { position: "asc" as const } },
  instagramAccount: { select: { id: true, username: true } },
};

export function serializarPublicacao(
  p: Publication & { media: PublicationMedia[]; instagramAccount?: { id: string; username: string } }
) {
  return {
    id: p.id,
    instagramAccountId: p.instagramAccountId,
    username: p.instagramAccount?.username ?? null,
    mediaType: p.mediaType,
    caption: p.caption,
    scheduledAt: p.scheduledAt.toISOString(),
    status: p.status,
    attempts: p.attempts,
    lastError: p.lastError,
    igMediaId: p.igMediaId,
    permalink: p.permalink,
    publishedAt: p.publishedAt?.toISOString() ?? null,
    automationId: p.automationId,
    createdAt: p.createdAt.toISOString(),
    media: p.media.map((m) => ({ id: m.id, kind: m.kind, contentType: m.contentType, size: m.size, url: urlPublica(m) })),
  };
}
