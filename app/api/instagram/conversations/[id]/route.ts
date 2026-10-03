import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { getWorkspaceInstagramAccount } from "@/lib/instagram-accounts";
import {
  getConversationMessages,
  MetaApiError,
} from "@/lib/instagram/provider";
import { createInstagramContext } from "@/lib/instagram/provider";
import type { InstagramMessage } from "@/lib/meta/client";
import { getLinkPreviews } from "@/lib/instagram/link-preview";

export type ThreadMediaKind =
  | "image"
  | "video"
  | "audio"
  | "file"
  | "share"
  | "story_reply"
  | "story_mention";

export interface ThreadMedia {
  kind: ThreadMediaKind;
  /** Full-size media, or the link for shares and stories. */
  url: string;
  previewUrl?: string;
  name?: string;
}

// Normalizes Meta's attachment shapes into one list the inbox can render.
// CDN links expire (stories after 24h), so the UI must tolerate a dead URL.
function toMedia(m: InstagramMessage): ThreadMedia[] {
  const media: ThreadMedia[] = [];
  for (const a of m.attachments?.data ?? []) {
    if (a.image_data?.url || a.image_data?.animated_gif_url) {
      media.push({
        kind: "image",
        url: a.image_data.animated_gif_url ?? a.image_data.url!,
        previewUrl: a.image_data.preview_url,
      });
    } else if (a.video_data?.url) {
      media.push({ kind: "video", url: a.video_data.url, previewUrl: a.video_data.preview_url });
    } else if (a.audio_data?.url) {
      media.push({ kind: "audio", url: a.audio_data.url });
    } else if (a.file_url) {
      const type = a.mime_type ?? "";
      const kind: ThreadMediaKind = type.startsWith("image/")
        ? "image"
        : type.startsWith("video/")
          ? "video"
          : type.startsWith("audio/")
            ? "audio"
            : "file";
      media.push({ kind, url: a.file_url, name: a.name });
    }
  }
  for (const share of m.shares?.data ?? []) {
    if (share.link) media.push({ kind: "share", url: share.link, name: share.name });
  }
  if (m.story?.reply_to?.link) media.push({ kind: "story_reply", url: m.story.reply_to.link });
  if (m.story?.mention?.link) media.push({ kind: "story_mention", url: m.story.mention.link });
  return media;
}

export interface ThreadMessage {
  id: string;
  text: string;
  fromMe: boolean;
  fromUsername: string | null;
  createdTime: string | null;
  media?: ThreadMedia[];
  /** Meta could not render this message type through the API. */
  unsupported?: boolean;
}

export interface ThreadResponse {
  messages: ThreadMessage[];
}

type RouteProps = { params: Promise<{ id: string }> };

// Message history for a single conversation (20 most recent, chronological).
export async function GET(request: NextRequest, { params }: RouteProps) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { id: conversationId } = await params;

  const account = await getWorkspaceInstagramAccount(
    workspaceId,
    request.nextUrl.searchParams.get("instagramAccountId")
  );
  if (!account) {
    return NextResponse.json(
      { success: false, error: "Instagram account not connected." },
      { status: 400 }
    );
  }

  try {
    const accessToken = await createInstagramContext(account);
    const raw = await getConversationMessages({
      context: accessToken,
      conversationId: conversationId,
    });

    // The API returns newest-first; reverse to read top-to-bottom.
    const messages: ThreadMessage[] = raw
      .map((m) => ({
        id: m.id,
        text: m.message ?? "",
        fromMe: m.from?.id === account.instagramId,
        fromUsername: m.from?.username ?? null,
        createdTime: m.created_time ?? null,
        media: toMedia(m),
        unsupported: m.is_unsupported || undefined,
      }))
      .reverse();

    // Shared posts/reels arrive as instagram.com permalinks: attach the cover
    // image and author so the inbox can show a link preview.
    const shareUrls = messages.flatMap((m) =>
      (m.media ?? []).filter((x) => x.kind === "share").map((x) => x.url)
    );
    if (shareUrls.length) {
      const previews = await getLinkPreviews(shareUrls);
      for (const m of messages) {
        for (const media of m.media ?? []) {
          const preview = media.kind === "share" ? previews.get(media.url) : undefined;
          if (preview?.image) media.previewUrl = preview.image;
          if (preview?.author) media.name = preview.author;
        }
      }
    }

    const data: ThreadResponse = { messages };
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[Conversation Messages] Error:", err);
    const message =
      err instanceof MetaApiError ? err.message : "Failed to load messages";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
