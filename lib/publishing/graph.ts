/**
 * Chamadas de publicação na API do Instagram (Login do Instagram, graph.instagram.com).
 *
 * Publicar é sempre em duas etapas: criar um contêiner com a mídia (a Meta baixa
 * o arquivo pela URL pública) e, quando o status dele for FINISHED, chamar
 * media_publish. Vídeo pode levar minutos para processar, por isso o status é
 * consultado em rodadas separadas pelo cron, e não num laço aqui.
 */

import { getMetaGraphApiVersion } from "@/lib/env";

const base = () => `https://graph.instagram.com/${getMetaGraphApiVersion()}`;

export class PublishError extends Error {
  constructor(
    message: string,
    /** Erro que não melhora tentando de novo (mídia inválida, permissão). */
    public permanent = false
  ) {
    super(message);
    this.name = "PublishError";
  }
}

type GraphError = { error?: { message?: string; code?: number; error_subcode?: number; is_transient?: boolean } };

async function call<T>(path: string, token: string, init?: { method?: "GET" | "POST"; body?: Record<string, string> }): Promise<T> {
  const url = new URL(`${base()}/${path}`);
  let response: Response;
  if (init?.method === "POST") {
    const body = new URLSearchParams({ ...(init.body ?? {}), access_token: token });
    response = await fetch(url, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  } else {
    for (const [k, v] of Object.entries(init?.body ?? {})) url.searchParams.set(k, v);
    url.searchParams.set("access_token", token);
    response = await fetch(url);
  }
  const data = (await response.json().catch(() => ({}))) as T & GraphError;
  if (!response.ok || data.error) {
    const e = data.error ?? {};
    const code = e.code ?? response.status;
    // 10/100/200 = permissão ou parâmetro inválido; 190 = token. Tentar de novo não resolve.
    const permanent = !e.is_transient && [10, 100, 190, 200, 9004, 36003].includes(code);
    throw new PublishError(`${e.message ?? "Erro da Meta"} [code=${code} sub=${e.error_subcode ?? "-"}] (${path.split("?")[0]})`, permanent);
  }
  return data;
}

export type ItemSpec = { kind: "IMAGE" | "VIDEO"; url: string };

/** Contêiner de item de carrossel. */
export async function createCarouselItem(igUserId: string, token: string, item: ItemSpec) {
  const body: Record<string, string> =
    item.kind === "IMAGE" ? { image_url: item.url, is_carousel_item: "true" } : { media_type: "VIDEO", video_url: item.url, is_carousel_item: "true" };
  return (await call<{ id: string }>(`${igUserId}/media`, token, { method: "POST", body })).id;
}

export async function createCarousel(igUserId: string, token: string, children: string[], caption: string) {
  return (await call<{ id: string }>(`${igUserId}/media`, token, { method: "POST", body: { media_type: "CAROUSEL", children: children.join(","), caption } }))
    .id;
}

export async function createImage(igUserId: string, token: string, url: string, caption: string) {
  return (await call<{ id: string }>(`${igUserId}/media`, token, { method: "POST", body: { image_url: url, caption } })).id;
}

export async function createReel(igUserId: string, token: string, url: string, caption: string, coverUrl?: string) {
  const body: Record<string, string> = { media_type: "REELS", video_url: url, caption, share_to_feed: "true" };
  if (coverUrl) body.cover_url = coverUrl;
  return (await call<{ id: string }>(`${igUserId}/media`, token, { method: "POST", body })).id;
}

export type ContainerStatus = "EXPIRED" | "ERROR" | "FINISHED" | "IN_PROGRESS" | "PUBLISHED";

export async function containerStatus(containerId: string, token: string) {
  const r = await call<{ status_code?: ContainerStatus; status?: string }>(containerId, token, { body: { fields: "status_code,status" } });
  return { code: r.status_code ?? "IN_PROGRESS", detail: r.status ?? "" };
}

export async function publishContainer(igUserId: string, token: string, containerId: string) {
  return (await call<{ id: string }>(`${igUserId}/media_publish`, token, { method: "POST", body: { creation_id: containerId } })).id;
}

export async function mediaPermalink(mediaId: string, token: string) {
  try {
    return (await call<{ permalink?: string }>(mediaId, token, { body: { fields: "permalink" } })).permalink ?? null;
  } catch {
    return null;
  }
}

/** Quantas publicações ainda cabem nas últimas 24h (a Meta limita a 100). */
export async function publishingQuota(igUserId: string, token: string) {
  const r = await call<{ data?: { quota_usage?: number; config?: { quota_total?: number } }[] }>(`${igUserId}/content_publishing_limit`, token, {
    body: { fields: "quota_usage,config" },
  });
  const d = r.data?.[0];
  return { usage: d?.quota_usage ?? 0, total: d?.config?.quota_total ?? 100 };
}
