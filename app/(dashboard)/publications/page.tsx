"use client";

/**
 * Publications — publicar e agendar posts do feed (foto, carrossel, reel).
 *
 * Large title, um compositor em grupo (mídia, legenda, quando, campanha) e a
 * lista das publicações como grouped inset list: miniatura, legenda, horário e
 * o status em texto colorido. O agendamento roda no servidor (cron publish-due),
 * então o post sai mesmo com o computador desligado.
 */

import { useI18n } from "@/lib/i18n/provider";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Check, ChevronsUpDown, ImagePlus, Plus, X } from "lucide-react";

type Status = "SCHEDULED" | "PROCESSING" | "PUBLISHED" | "FAILED" | "CANCELED";
type Media = { id: string; kind: "IMAGE" | "VIDEO"; url: string };
type Publication = {
  id: string;
  mediaType: "IMAGE" | "CAROUSEL" | "REEL";
  caption: string;
  scheduledAt: string;
  status: Status;
  lastError: string | null;
  permalink: string | null;
  publishedAt: string | null;
  automationId: string | null;
  media: Media[];
};
type Campaign = { id: string; name: string; keywords: string[]; isActive: boolean };
type Draft = { file: File; preview: string; kind: "IMAGE" | "VIDEO" };

const ACCEPT = "image/jpeg,image/png,video/mp4,video/quicktime";

function localInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function CampaignMenu({
  campaigns,
  value,
  onChange,
}: {
  campaigns: Campaign[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const current = campaigns.find((c) => c.id === value);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e instanceof MouseEvent && btn.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          const r = btn.current!.getBoundingClientRect();
          setPos({ top: r.bottom + 6, left: r.left, width: Math.max(r.width, 260) });
          setOpen((o) => !o);
        }}
        className="btn btn-secondary max-w-full justify-between gap-2"
      >
        <span className="truncate">{current ? current.name : t("No campaign")}</span>
        <ChevronsUpDown aria-hidden strokeWidth={2} className="size-3.5 shrink-0 opacity-70" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            role="listbox"
            className="popover fixed z-50 max-h-72 overflow-y-auto p-1"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {[{ id: null as string | null, name: t("No campaign"), keywords: [] as string[] }, ...campaigns].map((c) => (
              <button
                key={c.id ?? "none"}
                type="button"
                role="option"
                aria-selected={value === c.id}
                onClick={() => {
                  onChange(c.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[14px] hover:bg-surface-hover"
              >
                <Check aria-hidden strokeWidth={2.4} className={`size-3.5 shrink-0 ${value === c.id ? "text-accent" : "invisible"}`} />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                {c.keywords.length > 0 && <span className="caption shrink-0">{c.keywords.join(", ")}</span>}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}

export default function PublicationsPage() {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<Publication[] | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [filter, setFilter] = useState<"upcoming" | "published" | "failed" | "all">("upcoming");
  const [composing, setComposing] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [caption, setCaption] = useState("");
  const [mode, setMode] = useState<"now" | "schedule">("schedule");
  const [when, setWhen] = useState(() => localInputValue(new Date(Date.now() + 60 * 60_000)));
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const fmt = useMemo(
    () => new Intl.DateTimeFormat(locale === "en" ? "en-US" : locale, { dateStyle: "medium", timeStyle: "short" }),
    [locale]
  );

  const load = useCallback(async () => {
    const r = await fetch("/api/publications", { cache: "no-store" });
    const j = await r.json().catch(() => null);
    if (j?.success) setItems(j.data);
    else setItems([]);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial
    load();
    fetch("/api/automations", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => j?.success && setCampaigns(j.data))
      .catch(() => {});
  }, [load]);

  // acompanha o que está saindo: o servidor muda o status sozinho
  const moving = items?.some((p) => p.status === "PROCESSING" || p.status === "SCHEDULED");
  useEffect(() => {
    if (!moving) return;
    const id = window.setInterval(load, 15_000);
    return () => window.clearInterval(id);
  }, [moving, load]);

  useEffect(() => () => drafts.forEach((d) => URL.revokeObjectURL(d.preview)), [drafts]);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = Array.from(list)
      .slice(0, 10 - drafts.length)
      .map((file) => ({ file, preview: URL.createObjectURL(file), kind: (file.type.startsWith("video/") ? "VIDEO" : "IMAGE") as Draft["kind"] }));
    setDrafts((d) => [...d, ...next]);
    setError(null);
  }

  function move(i: number, dir: -1 | 1) {
    setDrafts((d) => {
      const n = [...d];
      const j = i + dir;
      if (j < 0 || j >= n.length) return d;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  }

  function reset() {
    setDrafts([]);
    setCaption("");
    setCampaignId(null);
    setMode("schedule");
    setWhen(localInputValue(new Date(Date.now() + 60 * 60_000)));
    setComposing(false);
    setError(null);
  }

  const kindLabel = drafts.length > 1 ? t("Carousel") : drafts[0]?.kind === "VIDEO" ? t("Reel") : t("Photo");

  async function submit() {
    setError(null);
    if (drafts.length === 0) return setError(t("Add at least one photo or video."));
    const scheduledAt = mode === "now" ? null : new Date(when);
    if (scheduledAt && scheduledAt.getTime() < Date.now() - 60_000) return setError(t("Pick a time in the future."));
    setBusy(true);
    try {
      const form = new FormData();
      drafts.forEach((d) => form.append("file", d.file));
      const up = await fetch("/api/publications/media", { method: "POST", body: form }).then((r) => r.json());
      if (!up?.success) throw new Error(up?.error ?? t("Upload failed"));
      const res = await fetch("/api/publications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caption,
          scheduledAt: scheduledAt ? scheduledAt.toISOString() : null,
          mediaIds: up.data.map((m: Media) => m.id),
          automationId: campaignId,
        }),
      }).then((r) => r.json());
      if (!res?.success) throw new Error(res?.error ?? t("Could not save the publication."));
      reset();
      setFilter(mode === "now" ? "all" : "upcoming");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function act(p: Publication, action: "publish" | "cancel") {
    if (action === "cancel" && !window.confirm(t("Cancel this publication?"))) return;
    await fetch(action === "publish" ? `/api/publications/${p.id}/publish` : `/api/publications/${p.id}`, {
      method: action === "publish" ? "POST" : "DELETE",
    });
    await load();
  }

  const statusText: Record<Status, { label: string; cls: string }> = {
    SCHEDULED: { label: t("Scheduled"), cls: "text-accent-text" },
    PROCESSING: { label: t("Publishing…"), cls: "text-warning" },
    PUBLISHED: { label: t("Published"), cls: "text-success" },
    FAILED: { label: t("Failed"), cls: "text-error" },
    CANCELED: { label: t("Canceled"), cls: "text-muted" },
  };

  const shown = (items ?? []).filter((p) =>
    filter === "all"
      ? true
      : filter === "upcoming"
        ? p.status === "SCHEDULED" || p.status === "PROCESSING"
        : filter === "published"
          ? p.status === "PUBLISHED"
          : p.status === "FAILED"
  );
  if (filter === "upcoming") shown.sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <h1 className="large-title">{t("Publications")}</h1>
        {!composing && (
          <button type="button" className="btn btn-primary" onClick={() => setComposing(true)}>
            <Plus aria-hidden strokeWidth={2.2} className="-ml-0.5 size-4" />
            {t("New publication")}
          </button>
        )}
      </div>

      {composing && (
        <section aria-label={t("New publication")}>
          <div className="group-header">{t("New publication")}</div>
          <div className="group">
            {/* Mídia */}
            <div className="px-4 py-4">
              <div className="flex flex-wrap gap-3">
                {drafts.map((d, i) => (
                  <figure key={d.preview} className="relative w-[112px] shrink-0">
                    {d.kind === "VIDEO" ? (
                      <video src={d.preview} muted playsInline className="aspect-[4/5] w-full rounded-[10px] bg-surface-2 object-cover" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={d.preview} alt="" className="aspect-[4/5] w-full rounded-[10px] bg-surface-2 object-cover" />
                    )}
                    <figcaption className="mt-1.5 flex items-center justify-between">
                      <span className="caption">{i + 1}</span>
                      <span className="flex items-center gap-0.5">
                        <button type="button" aria-label={t("Move left")} disabled={i === 0} onClick={() => move(i, -1)} className="btn btn-plain p-1 disabled:opacity-30">
                          <ArrowLeft aria-hidden strokeWidth={2} className="size-3.5" />
                        </button>
                        <button type="button" aria-label={t("Move right")} disabled={i === drafts.length - 1} onClick={() => move(i, 1)} className="btn btn-plain p-1 disabled:opacity-30">
                          <ArrowRight aria-hidden strokeWidth={2} className="size-3.5" />
                        </button>
                        <button type="button" aria-label={t("Remove")} onClick={() => setDrafts((all) => all.filter((_, j) => j !== i))} className="btn btn-plain p-1 text-error">
                          <X aria-hidden strokeWidth={2} className="size-3.5" />
                        </button>
                      </span>
                    </figcaption>
                  </figure>
                ))}
                {drafts.length < 10 && (
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      addFiles(e.dataTransfer.files);
                    }}
                    className="flex aspect-[4/5] w-[112px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-[10px] bg-surface-2 text-accent-text transition-colors hover:bg-surface-hover"
                  >
                    <ImagePlus aria-hidden strokeWidth={1.9} className="size-5" />
                    <span className="text-[12px]">{t("Add")}</span>
                  </button>
                )}
              </div>
              <input ref={fileInput} type="file" accept={ACCEPT} multiple hidden onChange={(e) => addFiles(e.target.files)} />
              <p className="footnote mt-3">
                {drafts.length > 0 ? `${kindLabel} · ` : ""}
                {t("JPEG or PNG up to 8 MB, MP4 or MOV up to 300 MB. Up to 10 items in a carousel.")}
              </p>
            </div>

            {/* Legenda */}
            <div className="group-row flex-col items-stretch gap-2 py-3">
              <label htmlFor="pub-caption" className="text-[14px] font-medium">
                {t("Caption")}
              </label>
              <textarea
                id="pub-caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value.slice(0, 2200))}
                rows={6}
                className="field resize-y py-2 text-[14px] leading-[20px]"
              />
              <span className="caption self-end">{caption.length}/2200</span>
            </div>

            {/* Quando */}
            <div className="group-row flex-wrap gap-3 py-3">
              <span className="min-w-28 text-[14px] font-medium">{t("When")}</span>
              <div role="radiogroup" aria-label={t("When")} className="segmented">
                <button type="button" role="radio" aria-checked={mode === "now"} onClick={() => setMode("now")}>
                  {t("Publish now")}
                </button>
                <button type="button" role="radio" aria-checked={mode === "schedule"} onClick={() => setMode("schedule")}>
                  {t("Schedule")}
                </button>
              </div>
              {mode === "schedule" && (
                <input
                  type="datetime-local"
                  value={when}
                  min={localInputValue(new Date())}
                  onChange={(e) => setWhen(e.target.value)}
                  className="field h-9 min-h-0 w-auto px-3 text-[14px]"
                />
              )}
            </div>

            {/* Campanha */}
            <div className="group-row flex-wrap gap-3 py-3">
              <span className="min-w-28 text-[14px] font-medium">{t("Campaign")}</span>
              <CampaignMenu campaigns={campaigns} value={campaignId} onChange={setCampaignId} />
              <span className="footnote">{t("Turns on for this post as soon as it goes live.")}</span>
            </div>
          </div>
          {error && (
            <p role="alert" className="group-footer text-error">
              {error}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={reset} disabled={busy}>
              {t("Cancel")}
            </button>
            <button type="button" className="btn btn-primary" onClick={submit} disabled={busy || drafts.length === 0}>
              {busy ? t("Saving…") : mode === "now" ? t("Publish now") : t("Schedule")}
            </button>
          </div>
        </section>
      )}

      <div role="radiogroup" aria-label={t("Status")} className="segmented">
        {(
          [
            ["upcoming", t("Upcoming")],
            ["published", t("Published posts")],
            ["failed", t("With errors")],
            ["all", t("All")],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={filter === k} onClick={() => setFilter(k)}>
            {l}
          </button>
        ))}
      </div>

      {items === null ? (
        <div className="group">
          {[0, 1].map((i) => (
            <div key={i} className="group-row min-h-[76px]">
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-40 rounded bg-surface-2" />
                <div className="h-3 w-64 max-w-full rounded bg-surface-2" />
              </div>
            </div>
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="group px-6 py-14 text-center">
          <h2 className="title-3">{t("No publications here")}</h2>
          <p className="footnote mx-auto mt-1.5 max-w-sm">
            {t("Schedule a photo, carousel or reel and it goes out on its own, even with your computer off.")}
          </p>
        </div>
      ) : (
        <div className="group">
          {shown.map((p) => {
            const st = statusText[p.status];
            const first = p.media[0];
            const date = new Date(p.status === "PUBLISHED" && p.publishedAt ? p.publishedAt : p.scheduledAt);
            const campaign = campaigns.find((c) => c.id === p.automationId);
            const type = p.mediaType === "CAROUSEL" ? t("Carousel") : p.mediaType === "REEL" ? t("Reel") : t("Photo");
            return (
              <div key={p.id} className="group-row gap-3 py-3 pr-3 sm:gap-4">
                {first &&
                  (first.kind === "VIDEO" ? (
                    <video src={first.url} muted playsInline preload="metadata" className="size-12 shrink-0 rounded-[8px] bg-surface-2 object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={first.url} alt="" className="size-12 shrink-0 rounded-[8px] bg-surface-2 object-cover" />
                  ))}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px]">{p.caption.split("\n")[0] || t("No caption")}</p>
                  <p className="footnote mt-0.5 truncate">
                    <span className={st.cls}>{st.label}</span>
                    {" · "}
                    {fmt.format(date)}
                    {" · "}
                    {type}
                    {p.media.length > 1 ? ` (${p.media.length})` : ""}
                    {campaign ? ` · ${campaign.name}` : ""}
                  </p>
                  {p.status === "FAILED" && p.lastError && <p className="caption mt-1 line-clamp-2 text-error">{p.lastError}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {p.permalink && (
                    <a href={p.permalink} target="_blank" rel="noreferrer" className="btn btn-plain text-[14px]">
                      {t("View on Instagram")}
                    </a>
                  )}
                  {(p.status === "SCHEDULED" || p.status === "FAILED") && (
                    <>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => act(p, "publish")}>
                        {p.status === "FAILED" ? t("Retry") : t("Publish now")}
                      </button>
                      <button type="button" className="btn btn-destructive btn-sm" onClick={() => act(p, "cancel")}>
                        {t("Cancel")}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
