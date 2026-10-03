"use client";

/**
 * Campaign Detail
 *
 * Clicking a campaign opens this read-only view: large title with the status,
 * the metrics in one grouped container, the automation as Settings-style
 * grouped sections, and the Instagram preview framed on the right. Edit,
 * Duplicate and Delete are capsule buttons; active/paused is a switch.
 */

import { formatPercent } from "@/lib/utils/format";
import { useI18n } from "@/lib/i18n/provider";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import CampaignPreview, { type PreviewTab } from "@/components/campaign-preview";

interface Campaign {
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
  instagramAccount: { username: string };
  trackedLinks?: {
    destinationUrl: string;
    label?: string | null;
    trackedUrl?: string;
  }[];
  analytics: {
    sent: number;
    skipped: number;
    failed: number;
    clicks: number;
    ctr: number;
  };
}

export default function CampaignDetailPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [postThumb, setPostThumb] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState<PreviewTab>("dm");
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    fetch("/api/automations", { cache: "no-store" })
      .then((r) => r.json())
      .then((payload) => {
        if (!payload.success) return setNotFound(true);
        const found = (payload.data as Campaign[]).find((c) => c.id === id);
        if (!found) return setNotFound(true);
        setCampaign(found);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!campaign) return;
    const acct = campaign.instagramAccountId;
    fetch(`/api/instagram/profile?instagramAccountId=${acct}`)
      .then((r) => r.json())
      .then((d) =>
        setAvatarUrl(d.success ? d.data.profilePictureUrl ?? null : null)
      )
      .catch(() => setAvatarUrl(null));

    if (campaign.postId) {
      fetch(`/api/instagram/posts?instagramAccountId=${acct}&limit=50`)
        .then((r) => r.json())
        .then((payload) => {
          if (!payload.success) return;
          const hit = (
            payload.data as {
              id: string;
              thumbnail_url?: string;
              media_url?: string;
            }[]
          ).find((p) => p.id === campaign.postId);
          setPostThumb(hit?.thumbnail_url ?? hit?.media_url ?? null);
        })
        .catch(() => setPostThumb(null));
    }
  }, [campaign]);

  async function toggleActive() {
    if (!campaign) return;
    setBusy(true);
    try {
      await fetch(`/api/automations?id=${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !campaign.isActive }),
      });
      setCampaign({ ...campaign, isActive: !campaign.isActive });
    } finally {
      setBusy(false);
    }
  }

  // Copy is made server-side from the stored campaign, like the list's menu.
  async function duplicate() {
    if (!campaign) return;
    setActing(true);
    try {
      const res = await fetch(`/api/automations/duplicate?id=${campaign.id}`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) router.push("/campaigns");
      else console.error("Duplicate failed:", data.error);
    } catch (err) {
      console.error("Failed to duplicate:", err);
    } finally {
      setActing(false);
    }
  }

  async function remove() {
    if (!campaign) return;
    if (!confirm(t("Delete this campaign? This cannot be undone."))) return;
    setActing(true);
    try {
      await fetch(`/api/automations?id=${campaign.id}`, { method: "DELETE" });
      router.push("/campaigns");
    } catch (err) {
      console.error("Failed to delete:", err);
      setActing(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="h-4 w-24 rounded bg-surface-2" />
        <div className="h-[41px] w-72 max-w-full rounded-md bg-surface-2" />
        <div className="group h-[92px]" />
        <div className="group h-64 lg:mr-[380px]" />
      </div>
    );
  }
  if (notFound || !campaign) {
    return (
      <div className="mx-auto max-w-lg pt-10">
        <div className="group px-6 py-12 text-center">
          <p className="title-3">{t("Campaign not found.")}</p>
          <button
            onClick={() => router.push("/campaigns")}
            className="btn btn-secondary mt-5"
          >
            {t("Back to campaigns")}
          </button>
        </div>
      </div>
    );
  }

  const publicReplies =
    campaign.publicReplyMessages && campaign.publicReplyMessages.length > 0
      ? campaign.publicReplyMessages
      : campaign.publicReplyMessage
        ? [campaign.publicReplyMessage]
        : [];
  const hasLink = Boolean(campaign.trackedLinks?.[0]?.destinationUrl);
  const hasSecondLink = Boolean(campaign.trackedLinks?.[1]?.destinationUrl);

  const trigger = campaign.matchAnyPost
    ? t("Any post or reel")
    : campaign.pendingNextReel
      ? t("Your next reel")
      : t("A specific post or reel");
  const matchText = campaign.matchAnyWord
    ? t("Any comment")
    : campaign.keywords.join(", ") || t("No keywords");

  const metrics = [
    { label: t("Sends"), value: campaign.analytics.sent },
    { label: t("Clicks"), value: campaign.analytics.clicks },
    { label: t("CTR"), value: formatPercent(campaign.analytics.ctr, locale) },
    { label: t("Failed"), value: campaign.analytics.failed },
  ];
  // Hairlines between the metric cells: one row of four from sm up, a 2x2
  // grid on phones.
  const metricBorders = [
    "",
    "border-l-[0.5px]",
    "border-t-[0.5px] sm:border-t-0 sm:border-l-[0.5px]",
    "border-l-[0.5px] border-t-[0.5px] sm:border-t-0",
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Back + title + actions */}
      <div className="space-y-3">
        <Link
          href="/campaigns"
          className="-ml-1 inline-flex items-center gap-0.5 text-[15px] text-accent-text hover:opacity-75"
        >
          <ChevronLeft aria-hidden strokeWidth={2.2} className="size-[18px]" />
          {t("Campaigns")}
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <h1 className="large-title break-words">{campaign.name}</h1>
            <p className="mt-1 text-[15px] text-muted">
              <span className={campaign.isActive ? "text-success" : "text-muted"}>
                {campaign.isActive ? t("Active") : t("Paused")}
              </span>
              {" · "}@{campaign.instagramAccount.username}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/campaigns/${campaign.id}/edit`}
              className="btn btn-primary"
            >
              {t("Edit")}
            </Link>
            <button
              type="button"
              onClick={() => void duplicate()}
              disabled={acting}
              className="btn btn-secondary"
            >
              {t("Duplicate")}
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={acting}
              className="btn btn-destructive"
            >
              {t("Delete")}
            </button>
          </div>
        </div>
      </div>

      {/* Metrics: one grouped container, cells split by hairlines */}
      <dl className="group grid grid-cols-2 sm:grid-cols-4">
        {metrics.map((m, i) => (
          <div
            key={m.label}
            className={`border-border-hover px-5 py-4 ${metricBorders[i]}`}
          >
            <dt className="footnote">{m.label}</dt>
            <dd className="numeral mt-1 text-[28px] font-semibold leading-8 text-foreground">
              {m.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_348px]">
        {/* Settings-style summary */}
        <div className="min-w-0 space-y-7">
          <section className="group">
            <div className="group-row">
              <span className="flex-1 text-[15px]">{t("Active campaign")}</span>
              <button
                type="button"
                role="switch"
                aria-checked={campaign.isActive}
                aria-label={t("Active campaign")}
                onClick={toggleActive}
                disabled={busy}
                className="switch disabled:opacity-60"
              />
            </div>
          </section>

          <Section
            title={t("Trigger")}
            footer={
              campaign.dmTriggerEnabled
                ? `${t("Also replies when someone DMs")} ${
                    campaign.matchAnyWord ? t("anything") : t("these words")
                  }.`
                : undefined
            }
          >
            <InfoRow label={t("Post")}>
              <span className="flex items-center justify-between gap-3">
                <span>{trigger}</span>
                {postThumb && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={postThumb}
                    alt={t("Post")}
                    className="size-10 shrink-0 rounded-[8px] object-cover"
                  />
                )}
              </span>
            </InfoRow>
            <InfoRow label={t("Keywords")}>{matchText}</InfoRow>
          </Section>

          {publicReplies.length > 0 && (
            <Section title={t("Public reply")}>
              {publicReplies.map((m, i) => (
                <InfoRow key={i}>{m}</InfoRow>
              ))}
            </Section>
          )}

          {campaign.openingDmEnabled && (
            <Section title={t("Opening DM")}>
              <InfoRow label={t("Message")}>
                {campaign.openingDmMessage || t("Opening message")}
              </InfoRow>
              <InfoRow label={t("Button")}>
                {campaign.openingDmButtonLabel || t("Button")}
              </InfoRow>
            </Section>
          )}

          {campaign.requireFollow && (
            <Section title={t("They must follow first")}>
              <InfoRow label={t("Message")}>
                {campaign.followPromptMessage ||
                  "quick favor before i send your link. i don't make any money from this, it's free. if you want to support me, just don't unfollow after, and star the repo on github if it helps you. tap the button once you're following and i'll send it over"}
              </InfoRow>
              <InfoRow label={t("Button")}>
                {campaign.followPromptButtonLabel || "Já estou seguindo"}
              </InfoRow>
            </Section>
          )}

          <Section title={t("Message")}>
            <InfoRow label={t("DM")}>{campaign.dmMessage}</InfoRow>
            {hasLink && (
              <InfoRow label={t("Button")}>
                {campaign.linkButtonLabel || "Abrir link"}
              </InfoRow>
            )}
            {hasSecondLink && (
              <InfoRow label={t("Button")}>
                {campaign.trackedLinks?.[1]?.label || "Abrir link"}
              </InfoRow>
            )}
          </Section>

          {hasLink && (
            <Section title={t("Links")} footer={t("The exact link sent")}>
              {campaign.trackedLinks
                ?.filter((link) => link.destinationUrl)
                .map((link, i) => (
                  <div key={i} className="group-row block py-3">
                    <p className="select-all break-all font-mono text-[13px] leading-5 text-foreground">
                      {link.trackedUrl ?? link.destinationUrl}
                    </p>
                    <p className="footnote mt-1 break-all">
                      {link.label ? `${link.label} · ` : ""}{t("redirects to")}{" "}
                      {link.destinationUrl}
                    </p>
                  </div>
                ))}
            </Section>
          )}

          {campaign.followUpEnabled && campaign.followUpMessage && (
            <Section
              title={t("Then a follow-up message")}
              footer={
                campaign.followUpDelayMinutes && campaign.followUpDelayMinutes > 0
                  ? t("Sent {minutes} min after the link.", { minutes: campaign.followUpDelayMinutes })
                  : t("Sent right after the link.")
              }
            >
              <InfoRow label={t("Message")}>{campaign.followUpMessage}</InfoRow>
            </Section>
          )}
        </div>

        {/* Instagram preview, framed */}
        <section className="lg:sticky lg:top-20">
          <h2 className="group-header">{t("Preview")}</h2>
          <div className="flex justify-center rounded-2xl bg-surface px-4 py-6">
            <CampaignPreview
              tab={previewTab}
              onTabChange={setPreviewTab}
              username={campaign.instagramAccount.username}
              avatarUrl={avatarUrl}
              postThumb={postThumb}
              caption=""
              sampleComment={campaign.matchAnyWord ? t("nice!") : campaign.keywords[0] ?? "LINK"}
              dmTriggerEnabled={campaign.dmTriggerEnabled}
              publicReplyEnabled={campaign.publicReplyEnabled}
              publicReplyMessage={publicReplies[0] ?? ""}
              openingDmEnabled={campaign.openingDmEnabled}
              openingDmMessage={campaign.openingDmMessage ?? ""}
              openingDmButtonLabel={campaign.openingDmButtonLabel ?? ""}
              revealMessage={campaign.dmMessage}
              hasLink={hasLink}
              linkButtonLabel={campaign.linkButtonLabel ?? "Abrir link"}
              linkUrl={
                campaign.trackedLinks?.[0]?.trackedUrl ??
                campaign.trackedLinks?.[0]?.destinationUrl
              }
              hasSecondLink={hasSecondLink}
              secondLinkButtonLabel={
                campaign.trackedLinks?.[1]?.label ?? "Abrir link"
              }
              requireFollow={campaign.requireFollow}
              followPromptMessage={campaign.followPromptMessage ?? ""}
              followPromptButtonLabel={
                campaign.followPromptButtonLabel ?? "Já estou seguindo"
              }
              followUpEnabled={campaign.followUpEnabled ?? false}
              followUpMessage={campaign.followUpMessage ?? ""}
              followUpDelayMinutes={campaign.followUpDelayMinutes ?? 0}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function Section({
  title,
  footer,
  children,
}: {
  title: string;
  footer?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="group-header">{title}</h2>
      <div className="group">{children}</div>
      {footer && <p className="group-footer">{footer}</p>}
    </section>
  );
}

/** Label / value row: side by side from sm up, stacked on phones. */
function InfoRow({ label, children }: { label?: string; children: React.ReactNode }) {
  if (!label) {
    return (
      <div className="group-row py-[11px]">
        <span className="whitespace-pre-wrap break-words text-[15px] leading-[22px] text-foreground">
          {children}
        </span>
      </div>
    );
  }
  return (
    <div className="group-row grid gap-x-4 gap-y-0.5 py-[11px] sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
      <span className="text-[15px] leading-[22px] text-foreground">{label}</span>
      <span className="whitespace-pre-wrap break-words text-[15px] leading-[22px] text-muted">
        {children}
      </span>
    </div>
  );
}
