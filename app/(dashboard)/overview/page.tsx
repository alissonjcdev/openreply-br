"use client";

/**
 * Instagram Overview Page
 *
 * Aggregate reach/engagement across your recent posts, plus a per-post table.
 * Views / reach / saved / shares come from Instagram media insights (requires
 * the insights permission); likes and comments are always available.
 */

import { formatCompact as formatCompactNumber } from "@/lib/utils/format";
import type { Locale } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";
import { useEffect, useState } from "react";
import AccountSelect from "@/components/account-select";
import StatCard from "@/components/stat-card";
import FollowerChart from "@/components/follower-chart";
import type { OverviewResponse } from "@/app/api/instagram/overview/route";

function formatNumber(n: number | null, locale: Locale): string {
  if (n === null) return "—";
  if (n >= 1_000) return formatCompactNumber(n, locale);
  return n.toLocaleString(locale);
}

function formatDate(iso: string, locale: Locale): string {
  const d = new Date(iso);
  return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

// `short` is what fits a 390px phone in a four-segment control.
const COUNT_OPTIONS = [
  { value: "25", label: "Last 25", short: "25" },
  { value: "50", label: "Last 50", short: "50" },
  { value: "100", label: "Last 100", short: "100" },
  { value: "all", label: "All time", short: null },
] as const;

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`rounded-md bg-surface-2 ${className}`} />;
}

export default function OverviewPage() {
  const { t, locale } = useI18n();
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState("all");
  const [count, setCount] = useState("50");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedAccountId !== "all") {
      params.set("instagramAccountId", selectedAccountId);
    }
    params.set("count", count);

    fetch(`/api/instagram/overview?${params}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setData(res.data);
          setError(null);
        } else {
          setError(res.error ?? "Failed to load overview");
        }
      })
      .catch(() => setError("Failed to load overview"))
      .finally(() => setLoading(false));
  }, [selectedAccountId, count, reloadKey]);

  function handleAccountChange(accountId: string) {
    setLoading(true);
    setSelectedAccountId(accountId);
  }

  function handleRetry() {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }

  function handleCountChange(next: string) {
    setLoading(true);
    setCount(next);
  }

  const rangeControl = (
    <div
      role="radiogroup"
      aria-label={t("Range")}
      className="segmented w-full sm:w-auto"
    >
      {COUNT_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={count === o.value}
          onClick={() => {
            if (count !== o.value) handleCountChange(o.value);
          }}
        >
          {o.short ? (
            <>
              <span className="sm:hidden">{o.short}</span>
              <span className="hidden sm:inline">{t(o.label)}</span>
            </>
          ) : (
            <>
              <span className="sm:hidden">{t("All")}</span>
              <span className="hidden sm:inline">{t(o.label)}</span>
            </>
          )}
        </button>
      ))}
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-8" aria-busy="true">
        <div className="space-y-2">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-8 w-full sm:w-80" />
        <div className="group p-6">
          <div className="grid grid-cols-2 gap-6">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
          <Skeleton className="mt-8 h-12 w-full" />
        </div>
        <div className="group h-72" />
      </div>
    );
  }

  if (error) {
    const needsConnect = error.includes("connect");
    return (
      <div className="space-y-8">
        <h1 className="large-title">{t("Overview")}</h1>
        <div className="group flex flex-col items-center px-6 py-14 text-center">
          <p className="title-3">{t("Failed to load overview")}</p>
          {error !== "Failed to load overview" && (
            <p className="footnote mt-1 max-w-md">{error}</p>
          )}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {needsConnect && (
              <a href="/api/instagram/connect" className="btn btn-primary">
                {t("Connect Instagram")}
              </a>
            )}
            <button type="button" onClick={handleRetry} className="btn btn-secondary">
              {t("Refresh")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { totals, posts, accounts, insightsAvailable, followers, followerHistory } =
    data;

  const secondary = [
    { label: t("Likes"), value: totals.likes },
    { label: t("Comments"), value: totals.comments },
    { label: t("Saved"), value: totals.saved },
    { label: t("Shares"), value: totals.shares },
  ];

  const postTitle = (p: (typeof posts)[number]) =>
    p.caption || t("{type} post", { type: p.mediaType });

  return (
    <div className="space-y-8 sm:space-y-10">
      <div className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="large-title">{t("Overview")}</h1>
            <p className="footnote mt-1">
              {data.provider !== "ZERNIO" && data.requestedCount === "all" ? t("All-time") : t("Recent")} —{" "}
              {t(totals.posts === 1 ? "{count} post" : "{count} posts", { count: totals.posts })} {t("from @")}
              {data.account.username}
              {data.truncated ? t(" (capped at {count})", { count: totals.posts }) : ""}
            </p>
          </div>
          {accounts.length > 1 && (
            <AccountSelect
              accounts={accounts.map((a) => ({
                id: a.id,
                username: a.username,
                instagramId: a.id,
              }))}
              value={selectedAccountId}
              onChange={handleAccountChange}
            />
          )}
        </div>
        {rangeControl}
        {data.limitations?.map((note) => (
          <p key={note} className="footnote">{note}</p>
        ))}
      </div>

      {!insightsAvailable && (
        <div className="group">
          <div className="group-row flex-col items-start gap-1 py-3.5 sm:flex-row sm:items-center sm:gap-6">
            <div className="min-w-0 flex-1">
              <p className="text-[15px]">
                {t("Views, reach, saved and shares need the insights permission.")}
              </p>
              <p className="footnote mt-0.5">
                {t("Reconnect your account to grant it — likes and comments are shown in the meantime.")}
              </p>
            </div>
            <a
              href="/api/instagram/connect"
              className="btn-plain mt-1 shrink-0 text-[15px] sm:mt-0"
            >
              {t("Reconnect Instagram")}
            </a>
          </div>
        </div>
      )}

      {/* Totals for the selected posts: two hero metrics, the rest split by hairlines */}
      <section className="group">
        <div className="grid grid-cols-2">
          <StatCard
            size="lg"
            label={t("Views")}
            value={formatNumber(totals.views, locale)}
            className="px-4 py-5 sm:px-6 sm:py-6"
          />
          <StatCard
            size="lg"
            label={t("Reach")}
            value={formatNumber(totals.reach, locale)}
            className="border-l-[0.5px] border-border-hover px-4 py-5 sm:px-6 sm:py-6"
          />
        </div>
        <dl className="grid border-t-[0.5px] border-border-hover sm:grid-cols-4">
          {secondary.map((m) => (
            <div
              key={m.label}
              className="group-row justify-between sm:flex-col sm:items-start sm:justify-start sm:gap-1 sm:px-6 sm:py-4 sm:before:hidden sm:border-l-[0.5px] sm:border-border-hover sm:first:border-l-0"
            >
              <dt className="truncate text-[15px] sm:text-[13px] sm:text-muted">{m.label}</dt>
              <dd className="numeral text-[17px] font-semibold sm:text-[26px] sm:leading-8">
                {formatNumber(m.value, locale)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Follower trend — account-level, independent of the post range */}
      <FollowerChart data={followerHistory} followers={followers} />

      {/* Per-post breakdown */}
      <section>
        <h2 className="group-header">{t("Posts")}</h2>
        <div className="group">
          {posts.length === 0 ? (
            <p className="footnote px-4 py-12 text-center">{t("No posts found")}</p>
          ) : (
            <>
              {/* Phones: one row per post, metrics as a secondary line */}
              <div className="md:hidden">
                {posts.map((p) => {
                  const inner = (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-[15px] leading-5">{postTitle(p)}</p>
                        <p className="caption mt-1 truncate">
                          <span className="numeral">{formatNumber(p.views, locale)}</span> {t("Views")}
                          {" · "}
                          <span className="numeral">{formatNumber(p.likes, locale)}</span> {t("Likes")}
                        </p>
                      </div>
                      <span className="caption shrink-0 self-start pt-0.5">
                        {formatDate(p.timestamp, locale)}
                      </span>
                    </>
                  );
                  // Rows stay direct siblings so .group-row draws the hairlines.
                  return p.permalink ? (
                        <a
                          key={p.id}
                          href={p.permalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group-row items-start py-3"
                        >
                          {inner}
                        </a>
                      ) : (
                        <div key={p.id} className="group-row items-start py-3">{inner}</div>
                      );
                })}
              </div>

              {/* Wider screens: Numbers-style table with hairline rows */}
              <table className="hidden w-full table-fixed text-[14px] md:table">
                <colgroup>
                  <col />
                  <col className="w-[11%]" />
                  <col className="w-[11%]" />
                  <col className="w-[9%]" />
                  <col className="w-[11%]" />
                  <col className="w-[9%]" />
                  <col className="w-[10%]" />
                  <col className="w-[10%]" />
                </colgroup>
                <thead>
                  <tr className="text-left text-[12px] text-muted">
                    <th className="py-2.5 pl-5 pr-3 font-medium">{t("Post")}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{t("Views")}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{t("Reach")}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{t("Likes")}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{t("Comments")}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{t("Saved")}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{t("Shares")}</th>
                    <th className="py-2.5 pl-3 pr-5 text-right font-medium">{t("Date")}</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map((p) => (
                    <tr
                      key={p.id}
                      className="border-t-[0.5px] border-border-hover transition-colors hover:bg-surface-hover"
                    >
                      <td className="py-2.5 pl-5 pr-3">
                        {p.permalink ? (
                          <a
                            href={p.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block truncate hover:text-accent-text"
                          >
                            {postTitle(p)}
                          </a>
                        ) : (
                          <span className="block truncate">{postTitle(p)}</span>
                        )}
                      </td>
                      {[p.views, p.reach, p.likes, p.comments, p.saved, p.shares].map((v, i) => (
                        <td key={i} className="numeral px-3 py-2.5 text-right">
                          {formatNumber(v, locale)}
                        </td>
                      ))}
                      <td className="py-2.5 pl-3 pr-5 text-right text-muted">
                        {formatDate(p.timestamp, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
