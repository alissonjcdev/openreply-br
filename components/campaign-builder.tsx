"use client";

/**
 * Campaign Builder
 *
 * Two-pane campaign editor: a control panel on the left and a live phone
 * preview on the right. Used for both creating and editing a campaign.
 *
 * Turn 1 wires the fully-functional pieces: trigger scope (specific / any /
 * next post), match mode (specific words / any word), the opening + reveal DM
 * text, public reply, and the tracked link. Button-driven delivery and the
 * follow / email / follow-up steps arrive in later turns.
 */

import { useI18n } from "@/lib/i18n/provider";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AccountSelect, { type AccountOption } from "@/components/account-select";
import PostPicker from "@/components/post-picker";
import KeywordInput from "@/components/keyword-input";
import { Check, Plus, X } from "lucide-react";
import CampaignPreview, { type PreviewTab } from "@/components/campaign-preview";
import { readCache, writeCache } from "@/lib/client-cache";
import {
  IMPORT_QUEUE_KEY,
  IMPORT_ACCOUNT_KEY,
  type ImportRow,
} from "@/lib/import-queue";

type TriggerScope = "specific" | "any" | "next";
type MatchMode = "specific" | "any";

interface LoadedCampaign {
  id: string;
  name: string;
  postId: string | null;
  postUrl: string | null;
  pendingNextReel: boolean;
  matchAnyPost: boolean;
  keywords: string[];
  matchAnyWord: boolean;
  dmTriggerEnabled: boolean;
  dmMessage: string;
  openingDmEnabled: boolean;
  openingDmMessage: string | null;
  openingDmButtonLabel: string | null;
  linkButtonLabel: string | null;
  requireFollow: boolean;
  followPromptMessage: string | null;
  followPromptButtonLabel: string | null;
  followUpEnabled: boolean;
  followUpMessage: string | null;
  followUpDelayMinutes: number | null;
  publicReplyEnabled: boolean;
  publicReplyMessage: string | null;
  publicReplyMessages: string[];
  isActive: boolean;
  instagramAccountId: string;
  trackedLinks?: { destinationUrl: string; label?: string | null }[];
}

interface CampaignBuilderProps {
  mode: "new" | "edit";
  campaignId?: string;
}

/* ---------- Settings-style form pieces (grouped inset lists) ---------- */

function FormSection({
  header,
  footer,
  role,
  className = "",
  children,
}: {
  header?: string;
  footer?: React.ReactNode;
  role?: "radiogroup";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`min-w-0 ${className}`}>
      {header && <h2 className="group-header">{header}</h2>}
      <div className="group" role={role} aria-label={role ? header : undefined}>
        {children}
      </div>
      {footer && <p className="group-footer">{footer}</p>}
    </section>
  );
}

/** iOS selection-list row: label on the left, tinted checkmark when chosen. */
function ChoiceRow({
  checked,
  onSelect,
  children,
}: {
  checked: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className="group-row w-full text-left text-[15px] text-foreground"
    >
      <span className="min-w-0 flex-1 first-letter:uppercase">{children}</span>
      <Check
        aria-hidden
        strokeWidth={2.4}
        className={`size-[18px] shrink-0 text-accent ${checked ? "" : "invisible"}`}
      />
    </button>
  );
}

/** Label + iOS switch. The whole row is not the hit target, like Settings. */
function SwitchRow({
  on,
  onToggle,
  children,
}: {
  on: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="group-row text-[15px] text-foreground">
      <span className="min-w-0 flex-1 first-letter:uppercase">{children}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={onToggle}
        className="switch"
      >
        <span className="sr-only">{children}</span>
      </button>
    </div>
  );
}

/** Short field with its label on the leading edge (stacks on phones). */
function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="group-row flex-col items-stretch gap-1.5 sm:flex-row sm:items-center sm:gap-4">
      <span className="shrink-0 text-[15px] text-foreground sm:w-36">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}

/** Tinted text row that adds something ("Adicionar link"). */
function AddRow({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group-row w-full text-left text-[15px] text-accent-text"
    >
      <Plus aria-hidden strokeWidth={2} className="size-[18px] shrink-0" />
      <span>{children}</span>
    </button>
  );
}

/** Older copy keys start with "+ "; the row draws its own plus icon. */
function stripPlus(label: string) {
  return label.replace(/^\+\s*/, "");
}

export default function CampaignBuilder({ mode, campaignId }: CampaignBuilderProps) {
  const { t } = useI18n();
  const router = useRouter();

  const [loading, setLoading] = useState(mode === "edit");
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);

  const [triggerScope, setTriggerScope] = useState<TriggerScope>("specific");
  const [postId, setPostId] = useState<string | null>(null);
  const [postUrl, setPostUrl] = useState<string | null>(null);
  const [postThumb, setPostThumb] = useState<string | null>(null);
  const [postCaption, setPostCaption] = useState("");

  // Post IDs already tied to another automation on this account, so the picker
  // can flag them and the user knows not to double-assign. Maps postId ->
  // the campaign name using it (for the tooltip).
  const [usedPosts, setUsedPosts] = useState<Record<string, string>>({});

  const [matchMode, setMatchMode] = useState<MatchMode>("specific");
  const [keywordText, setKeywordText] = useState("");
  const [dmTriggerEnabled, setDmTriggerEnabled] = useState(false);

  const [publicReplyEnabled, setPublicReplyEnabled] = useState(false);
  const [publicReplyMessages, setPublicReplyMessages] = useState<string[]>([""]);

  const [openingDmEnabled, setOpeningDmEnabled] = useState(false);
  const [openingDmMessage, setOpeningDmMessage] = useState("");
  const [openingDmButtonLabel, setOpeningDmButtonLabel] = useState("");

  const [dmMessage, setDmMessage] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [trackedDestinationUrl, setTrackedDestinationUrl] = useState("");
  const [linkButtonLabel, setLinkButtonLabel] = useState("Abrir link");
  const [secondLinkOpen, setSecondLinkOpen] = useState(false);
  const [secondaryDestinationUrl, setSecondaryDestinationUrl] = useState("");
  const [secondaryButtonLabel, setSecondaryButtonLabel] = useState("Abrir link");
  const [requireFollow, setRequireFollow] = useState(false);
  const [followPromptMessage, setFollowPromptMessage] = useState("");
  const [followPromptButtonLabel, setFollowPromptButtonLabel] =
    useState("Já estou seguindo");
  const [followUpEnabled, setFollowUpEnabled] = useState(false);
  const [followUpMessage, setFollowUpMessage] = useState("");
  const [followUpDelayMinutes, setFollowUpDelayMinutes] = useState(0);

  const [previewTab, setPreviewTab] = useState<PreviewTab>("dm");

  // CSV import queue. When present, each save advances to the next row instead
  // of returning to the campaigns list.
  const [importQueue, setImportQueue] = useState<ImportRow[] | null>(null);
  const [importTotal, setImportTotal] = useState(0);

  const keywords = useMemo(
    () =>
      keywordText
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
    [keywordText]
  );

  // Fetch the connected account's real avatar for the preview (cache-first so
  // it shows instantly on a return visit instead of a blank circle).
  useEffect(() => {
    if (!selectedAccountId) return;
    let cancelled = false;
    const cacheKey = `ig-avatar:${selectedAccountId}`;
    const cached = readCache<string | null>(cacheKey, 30 * 60 * 1000);
    // Hydrating state from cache is a legitimate effect use here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cached.data !== null) setAvatarUrl(cached.data);

    const params = new URLSearchParams({ instagramAccountId: selectedAccountId });
    fetch(`/api/instagram/profile?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const url = d.success ? d.data.profilePictureUrl ?? null : null;
        setAvatarUrl(url);
        writeCache(cacheKey, url);
      })
      .catch(() => {
        if (!cancelled && cached.data === null) setAvatarUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedAccountId]);

  // Load accounts (both modes need them for the preview username + selector).
  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((r) => r.json())
      .then((payload) => {
        if (!payload.success) return;
        const next: AccountOption[] = payload.data.instagramAccounts ?? [];
        setAccounts(next);
        setSelectedAccountId(
          (prev) => prev || payload.data.selectedInstagramAccountId || next[0]?.id || ""
        );
      })
      .catch(() => setAccounts([]));
  }, []);

  // Prefill when editing.
  useEffect(() => {
    if (mode !== "edit" || !campaignId) return;
    fetch("/api/automations", { cache: "no-store" })
      .then((r) => r.json())
      .then((payload) => {
        if (!payload.success) return setNotFound(true);
        const c = (payload.data as LoadedCampaign[]).find((x) => x.id === campaignId);
        if (!c) return setNotFound(true);
        setName(c.name);
        setSelectedAccountId(c.instagramAccountId);
        setTriggerScope(
          c.matchAnyPost ? "any" : c.pendingNextReel ? "next" : "specific"
        );
        setPostId(c.postId);
        setPostUrl(c.postUrl);
        setMatchMode(c.matchAnyWord ? "any" : "specific");
        setKeywordText(c.keywords.join(", "));
        setDmTriggerEnabled(c.dmTriggerEnabled ?? false);
        setPublicReplyEnabled(c.publicReplyEnabled);
        setPublicReplyMessages(
          c.publicReplyMessages?.length
            ? c.publicReplyMessages
            : c.publicReplyMessage
              ? [c.publicReplyMessage]
              : [""]
        );
        setOpeningDmEnabled(c.openingDmEnabled);
        setOpeningDmMessage(c.openingDmMessage ?? "");
        setOpeningDmButtonLabel(c.openingDmButtonLabel ?? "");
        setDmMessage(c.dmMessage);
        setLinkButtonLabel(c.linkButtonLabel ?? "Abrir link");
        setIsActive(c.isActive);
        const link = c.trackedLinks?.[0]?.destinationUrl ?? "";
        setTrackedDestinationUrl(link);
        setLinkOpen(Boolean(link));
        const secondLink = c.trackedLinks?.[1];
        setSecondaryDestinationUrl(secondLink?.destinationUrl ?? "");
        setSecondaryButtonLabel(secondLink?.label ?? "Abrir link");
        setSecondLinkOpen(Boolean(secondLink?.destinationUrl));
        setRequireFollow(c.requireFollow ?? false);
        setFollowPromptMessage(c.followPromptMessage ?? "");
        setFollowPromptButtonLabel(
          c.followPromptButtonLabel ?? "Já estou seguindo"
        );
        setFollowUpEnabled(c.followUpEnabled ?? false);
        setFollowUpMessage(c.followUpMessage ?? "");
        setFollowUpDelayMinutes(c.followUpDelayMinutes ?? 0);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [mode, campaignId]);

  // Track which posts on the selected account are already assigned to an
  // automation, so the picker can highlight them. The campaign being edited is
  // excluded — its own post should read as selected, not "taken".
  useEffect(() => {
    if (!selectedAccountId) return;
    let cancelled = false;
    fetch("/api/automations", { cache: "no-store" })
      .then((r) => r.json())
      .then((payload) => {
        if (cancelled || !payload.success) return;
        const map: Record<string, string> = {};
        for (const a of payload.data as LoadedCampaign[]) {
          if (!a.postId) continue;
          if (a.instagramAccountId !== selectedAccountId) continue;
          if (mode === "edit" && a.id === campaignId) continue;
          map[a.postId] = a.name;
        }
        setUsedPosts(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedAccountId, mode, campaignId]);

  // Prefill the editable fields from one queued import row. The reel is left
  // unset so the user picks it per row.
  function prefillFromRow(row: ImportRow) {
    setName(row.name ?? "");
    setTriggerScope("specific");
    setPostId(null);
    setPostUrl(null);
    setPostThumb(null);
    setPostCaption("");
    setMatchMode("specific");
    setKeywordText((row.keywords ?? []).join(", "));
    setDmMessage(row.dmMessage ?? "");
    setPublicReplyEnabled(Boolean(row.publicReply));
    setPublicReplyMessages(row.publicReply ? [row.publicReply] : [""]);
    const hasOpening = Boolean(row.openingDmMessage);
    setOpeningDmEnabled(hasOpening);
    setOpeningDmMessage(row.openingDmMessage ?? "");
    setOpeningDmButtonLabel(
      row.openingDmButtonLabel || (hasOpening ? "Enviar link" : "")
    );
    const link = row.trackedUrl ?? "";
    setTrackedDestinationUrl(link);
    setLinkOpen(Boolean(link));
    setError(null);
  }

  // Pick up a staged CSV import (new mode only) and prefill the first row.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (mode !== "new") return;
    try {
      const raw = window.localStorage.getItem(IMPORT_QUEUE_KEY);
      const acct = window.localStorage.getItem(IMPORT_ACCOUNT_KEY);
      if (!raw) return;
      const queue = JSON.parse(raw) as ImportRow[];
      if (!Array.isArray(queue) || queue.length === 0) return;
      setImportQueue(queue);
      setImportTotal(queue.length);
      if (acct) setSelectedAccountId(acct);
      prefillFromRow(queue[0]);
    } catch {
      // ignore a malformed queue
    }
  }, [mode]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const username =
    accounts.find((a) => a.id === selectedAccountId)?.username ?? "yourbrand";

  function handlePostSelect(
    id: string,
    url?: string,
    thumb?: string,
    caption?: string
  ) {
    setPostId(id);
    setPostUrl(url ?? null);
    setPostThumb(thumb ?? null);
    setPostCaption(caption ?? "");
  }

  function ensureLinkToken() {
    setDmMessage((cur) => (cur.includes("{link}") ? cur : `${cur.trim()} {link}`.trim()));
  }

  async function handleSubmit(activeValue: boolean) {
    setError(null);

    if (!selectedAccountId) return setError(t("Connect an Instagram account first."));
    if (triggerScope === "specific" && !postId)
      return setError(t("Pick a post or reel to trigger the campaign."));
    if (matchMode === "specific" && keywords.length === 0)
      return setError(t("Add at least one keyword, or switch to any word."));
    if (!dmMessage.trim()) return setError(t("Add the DM with the link."));
    if (openingDmEnabled && (!openingDmMessage.trim() || !openingDmButtonLabel.trim()))
      return setError(t("Your opening DM needs a message and a button label."));

    setSaving(true);

    const payload = {
      name: name.trim() || t("Campaign for @{username}", { username }),
      instagramAccountId: selectedAccountId,
      postId: triggerScope === "specific" ? postId : null,
      postUrl: triggerScope === "specific" ? postUrl : null,
      matchAnyPost: triggerScope === "any",
      pendingNextReel: triggerScope === "next",
      matchAnyWord: matchMode === "any",
      keywords: matchMode === "any" ? [] : keywords,
      dmTriggerEnabled,
      dmMessage,
      openingDmEnabled,
      openingDmMessage: openingDmEnabled ? openingDmMessage : null,
      openingDmButtonLabel: openingDmEnabled ? openingDmButtonLabel : null,
      publicReplyEnabled,
      publicReplyMessages: publicReplyEnabled
        ? publicReplyMessages.map((m) => m.trim()).filter(Boolean)
        : [],
      trackedDestinationUrl: trackedDestinationUrl.trim() || "",
      linkButtonLabel: linkButtonLabel.trim() || "Abrir link",
      secondaryDestinationUrl: secondaryDestinationUrl.trim() || "",
      secondaryButtonLabel: secondaryButtonLabel.trim() || "Abrir link",
      requireFollow,
      followPromptMessage: requireFollow ? followPromptMessage.trim() : "",
      followPromptButtonLabel: requireFollow
        ? followPromptButtonLabel.trim() || "Já estou seguindo"
        : "",
      followUpEnabled,
      followUpMessage: followUpEnabled ? followUpMessage.trim() : "",
      followUpDelayMinutes: followUpEnabled ? followUpDelayMinutes : 0,
      isActive: activeValue,
    };

    try {
      const res =
        mode === "new"
          ? await fetch("/api/automations", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
          : await fetch(`/api/automations?id=${campaignId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
      const data = await res.json();
      if (data.success) {
        // The post we just assigned is now in use. Reflect it immediately so
        // the picker flags it on the next imported row — the fetch that builds
        // this map doesn't re-run while the builder stays mounted through the
        // import queue.
        if (triggerScope === "specific" && postId) {
          const assignedPostId = postId;
          setUsedPosts((prev) => ({ ...prev, [assignedPostId]: payload.name }));
        }
        // Importing: advance to the next queued row instead of leaving.
        if (importQueue && importQueue.length > 1) {
          const remaining = importQueue.slice(1);
          try {
            window.localStorage.setItem(
              IMPORT_QUEUE_KEY,
              JSON.stringify(remaining)
            );
          } catch {
            // ignore
          }
          setImportQueue(remaining);
          prefillFromRow(remaining[0]);
          setSaving(false);
          if (typeof window !== "undefined") window.scrollTo({ top: 0 });
          return;
        }
        if (importQueue) {
          try {
            window.localStorage.removeItem(IMPORT_QUEUE_KEY);
            window.localStorage.removeItem(IMPORT_ACCOUNT_KEY);
          } catch {
            // ignore
          }
        }
        // refresh() busts the router cache so the list reflects the save
        // instead of landing on a stale (empty) campaigns page.
        router.push("/campaigns");
        router.refresh();
      } else {
        // Surface the specific field that failed validation instead of a
        // generic "Invalid input".
        const fieldErrors = data.details?.fieldErrors as
          | Record<string, string[]>
          | undefined;
        const firstField = fieldErrors && Object.keys(fieldErrors)[0];
        setError(
          firstField
            ? `${firstField}: ${fieldErrors[firstField][0]}`
            : data.error ?? t("Failed to save campaign")
        );
        if (typeof window !== "undefined")
          window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch {
      setError(t("Failed to save campaign"));
    } finally {
      setSaving(false);
    }
  }

  // Skip the current imported row without saving a campaign for it, advancing
  // to the next one (or finishing the import if it was the last).
  function skipRow() {
    if (!importQueue) return;
    setError(null);
    if (importQueue.length > 1) {
      const remaining = importQueue.slice(1);
      try {
        window.localStorage.setItem(IMPORT_QUEUE_KEY, JSON.stringify(remaining));
      } catch {
        // ignore
      }
      setImportQueue(remaining);
      prefillFromRow(remaining[0]);
      if (typeof window !== "undefined") window.scrollTo({ top: 0 });
      return;
    }
    // Last row skipped — finish the import.
    try {
      window.localStorage.removeItem(IMPORT_QUEUE_KEY);
      window.localStorage.removeItem(IMPORT_ACCOUNT_KEY);
    } catch {
      // ignore
    }
    router.push("/campaigns");
    router.refresh();
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-64 rounded-md bg-surface-2" />
        <div className="group h-64" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="group mx-auto max-w-md px-6 py-10 text-center">
        <p className="text-[15px] text-muted">{t("Campaign not found.")}</p>
        <button
          type="button"
          onClick={() => router.push("/campaigns")}
          className="btn btn-secondary mt-4"
        >
          {t("Back to campaigns")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title + toolbar */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
          <h1 className="large-title min-w-0 truncate">
            {mode === "edit" ? name || t("Untitled campaign") : t("New campaign")}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            {importQueue && (
              <button
                type="button"
                onClick={skipRow}
                disabled={saving}
                className="btn btn-secondary"
              >
                {importQueue.length > 1 ? t("Skip") : t("Skip & finish")}
              </button>
            )}
            {mode === "edit" &&
              (isActive ? (
                <button
                  type="button"
                  onClick={() => handleSubmit(false)}
                  disabled={saving}
                  className="btn btn-secondary"
                >
                  {t("Stop")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSubmit(true)}
                  disabled={saving}
                  className="btn btn-secondary"
                >
                  {t("Go Live")}
                </button>
              ))}
            <button
              type="button"
              onClick={() => handleSubmit(mode === "new" ? true : isActive)}
              disabled={saving}
              className="btn btn-primary"
            >
              {saving ? t("Saving…") : mode === "new" ? t("Go Live") : t("Save changes")}
            </button>
          </div>
        </div>
        {mode === "edit" && (
          <p className={`mt-0.5 text-[15px] ${isActive ? "text-success" : "text-muted"}`}>
            {isActive ? t("Active") : t("Paused")}
          </p>
        )}
      </div>

      {importQueue && (
        <div className="group px-4 py-3 text-[13px] leading-[18px]">
          <span className="font-semibold text-foreground">
            {t("Importing {current} of {total}.", { current: importTotal - importQueue.length + 1, total: importTotal })}
          </span>{" "}
          <span className="text-muted">
            {t("Fields are prefilled from your CSV. Pick the reel, edit anything, and save to load the next one — or Skip if you don’t want this one.")}
          </span>
        </div>
      )}

      {/* min-w-0 on the cells: a grid item defaults to min-width:auto, so a
          long string widens the whole page instead of wrapping. */}
      <div className="grid gap-10 xl:grid-cols-[minmax(0,560px)_minmax(0,1fr)] xl:gap-12">
        {/* Left: form */}
        <div className="min-w-0 max-w-[560px] space-y-7">
          {error && (
            <div role="alert" className="group px-4 py-3 text-[14px] leading-5 text-error">
              {error}
            </div>
          )}

          <FormSection header={t("Campaign name")}>
            <div className="group-row">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`${t("e.g. YC referral")} ${t("(optional)")}`}
                aria-label={t("Campaign name")}
                className="field"
                maxLength={100}
              />
            </div>
            {accounts.length > 1 && (
              <div className="group-row block">
                <AccountSelect
                  accounts={accounts}
                  value={selectedAccountId}
                  onChange={(id) => {
                    setSelectedAccountId(id);
                    setPostId(null);
                    setPostUrl(null);
                    setPostThumb(null);
                  }}
                  includeAll={false}
                  label={t("Instagram account")}
                />
              </div>
            )}
          </FormSection>

          <FormSection header={t("When someone comments on")} role="radiogroup">
            <ChoiceRow
              checked={triggerScope === "specific"}
              onSelect={() => setTriggerScope("specific")}
            >
              {t("a specific post or reel")}
            </ChoiceRow>
            {triggerScope === "specific" && (
              <div className="group-row block px-3 pb-3 pt-1">
                <PostPicker
                  selectedPostId={postId}
                  instagramAccountId={selectedAccountId}
                  usedPostIds={usedPosts}
                  onSelect={handlePostSelect}
                />
              </div>
            )}
            <ChoiceRow
              checked={triggerScope === "any"}
              onSelect={() => setTriggerScope("any")}
            >
              {t("any post or reel")}
            </ChoiceRow>
            <ChoiceRow
              checked={triggerScope === "next"}
              onSelect={() => setTriggerScope("next")}
            >
              {t("next post or reel")}
            </ChoiceRow>
          </FormSection>

          <div>
            <FormSection header={t("And this comment has")} role="radiogroup">
              <ChoiceRow
                checked={matchMode === "specific"}
                onSelect={() => setMatchMode("specific")}
              >
                {t("a specific word or words")}
              </ChoiceRow>
              {matchMode === "specific" && (
                <div className="group-row block pt-1">
                  <KeywordInput
                    keywords={keywords}
                    onChange={(next) => setKeywordText(next.join(", "))}
                    placeholder={t("Enter a word or multiple")}
                    uppercase={false}
                  />
                </div>
              )}
              <ChoiceRow
                checked={matchMode === "any"}
                onSelect={() => setMatchMode("any")}
              >
                {t("any word")}
              </ChoiceRow>
            </FormSection>
            <FormSection
              className="mt-4"
              footer={
                dmTriggerEnabled
                  ? matchMode === "any"
                    ? t("Every DM to this account gets the reply below — use with care.")
                    : t("A DM containing any of these words gets the same reply, no comment needed.")
                  : undefined
              }
            >
              <SwitchRow
                on={dmTriggerEnabled}
                onToggle={() => setDmTriggerEnabled(!dmTriggerEnabled)}
              >
                {t("also reply when someone DMs")}{" "}
                {matchMode === "any" ? t("anything") : t("these words")}
              </SwitchRow>
            </FormSection>
          </div>

          <FormSection
            header={t("Public reply")}
            footer={
              publicReplyEnabled
                ? t("One is picked at random each time, so replies don't look identical.")
                : undefined
            }
          >
            <SwitchRow
              on={publicReplyEnabled}
              onToggle={() => setPublicReplyEnabled(!publicReplyEnabled)}
            >
              {t("reply to their comments under the post")}
            </SwitchRow>
            {publicReplyEnabled &&
              publicReplyMessages.map((msg, i) => (
                <div key={i} className="group-row gap-2">
                  <input
                    value={msg}
                    onChange={(e) =>
                      setPublicReplyMessages((prev) =>
                        prev.map((m, idx) => (idx === i ? e.target.value : m))
                      )
                    }
                    placeholder={t("Sent you a DM! 📩")}
                    maxLength={1000}
                    className="field"
                  />
                  {publicReplyMessages.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setPublicReplyMessages((prev) =>
                          prev.filter((_, idx) => idx !== i)
                        )
                      }
                      className="grid size-8 shrink-0 place-items-center rounded-full text-tertiary hover:text-error"
                      aria-label={t("Remove reply")}
                    >
                      <X aria-hidden strokeWidth={1.9} className="size-4" />
                    </button>
                  )}
                </div>
              ))}
            {publicReplyEnabled && publicReplyMessages.length < 10 && (
              <AddRow onClick={() => setPublicReplyMessages((prev) => [...prev, ""])}>
                {stripPlus(t("+ Add another reply"))}
              </AddRow>
            )}
          </FormSection>

          <FormSection header={t("Opening DM")}>
            <SwitchRow
              on={openingDmEnabled}
              onToggle={() => setOpeningDmEnabled(!openingDmEnabled)}
            >
              {t("an opening DM")}
            </SwitchRow>
            {openingDmEnabled && (
              <>
                <div className="group-row">
                  <textarea
                    value={openingDmMessage}
                    onChange={(e) => setOpeningDmMessage(e.target.value)}
                    placeholder={t("Hey there! I'm so happy you're here 😊")}
                    rows={3}
                    aria-label={t("an opening DM")}
                    className="field"
                    maxLength={1000}
                  />
                </div>
                <FieldRow label={t("Button label")}>
                  <input
                    value={openingDmButtonLabel}
                    onChange={(e) => setOpeningDmButtonLabel(e.target.value)}
                    placeholder={t("Send me the link")}
                    className="field"
                    maxLength={64}
                  />
                </FieldRow>
              </>
            )}
          </FormSection>

          <FormSection
            header={t("Require follow")}
            footer={
              requireFollow
                ? t("We send the link only after they tap the button and Instagram confirms the follow. If it can't be verified, we send it anyway.")
                : undefined
            }
          >
            <SwitchRow
              on={requireFollow}
              onToggle={() => setRequireFollow(!requireFollow)}
            >
              {t("a follow requirement first")}
            </SwitchRow>
            {requireFollow && (
              <>
                <div className="group-row">
                  <textarea
                    value={followPromptMessage}
                    onChange={(e) => setFollowPromptMessage(e.target.value)}
                    placeholder={t("quick favor before i send your link. i don't make any money from this, it's free. if you want to support me, just don't unfollow after, and star the repo on github if it helps you. tap the button once you're following and i'll send it over")}
                    rows={3}
                    aria-label={t("a follow requirement first")}
                    className="field"
                    maxLength={1000}
                  />
                </div>
                <FieldRow label={t("Button label")}>
                  <input
                    value={followPromptButtonLabel}
                    onChange={(e) => setFollowPromptButtonLabel(e.target.value)}
                    placeholder={t("i'm following")}
                    className="field"
                    maxLength={20}
                  />
                </FieldRow>
              </>
            )}
          </FormSection>

          <FormSection
            header={t("Message")}
            footer={
              <>
                {"{link}"} {t("inserts the tracked link;")} {"{username}"} {t("personalizes.")}
              </>
            }
          >
            <div className="group-row">
              <textarea
                value={dmMessage}
                onChange={(e) => setDmMessage(e.target.value)}
                placeholder={t("Write a message")}
                rows={4}
                aria-label={t("a DM with a link")}
                className="field"
                maxLength={1000}
              />
            </div>
          </FormSection>

          <FormSection header={t("Buttons and links")}>
            {linkOpen ? (
              <>
                <FieldRow label={t("Link")}>
                  <input
                    value={trackedDestinationUrl}
                    onChange={(e) => setTrackedDestinationUrl(e.target.value)}
                    onBlur={ensureLinkToken}
                    placeholder="https://yourlink.com/offer"
                    inputMode="url"
                    className="field"
                  />
                </FieldRow>
                <FieldRow label={t("Button label")}>
                  <input
                    value={linkButtonLabel}
                    onChange={(e) => setLinkButtonLabel(e.target.value)}
                    placeholder={t("Button label (e.g. Open link)")}
                    maxLength={20}
                    className="field"
                  />
                </FieldRow>
                {secondLinkOpen ? (
                  <>
                    <FieldRow label={t("Second link")}>
                      <input
                        value={secondaryDestinationUrl}
                        onChange={(e) => setSecondaryDestinationUrl(e.target.value)}
                        placeholder="https://yourlink.com/second"
                        inputMode="url"
                        className="field"
                      />
                    </FieldRow>
                    <FieldRow label={t("Button label")}>
                      <input
                        value={secondaryButtonLabel}
                        onChange={(e) => setSecondaryButtonLabel(e.target.value)}
                        placeholder={t("Second button label")}
                        maxLength={20}
                        className="field"
                      />
                    </FieldRow>
                  </>
                ) : (
                  <AddRow onClick={() => setSecondLinkOpen(true)}>
                    {stripPlus(t("+ Add A Second Link"))}
                  </AddRow>
                )}
              </>
            ) : (
              <AddRow onClick={() => setLinkOpen(true)}>
                {stripPlus(t("+ Add A Link"))}
              </AddRow>
            )}
          </FormSection>

          <FormSection
            header={t("Follow-up")}
            footer={
              followUpEnabled ? (
                <>
                  {followUpDelayMinutes > 0
                    ? t("Sent {minutes} min after they tap through.", { minutes: followUpDelayMinutes })
                    : t("Sent right after they tap through.")}
                  {" {username}"} {t("personalizes it. Max 24 hours, to stay inside Instagram's messaging window.")}
                </>
              ) : undefined
            }
          >
            <SwitchRow
              on={followUpEnabled}
              onToggle={() => setFollowUpEnabled(!followUpEnabled)}
            >
              {t("a follow-up thank-you message")}
            </SwitchRow>
            {followUpEnabled && (
              <>
                <div className="group-row">
                  <textarea
                    value={followUpMessage}
                    onChange={(e) => setFollowUpMessage(e.target.value)}
                    placeholder={t("Btw just wanted to say thanks for following me, I appreciate the support 🙌")}
                    rows={3}
                    aria-label={t("a follow-up thank-you message")}
                    className="field"
                    maxLength={1000}
                  />
                </div>
                <div className="group-row text-[15px]">
                  <span className="flex-1">{t("Send it")}</span>
                  <input
                    type="number"
                    min={0}
                    max={1440}
                    value={followUpDelayMinutes}
                    onChange={(e) =>
                      setFollowUpDelayMinutes(
                        Math.max(0, Math.min(1440, Math.floor(Number(e.target.value) || 0)))
                      )
                    }
                    aria-label={t("minutes after the link")}
                    className="field numeral w-20 text-right"
                  />
                  <span className="text-muted">{t("minutes after the link")}</span>
                </div>
              </>
            )}
          </FormSection>
        </div>

        {/* Right: preview */}
        <div className="min-w-0">
          <div className="xl:sticky xl:top-6">
            <h2 className="group-header text-center xl:text-left">{t("Preview")}</h2>
            <div className="flex min-w-0 justify-center pt-1">
              <CampaignPreview
                tab={previewTab}
                onTabChange={setPreviewTab}
                username={username}
                avatarUrl={avatarUrl}
                postThumb={postThumb}
                caption={postCaption}
                sampleComment={keywords[0] ?? ""}
                dmTriggerEnabled={dmTriggerEnabled}
                publicReplyEnabled={publicReplyEnabled}
                publicReplyMessage={publicReplyMessages.find((m) => m.trim()) ?? ""}
                openingDmEnabled={openingDmEnabled}
                openingDmMessage={openingDmMessage}
                openingDmButtonLabel={openingDmButtonLabel}
                revealMessage={dmMessage}
                hasLink={Boolean(trackedDestinationUrl.trim())}
                linkButtonLabel={linkButtonLabel || "Abrir link"}
                linkUrl={trackedDestinationUrl.trim() || undefined}
                hasSecondLink={
                  secondLinkOpen && Boolean(secondaryDestinationUrl.trim())
                }
                secondLinkButtonLabel={secondaryButtonLabel || "Abrir link"}
                requireFollow={requireFollow}
                followPromptMessage={followPromptMessage}
                followPromptButtonLabel={followPromptButtonLabel || "Já estou seguindo"}
                followUpEnabled={followUpEnabled}
                followUpMessage={followUpMessage}
                followUpDelayMinutes={followUpDelayMinutes}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
