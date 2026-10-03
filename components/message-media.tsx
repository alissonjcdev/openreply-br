"use client";

/**
 * Media inside an inbox message: photos, GIFs, videos, voice notes, files,
 * shared posts and story replies/mentions. Rendered like Messages — media
 * stands on its own, rounded, with no bubble behind it.
 *
 * Meta's CDN links expire (stories after 24h, attachments eventually), so
 * every visual falls back to a calm "unavailable" tile instead of a broken
 * image.
 */

import { useState } from "react";
import { FileText, ImageOff } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import type { ThreadMedia } from "@/app/api/instagram/conversations/[id]/route";

function Unavailable() {
  const { t } = useI18n();
  return (
    <div className="flex h-36 w-52 flex-col items-center justify-center gap-1.5 rounded-[18px] bg-surface-2 text-muted">
      <ImageOff aria-hidden strokeWidth={1.7} className="size-5" />
      <span className="text-[12px]">{t("Media unavailable")}</span>
    </div>
  );
}

// Story and share links can be either an image or a video; try the image
// first and fall back to a video element, then to the unavailable tile.
function VisualMedia({ url, poster }: { url: string; poster?: string }) {
  const [mode, setMode] = useState<"image" | "video" | "failed">("image");
  if (mode === "failed") return <Unavailable />;
  if (mode === "video") {
    return (
      <video
        src={url}
        poster={poster}
        controls
        playsInline
        preload="metadata"
        onError={() => setMode("failed")}
        className="max-h-80 w-full max-w-64 rounded-[18px] bg-surface-2"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote, signed, short-lived CDN URLs
    <img
      src={url}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setMode("video")}
      className="max-h-80 w-auto max-w-64 rounded-[18px] bg-surface-2 object-cover"
    />
  );
}

export default function MessageMedia({
  media,
  fromMe,
}: {
  media: ThreadMedia;
  fromMe: boolean;
}) {
  const { t } = useI18n();
  const [videoFailed, setVideoFailed] = useState(false);

  switch (media.kind) {
    case "image":
      return (
        <a href={media.url} target="_blank" rel="noopener noreferrer" className="block">
          <VisualMedia url={media.url} />
        </a>
      );
    case "video":
      return videoFailed ? (
        <Unavailable />
      ) : (
        <video
          src={media.url}
          poster={media.previewUrl}
          controls
          playsInline
          preload="metadata"
          onError={() => setVideoFailed(true)}
          className="max-h-80 w-full max-w-64 rounded-[18px] bg-surface-2"
        />
      );
    case "audio":
      return (
        <audio
          src={media.url}
          controls
          preload="metadata"
          className="h-10 w-60 max-w-full"
        />
      );
    case "story_reply":
    case "story_mention":
      return (
        <div className={`flex flex-col gap-1 ${fromMe ? "items-end" : "items-start"}`}>
          <span className="px-1 text-[12px] text-muted">
            {media.kind === "story_reply"
              ? t("Replied to your story")
              : t("Mentioned you in their story")}
          </span>
          <a href={media.url} target="_blank" rel="noopener noreferrer" className="block">
            <VisualMedia url={media.url} />
          </a>
        </div>
      );
    case "share":
      return (
        <div className={`flex flex-col gap-1 ${fromMe ? "items-end" : "items-start"}`}>
          <span className="px-1 text-[12px] text-muted">{t("Shared post")}</span>
          <a href={media.url} target="_blank" rel="noopener noreferrer" className="block">
            <VisualMedia url={media.url} />
          </a>
        </div>
      );
    case "file":
    default:
      return (
        <a
          href={media.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex max-w-64 items-center gap-2.5 rounded-[18px] bg-surface-2 px-3.5 py-2.5 text-[14px] hover:bg-surface-hover"
        >
          <FileText aria-hidden strokeWidth={1.8} className="size-5 shrink-0 text-accent" />
          <span className="truncate">{media.name || t("Attachment")}</span>
        </a>
      );
  }
}
