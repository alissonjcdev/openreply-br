"use client";

/**
 * Campaigns List Page
 *
 * Large title, a toolbar (search, status segmented control, account menu) and
 * the campaigns as one grouped inset list: each row carries its status as
 * colored text, its trigger as muted text, the numbers right-aligned, an iOS
 * switch and a "more" menu.
 */

import { formatPercent } from "@/lib/utils/format";
import { useI18n } from "@/lib/i18n/provider";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AccountSelect, { type AccountOption } from "@/components/account-select";
import { readCache, writeCache } from "@/lib/client-cache";
import { ChevronRight, Ellipsis, Plus, Search } from "lucide-react";

interface Campaign {
  id: string;
  name: string;
  goal: string | null;
  postId: string | null;
  postUrl: string | null;
  pendingNextReel: boolean;
  matchAnyPost: boolean;
  keywords: string[];
  matchAnyWord: boolean;
  dmMessage: string;
  openingDmEnabled: boolean;
  openingDmMessage: string | null;
  openingDmButtonLabel: string | null;
  publicReplyEnabled: boolean;
  publicReplyMessage: string | null;
  publicReplyMessages: string[];
  requireFollow: boolean;
  followPromptMessage: string | null;
  followPromptButtonLabel: string | null;
  isActive: boolean;
  wholeWordMatch: boolean;
  instagramAccountId: string;
  instagramAccount: {
    username: string;
    instagramId: string;
  };
  reportShareSlug: string | null;
  reportShareEnabled: boolean;
  reportUrl: string | null;
  createdAt: string;
  _count: { dmLogs: number };
  trackedLinks: Array<{
    id: string;
    slug: string;
    label: string | null;
    destinationUrl: string;
    trackedUrl: string;
    _count: { clicks: number };
  }>;
  analytics: {
    sent: number;
    skipped: number;
    failed: number;
    clicks: number;
    ctr: number;
    topKeywords: { keyword: string; count: number }[];
  };
}

export default function CampaignsPage() {
  const { t, label, locale } = useI18n();
  const router = useRouter();
  const [automations, setAutomations] = useState<Campaign[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("all");
  const [loading, setLoading] = useState(true);
  // postId -> current thumbnail URL, fetched live (Instagram URLs expire, so
  // they are never stored on the campaign).
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  // postId -> video URL for reels, so a campaign thumbnail can play on click.
  const [videos, setVideos] = useState<Record<string, string>>({});
  // The reel currently playing in the lightbox (null when closed).
  const [playingVideo, setPlayingVideo] = useState<{
    url: string;
    postUrl: string | null;
  } | null>(null);
  // The open row menu: which campaign, and where to anchor it on screen.
  const [menu, setMenu] = useState<{
    id: string;
    top: number;
    right: number;
  } | null>(null);
  const menuOpenId = menu?.id ?? null;
  const closeMenu = useCallback(() => setMenu(null), []);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused">(
    "all"
  );

  const fetchAutomations = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedAccountId !== "all") {
        params.set("instagramAccountId", selectedAccountId);
      }
      const res = await fetch(
        `/api/automations${params.size ? `?${params}` : ""}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (data.success) setAutomations(data.data);
    } catch (err) {
      console.error("Failed to fetch campaigns:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((res) => res.json())
      .then((payload) => {
        if (payload.success) setAccounts(payload.data.instagramAccounts ?? []);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchAutomations();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchAutomations]);

  // Fetch fresh post thumbnails (and reel video URLs) for the accounts in view
  // and map them by postId. Cache-first so they show instantly on a return
  // visit. Instagram URLs expire, so they are never stored on the campaign.
  useEffect(() => {
    if (automations.length === 0) return;
    let cancelled = false;
    const accountIds = Array.from(
      new Set(automations.map((a) => a.instagramAccountId))
    ).sort();
    const cacheKey = `ig-media:${accountIds.join(",")}`;

    const cached = readCache<{
      thumbs: Record<string, string>;
      videos: Record<string, string>;
    }>(cacheKey, 15 * 60 * 1000);
    // Hydrating state from cache is a legitimate effect use here.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (cached.data) {
      setThumbnails(cached.data.thumbs);
      setVideos(cached.data.videos);
    }
    /* eslint-enable react-hooks/set-state-in-effect */

    Promise.all(
      accountIds.map((accountId) =>
        fetch(`/api/instagram/posts?instagramAccountId=${accountId}&limit=50`)
          .then((res) => res.json())
          .then((payload) =>
            payload.success
              ? (payload.data as {
                  id: string;
                  media_type?: string;
                  media_url?: string;
                  thumbnail_url?: string;
                }[])
              : []
          )
          .catch(() => [])
      )
    ).then((lists) => {
      if (cancelled) return;
      const thumbs: Record<string, string> = {};
      const vids: Record<string, string> = {};
      for (const list of lists) {
        for (const media of list) {
          const url = media.thumbnail_url ?? media.media_url;
          if (url) thumbs[media.id] = url;
          if (media.media_type === "VIDEO" && media.media_url) {
            vids[media.id] = media.media_url;
          }
        }
      }
      setThumbnails(thumbs);
      setVideos(vids);
      writeCache(cacheKey, { thumbs, videos: vids });
    });

    return () => {
      cancelled = true;
    };
  }, [automations]);

  // Close the reel lightbox on Escape.
  useEffect(() => {
    if (!playingVideo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPlayingVideo(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playingVideo]);

  function openMenu(id: string, anchor: HTMLElement) {
    if (menuOpenId === id) return closeMenu();
    const rect = anchor.getBoundingClientRect();
    setMenu({
      id,
      top: rect.bottom + 6,
      right: Math.max(12, window.innerWidth - rect.right),
    });
  }

  function handleAccountChange(accountId: string) {
    setLoading(true);
    setSelectedAccountId(accountId);
  }

  async function toggleActive(id: string, isActive: boolean) {
    try {
      await fetch(`/api/automations?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });
      setAutomations((prev) =>
        prev.map((a) => (a.id === id ? { ...a, isActive: !isActive } : a))
      );
    } catch (err) {
      console.error("Failed to toggle:", err);
    }
  }

  async function copyReelUrl(auto: Campaign) {
    closeMenu();
    if (!auto.postUrl) return;
    try {
      await navigator.clipboard.writeText(auto.postUrl);
      setCopiedId(auto.id);
      window.setTimeout(
        () => setCopiedId((cur) => (cur === auto.id ? null : cur)),
        1500
      );
    } catch (err) {
      console.error("Failed to copy reel URL:", err);
    }
  }

  async function deleteAutomation(id: string) {
    if (!confirm(t("Delete this campaign? This cannot be undone."))) return;
    try {
      await fetch(`/api/automations?id=${id}`, { method: "DELETE" });
      setAutomations((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  }

  // The copy is made server-side from the stored campaign, so settings this
  // list never loads (the DM trigger, the follow-up, the link button label)
  // still come along.
  async function duplicateAutomation(id: string) {
    closeMenu();
    try {
      const res = await fetch(`/api/automations/duplicate?id=${id}`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) void fetchAutomations();
      else console.error("Duplicate failed:", data.error);
    } catch (err) {
      console.error("Failed to duplicate:", err);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="h-[41px] w-48 rounded-md bg-surface-2" />
        <div className="group">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="group-row min-h-[72px]">
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-40 rounded bg-surface-2" />
                <div className="h-3 w-64 max-w-full rounded bg-surface-2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const query = search.trim().toLowerCase();
  const filtered = automations.filter((a) => {
    if (statusFilter === "active" && !a.isActive) return false;
    if (statusFilter === "paused" && a.isActive) return false;
    if (!query) return true;
    return (
      a.name.toLowerCase().includes(query) ||
      a.keywords.some((k) => k.toLowerCase().includes(query)) ||
      a.dmMessage.toLowerCase().includes(query)
    );
  });
  const menuCampaign = menu
    ? automations.find((a) => a.id === menu.id) ?? null
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Title + primary actions */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <h1 className="large-title">{t("Campaigns")}</h1>
        <div className="flex items-center gap-2">
          <Link href="/campaigns/import" className="btn btn-secondary">
            {t("Import")}
          </Link>
          <Link href="/campaigns/new" className="btn btn-primary">
            <Plus aria-hidden strokeWidth={2.2} className="-ml-0.5 size-4" />
            {t("New Campaign")}
          </Link>
        </div>
      </div>

      {/* Toolbar: search, status, account */}
      {(automations.length > 0 || accounts.length > 1) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {automations.length > 0 && (
            <label className="relative block min-w-0 sm:max-w-sm sm:flex-1">
              <span className="sr-only">
                {t("Search campaigns by name, keyword, or message…")}
              </span>
              <Search
                aria-hidden
                strokeWidth={2}
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("Search")}
                className="field h-9 min-h-0 pl-8 pr-3 text-[14px] [&::-webkit-search-cancel-button]:hidden"
              />
            </label>
          )}
          <div className="flex min-w-0 items-center gap-3 sm:ml-auto">
            {automations.length > 0 && (
              <div
                role="radiogroup"
                aria-label={t("Status")}
                className="segmented shrink-0"
              >
                {(["all", "active", "paused"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={statusFilter === s}
                    onClick={() => setStatusFilter(s)}
                  >
                    {label(s)}
                  </button>
                ))}
              </div>
            )}
            {accounts.length > 1 && (
              <AccountSelect
                accounts={accounts}
                value={selectedAccountId}
                onChange={handleAccountChange}
              />
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {automations.length === 0 && (
        <div className="group px-6 py-14 text-center">
          <h2 className="title-3">{t("No campaigns yet")}</h2>
          <p className="footnote mx-auto mt-1.5 max-w-sm">
            {t("Create your first comment-to-DM campaign to turn a post or reel into a measurable conversation flow.")}
          </p>
          <Link href="/campaigns/new" className="btn btn-primary mt-5">
            {t("Create Campaign")}
          </Link>
        </div>
      )}

      {/* No matches for the current filter */}
      {automations.length > 0 && filtered.length === 0 && (
        <div className="group px-6 py-10 text-center">
          <p className="footnote">{t("No campaigns match your search.")}</p>
        </div>
      )}

      {/* Campaign list */}
      {filtered.length > 0 && (
        <div>
          <div className="group">
            {filtered.map((auto) => {
              const videoUrl = auto.postId ? videos[auto.postId] : undefined;
              const thumb = auto.postId ? thumbnails[auto.postId] : undefined;
              const keywordText = auto.matchAnyWord
                ? t("Any comment")
                : auto.keywords.join(", ");
              const postText = auto.matchAnyPost
                ? t("Any post or reel")
                : auto.pendingNextReel
                  ? null
                  : t("A specific post or reel");
              const extras = [
                auto.requireFollow ? t("Follow gate") : null,
                auto.trackedLinks.length >= 2 ? t("2 links") : null,
                accounts.length > 1 ? `@${auto.instagramAccount.username}` : null,
              ].filter(Boolean) as string[];
              return (
                <div
                  key={auto.id}
                  role="link"
                  tabIndex={0}
                  aria-label={auto.name}
                  onClick={() => router.push(`/campaigns/${auto.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.target === e.currentTarget) {
                      router.push(`/campaigns/${auto.id}`);
                    }
                  }}
                  className="group-row cursor-pointer gap-3 py-3 pr-3 transition-colors hover:bg-surface-hover sm:gap-4"
                >
                  {thumb && (
                    videoUrl ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPlayingVideo({ url: videoUrl, postUrl: auto.postUrl });
                        }}
                        aria-label={t("Play reel preview")}
                        className="shrink-0 rounded-[8px]"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={thumb}
                          alt={t("Campaign reel")}
                          className="size-11 rounded-[8px] object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      </button>
                    ) : (
                      <a
                        href={auto.postUrl ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 rounded-[8px]"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={thumb}
                          alt={t("Campaign post")}
                          className="size-11 rounded-[8px] object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      </a>
                    )
                  )}

                  {/* Name, status, trigger */}
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <p className="truncate text-[15px] font-medium leading-5">
                        {auto.name}
                      </p>
                      <span
                        className={`shrink-0 text-[13px] ${
                          auto.isActive ? "text-success" : "text-muted"
                        }`}
                      >
                        {auto.isActive ? t("Active") : t("Paused")}
                      </span>
                    </div>
                    <p className="footnote mt-0.5 truncate">
                      {keywordText}
                      {postText && <> · {postText}</>}
                      {auto.pendingNextReel && (
                        <>
                          {" · "}
                          <span className="text-warning">{t("Waiting for next reel")}</span>
                        </>
                      )}
                      {extras.map((extra) => (
                        <span key={extra}> · {extra}</span>
                      ))}
                    </p>
                    <p className="mt-0.5 hidden truncate text-[13px] leading-[18px] text-tertiary sm:block">
                      &ldquo;{auto.dmMessage}{t("”")}
                    </p>
                    {/* Phones have no room for the number columns. */}
                    <p className="footnote mt-0.5 truncate md:hidden">
                      <span className="numeral text-foreground">{auto.analytics.sent}</span>{" "}
                      {t("sent")} ·{" "}
                      <span className="numeral text-foreground">{auto.analytics.clicks}</span>{" "}
                      {t("clicks")}
                      {copiedId === auto.id && (
                        <span className="text-accent-text"> · {t("Copied!")}</span>
                      )}
                    </p>
                    {copiedId === auto.id && (
                      <p className="footnote mt-0.5 hidden text-accent-text md:block">
                        {t("Copied!")}
                      </p>
                    )}
                  </div>

                  {/* Numbers */}
                  <dl className="hidden shrink-0 items-center md:flex">
                    <Metric label={t("DMs")} value={auto.analytics.sent} />
                    <Metric label={t("Clicks")} value={auto.analytics.clicks} />
                    <Metric label={t("CTR")} value={formatPercent(auto.analytics.ctr, locale)} />
                  </dl>

                  {/* Controls */}
                  <div
                    className="flex shrink-0 items-center gap-1 sm:gap-2"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      role="switch"
                      aria-checked={auto.isActive}
                      aria-label={t("Active campaign")}
                      onClick={() => toggleActive(auto.id, auto.isActive)}
                      className="switch"
                    />
                    <button
                      type="button"
                      onClick={(e) => openMenu(auto.id, e.currentTarget)}
                      aria-label={t("More actions")}
                      aria-haspopup="menu"
                      aria-expanded={menuOpenId === auto.id}
                      className={`grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-foreground ${
                        menuOpenId === auto.id ? "bg-surface-2 text-foreground" : ""
                      }`}
                    >
                      <Ellipsis aria-hidden strokeWidth={2} className="size-[18px]" />
                    </button>
                  </div>
                  <ChevronRight
                    aria-hidden
                    strokeWidth={2}
                    className="chevron -ml-1 hidden size-4 sm:block"
                  />
                </div>
              );
            })}
          </div>
          <p className="group-footer">
            {filtered.length !== automations.length
              ? t("{count} of {total} campaigns", { count: filtered.length, total: automations.length })
              : t(automations.length === 1 ? "{count} campaign" : "{count} campaigns", { count: automations.length })}
          </p>
        </div>
      )}

      {/* Row menu */}
      {menu && menuCampaign && (
        <RowMenu
          top={menu.top}
          right={menu.right}
          onClose={closeMenu}
        >
          {menuCampaign.postUrl && (
            <MenuItem onSelect={() => void copyReelUrl(menuCampaign)}>
              {t("Copy URL")}
            </MenuItem>
          )}
          <MenuItem onSelect={() => void duplicateAutomation(menuCampaign.id)}>
            {t("Duplicate")}
          </MenuItem>
          <div role="separator" className="mx-2.5 my-1 border-t-[0.5px] border-border-hover" />
          <MenuItem
            destructive
            onSelect={() => {
              closeMenu();
              void deleteAutomation(menuCampaign.id);
            }}
          >
            {t("Delete")}
          </MenuItem>
        </RowMenu>
      )}

      {/* Reel lightbox */}
      {playingVideo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPlayingVideo(null)}
        >
          <div
            className="relative flex max-w-full flex-col items-end gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              {playingVideo.postUrl && (
                <a
                  href={playingVideo.postUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-sm bg-white/15 text-white hover:bg-white/25"
                >
                  {t("Open on Instagram")}
                </a>
              )}
              <button
                type="button"
                onClick={() => setPlayingVideo(null)}
                className="btn btn-sm bg-white/15 text-white hover:bg-white/25"
              >
                {t("Close")}
              </button>
            </div>
            <video
              src={playingVideo.url}
              controls
              autoPlay
              loop
              playsInline
              className="max-h-[80vh] max-w-full rounded-xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="w-[68px] text-right">
      <dd className="numeral text-[15px] font-semibold leading-5 text-foreground">
        {value}
      </dd>
      <dt className="caption mt-0.5">{label}</dt>
    </div>
  );
}

/**
 * Translucent action menu anchored under the row's "more" button. Portaled to
 * <body> and positioned `fixed`, so the grouped list (overflow hidden) never
 * clips it.
 */
function RowMenu({
  top,
  right,
  onClose,
  children,
}: {
  top: number;
  right: number;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Element;
      // The anchor button toggles the menu itself on click.
      if (target.closest?.('[aria-haspopup="menu"][aria-expanded="true"]')) return;
      if (!ref.current?.contains(target)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const items = Array.from(
        ref.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? []
      );
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const step = e.key === "ArrowDown" ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    };
    const onDismiss = () => onClose();
    // Defer so the click that opened the menu does not immediately close it.
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointer);
    }, 0);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onDismiss, true);
    window.addEventListener("resize", onDismiss);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onDismiss, true);
      window.removeEventListener("resize", onDismiss);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{ top, right }}
      className="popover fixed z-50 w-48 p-1.5"
    >
      {children}
    </div>,
    document.body
  );
}

function MenuItem({
  onSelect,
  destructive = false,
  children,
}: {
  onSelect: () => void;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className={`block w-full rounded-[6px] px-2.5 py-1.5 text-left text-[14px] outline-none hover:bg-accent hover:text-on-accent focus-visible:bg-accent focus-visible:text-on-accent ${
        destructive ? "text-error" : "text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
