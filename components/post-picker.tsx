"use client";

/* eslint-disable @next/next/no-img-element */

/**
 * Post Picker
 *
 * Grid of Instagram post thumbnails, selectable.
 * Fetches from /api/instagram/posts.
 */

import { useI18n } from "@/lib/i18n/provider";
import { useEffect, useState } from "react";
import { readCache, writeCache } from "@/lib/client-cache";
import { Search } from "lucide-react";

const PAGE_SIZE = 60;

interface InstagramPost {
  id: string;
  caption?: string;
  media_type: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp: string;
}

interface PostPickerProps {
  selectedPostId: string | null;
  instagramAccountId?: string | null;
  /** postId -> name of the campaign already using it. Flagged in the grid. */
  usedPostIds?: Record<string, string>;
  onSelect: (
    postId: string,
    postUrl?: string,
    thumbUrl?: string,
    caption?: string
  ) => void;
}

export default function PostPicker({
  selectedPostId,
  instagramAccountId,
  usedPostIds,
  onSelect,
}: PostPickerProps) {
  const { t } = useI18n();
  const [limitations, setLimitations] = useState<string[]>([]);
  const [posts, setPosts] = useState<InstagramPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // The post currently hovered — its video (if it's a reel) plays a preview.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // The grid loads the whole library (all=true). On accounts with hundreds of
  // posts, rendering every tile at once is enough to make mobile Safari drop
  // the page, so they are revealed in batches.
  const [shown, setShown] = useState(PAGE_SIZE);
  // Bumped by "Try again" to re-run the fetch after an error.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (instagramAccountId) {
      params.set("instagramAccountId", instagramAccountId);
    }
    // Load the full library so older posts/reels are selectable, not just the
    // most recent page.
    params.set("all", "true");

    // Show the cached library instantly (stale-while-revalidate), then refresh.
    const cacheKey = `ig-posts:${instagramAccountId ?? "default"}`;
    const cached = readCache<InstagramPost[]>(cacheKey, 15 * 60 * 1000);
    // Hydrating state from cache is a legitimate effect use here.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (cached.data) {
      setPosts(cached.data);
      setLoading(false);
    }
    /* eslint-enable react-hooks/set-state-in-effect */

    fetch(`/api/instagram/posts${params.size ? `?${params}` : ""}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.success) {
          setPosts(data.data);
          setLimitations(data.limitations ?? []);
          writeCache(cacheKey, data.data);
        } else if (!cached.data) {
          setError(data.error ?? "Failed to load posts");
        }
      })
      .catch(() => {
        if (!cancelled && !cached.data) setError("Failed to load posts");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [instagramAccountId, attempt]);

  function retry() {
    setError(null);
    setLoading(true);
    setAttempt((n) => n + 1);
  }

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="aspect-square rounded-sm bg-surface-2" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-6 text-center" role="status">
        <p
          className="text-[15px] text-foreground"
          // The raw API error is kept for anyone debugging, out of the way.
          title={error !== "Failed to load posts" ? error : undefined}
        >
          {t("Failed to load posts")}
        </p>
        <p className="footnote mt-0.5">{t("Connect your Instagram account first")}</p>
        <button type="button" onClick={retry} className="btn btn-plain mt-3 text-[15px]">
          {t("Try again")}
        </button>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="px-4 py-6 text-center">
        <p className="footnote">{t("No posts found")}</p>
      </div>
    );
  }

  const matching = query.trim()
    ? posts.filter((p) =>
        (p.caption ?? "").toLowerCase().includes(query.trim().toLowerCase())
      )
    : posts;

  const visible = matching.slice(0, shown);
  const remaining = matching.length - visible.length;

  return (
    <div className="space-y-2.5">
      {limitations.map(note => <p key={note} className="caption">{note}</p>)}
      <div className="relative">
        <Search
          aria-hidden
          strokeWidth={1.9}
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-tertiary"
        />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            // Back to one batch on every new search. Without this, a grid
            // expanded under an earlier query stays expanded once it is
            // cleared, which is the case this whole change exists to avoid.
            setShown(PAGE_SIZE);
          }}
          placeholder={t("Search your posts by caption…")}
          className="field pl-8 pr-12"
        />
        <span className="numeral pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-tertiary">
          {posts.length}
        </span>
      </div>
      {visible.length === 0 ? (
        <p className="footnote py-6 text-center">
          {t("No posts match “")}{query}{t("”")}
        </p>
      ) : (
        <>
          {/* auto-rows-min + content-start keep each row at its natural height.
              Without them the rows share out max-h-72 instead of scrolling, and
              the square thumbnails flatten into strips. */}
          <div className="grid max-h-72 auto-rows-min grid-cols-3 content-start gap-1.5 overflow-y-auto p-[3px] sm:grid-cols-4">
            {visible.map((post) => {
              const isSelected = selectedPostId === post.id;
              const usedByName = usedPostIds?.[post.id];
              const isUsed = Boolean(usedByName) && !isSelected;
              const thumb = post.thumbnail_url ?? post.media_url;
              const isVideo = post.media_type === "VIDEO";
              const showVideo =
                isVideo && hoveredId === post.id && Boolean(post.media_url);
              return (
          <button
            key={post.id}
            type="button"
            onClick={() => onSelect(post.id, post.permalink, thumb, post.caption)}
            onMouseEnter={() => setHoveredId(post.id)}
            onMouseLeave={() =>
              setHoveredId((cur) => (cur === post.id ? null : cur))
            }
            aria-pressed={isSelected}
            title={isUsed && usedByName ? t("Already used by \"{name}\"", { name: usedByName }) : undefined}
            className={`relative aspect-square overflow-hidden rounded-sm bg-surface-2 outline-offset-2 ${
              isSelected ? "outline outline-[2.5px] outline-accent" : "hover:opacity-90"
            }`}
          >
            {thumb ? (
              <img
                src={thumb}
                alt={post.caption?.slice(0, 50) ?? t("Instagram post")}
                loading="lazy"
                decoding="async"
                className={`h-full w-full object-cover ${isUsed ? "opacity-45" : ""}`}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <span className="caption">{t("No image")}</span>
              </div>
            )}
            {showVideo && (
              <video
                src={post.media_url}
                poster={thumb}
                autoPlay
                muted
                loop
                playsInline
                preload="none"
                className={`absolute inset-0 h-full w-full object-cover ${
                  isUsed ? "opacity-45" : ""
                }`}
              />
            )}
            {isUsed && (
              <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1 py-0.5 text-center text-[11px] font-medium text-white">
                {t("Already used")}
              </span>
            )}
            {isSelected && (
              <span className="sr-only">{t("Selected")}</span>
            )}
          </button>
              );
            })}
          </div>
          {remaining > 0 && (
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE_SIZE)}
              className="btn btn-plain w-full py-1 text-[15px]"
            >
              {t("Show")} {Math.min(PAGE_SIZE, remaining)} {t("more")}
            </button>
          )}
        </>
      )}
    </div>
  );
}
