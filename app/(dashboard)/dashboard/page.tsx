"use client";

/**
 * Dashboard Home Page
 *
 * Large-title greeting, one grouped metrics container (hero numeral plus
 * hairline-separated secondary metrics), a Screen Time style 7-day bar chart,
 * and top keywords / recent activity as grouped lists.
 */

import { formatPercent } from "@/lib/utils/format";
import { useI18n } from "@/lib/i18n/provider";
import { useEffect, useState } from "react";
import AccountSelect, { type AccountOption } from "@/components/account-select";
import type { Locale } from "@/lib/i18n";
import StatusBadge from "@/components/status-badge";

interface DashboardStats {
  userName: string | null;
  contactsCount: number;
  totalAutomations: number;
  activeAutomations: number;
  dmsSentToday: number;
  dmsSentWeek: number;
  dmsSentMonth: number;
  dmsSkippedMonth: number;
  dmsFailedMonth: number;
  totalDMs: number;
  clicksThisMonth: number;
  totalClicks: number;
  ctrThisMonth: number;
  instagramAccounts: AccountOption[];
  selectedInstagramAccountId: string | null;
  topKeywords: { keyword: string; count: number }[];
  dailyDMs: { date: string; count: number }[];
  recentLogs: Array<{
    id: string;
    commenterName: string | null;
    commentText: string;
    status: string;
    createdAt: string;
    automation: { name: string };
    instagramAccount?: { username: string };
  }>;
}


/** Round the chart ceiling up to a readable scale (1, 2, 2.5, 5 x 10^n). */
function niceScale(max: number): { top: number; ticks: number[] } {
  if (max <= 0) return { top: 4, ticks: [0, 2, 4] };
  const magnitude = 10 ** Math.floor(Math.log10(max));
  for (const factor of [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10]) {
    const step = Math.max(1, factor * magnitude);
    const count = Math.ceil(max / step);
    if (count <= 4) {
      const ticks = Array.from({ length: count + 1 }, (_, i) => i * step);
      return { top: count * step, ticks };
    }
  }
  return { top: max, ticks: [0, max] };
}

function relativeTime(iso: string, locale: Locale): string {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(seconds, "second");
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 604800) return rtf.format(Math.round(seconds / 86400), "day");
  return new Date(iso).toLocaleDateString(locale, { month: "short", day: "numeric" });
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`rounded-md bg-surface-2 ${className}`} />;
}

export default function DashboardPage() {
  const { t, label, locale } = useI18n();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState("all");

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedAccountId !== "all") {
      params.set("instagramAccountId", selectedAccountId);
    }

    fetch(`/api/dashboard/stats${params.size ? `?${params}` : ""}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setStats(data.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedAccountId]);

  function handleAccountChange(accountId: string) {
    setLoading(true);
    setSelectedAccountId(accountId);
  }

  if (loading) {
    return (
      <div className="space-y-8" aria-busy="true">
        <div className="space-y-2">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="group p-6">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="mt-3 h-11 w-28" />
          <Skeleton className="mt-8 h-14 w-full" />
        </div>
        <div className="grid gap-8 lg:grid-cols-3 lg:gap-6">
          <div className="group h-72 lg:col-span-2" />
          <div className="group h-72" />
        </div>
      </div>
    );
  }

  const daily = stats?.dailyDMs ?? [];
  const maxDM = Math.max(...daily.map((d) => d.count), 0);
  const scale = niceScale(maxDM);
  const dailyAverage = daily.length
    ? Math.round(daily.reduce((sum, d) => sum + d.count, 0) / daily.length)
    : 0;
  // Bars show each keyword's share of all matches, so equal counts read as
  // equal slices instead of a column of full bars.
  const keywordTotal = Math.max(
    (stats?.topKeywords ?? []).reduce((sum, k) => sum + k.count, 0),
    1,
  );

  const connectedCount = stats?.instagramAccounts.length ?? 0;
  const failed = stats?.dmsFailedMonth ?? 0;

  const secondaryMetrics: Array<{ label: string; value: string | number; tone?: string }> = [
    { label: t("Active Campaigns"), value: stats?.activeAutomations ?? 0 },
    { label: t("Clicks"), value: (stats?.clicksThisMonth ?? 0).toLocaleString(locale) },
    { label: t("CTR"), value: formatPercent(stats?.ctrThisMonth ?? 0, locale) },
    { label: t("Skipped"), value: (stats?.dmsSkippedMonth ?? 0).toLocaleString(locale) },
    {
      label: t("Failed"),
      value: failed.toLocaleString(locale),
      tone: failed > 0 ? "text-error" : undefined,
    },
  ];

  return (
    <div className="space-y-8 sm:space-y-10">
      {/* Greeting */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="large-title">
            {t("Hello, {name}!", { name: stats?.userName ?? t("there") })}
          </h1>
          <p className="footnote mt-1">
            {t(connectedCount === 1 ? "{count} connected account" : "{count} connected accounts", { count: connectedCount })}
            {" · "}
            {t(stats?.contactsCount === 1 ? "{count} contact" : "{count} contacts", { count: stats?.contactsCount ?? 0 })}
            {" · "}
            <a href="/logs" className="text-accent-text hover:opacity-75">
              {t("See activity")}
            </a>
          </p>
        </div>
        {stats && stats.instagramAccounts.length > 1 && (
          <AccountSelect
            accounts={stats.instagramAccounts}
            value={selectedAccountId}
            onChange={handleAccountChange}
          />
        )}
      </div>

      {/* Metrics: one group, hero numeral on top, the rest split by hairlines */}
      <section className="group">
        <div className="flex flex-col gap-5 px-4 pt-5 pb-5 sm:flex-row sm:items-end sm:justify-between sm:px-6 sm:pt-6">
          <div className="min-w-0">
            <p className="text-[13px] leading-[18px] text-muted">{t("DMs sent this month")}</p>
            <p className="numeral mt-1 text-[44px] font-semibold leading-none tracking-[-0.03em] sm:text-[52px]">
              {(stats?.dmsSentMonth ?? 0).toLocaleString(locale)}
            </p>
          </div>
          <dl className="flex gap-6 sm:gap-8">
            {[
              { label: t("Today"), value: stats?.dmsSentToday ?? 0 },
              { label: t("This week"), value: stats?.dmsSentWeek ?? 0 },
              { label: t("All time"), value: stats?.totalDMs ?? 0 },
            ].map((m) => (
              <div key={m.label} className="min-w-0">
                <dt className="caption">{m.label}</dt>
                <dd className="numeral mt-0.5 text-[20px] font-semibold leading-6">
                  {m.value.toLocaleString(locale)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <dl className="grid border-t-[0.5px] border-border-hover sm:grid-cols-5">
          {secondaryMetrics.map((m) => (
            <div
              key={m.label}
              className="group-row justify-between sm:flex-col sm:items-start sm:justify-start sm:gap-1 sm:px-6 sm:py-4 sm:before:hidden sm:border-l-[0.5px] sm:border-border-hover sm:first:border-l-0"
            >
              <dt className="truncate text-[15px] sm:text-[13px] sm:text-muted">{m.label}</dt>
              <dd className={`numeral text-[17px] font-semibold sm:text-[26px] sm:leading-8 ${m.tone ?? ""}`}>
                {m.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="grid gap-8 lg:grid-cols-3 lg:gap-6">
        {/* 7-day chart, Screen Time style */}
        <section className="min-w-0 lg:col-span-2">
          <h2 className="group-header">{t("DMs — Last 7 Days")}</h2>
          <div className="group px-4 pt-4 pb-3 sm:px-5">
            <p className="caption">{t("Daily average")}</p>
            <p className="numeral text-[28px] font-semibold leading-9">
              {dailyAverage.toLocaleString(locale)}
            </p>

            <div className="mt-4 flex gap-2">
              <div className="relative h-44 flex-1">
                {/* Gridlines: dotted at each tick, solid baseline */}
                {scale.ticks.map((tick) => (
                  <div
                    key={tick}
                    aria-hidden
                    className={`absolute inset-x-0 ${
                      tick === 0
                        ? "border-t-[0.5px] border-solid border-border-hover"
                        : "border-t-[0.5px] border-dashed border-border-hover"
                    }`}
                    style={{ bottom: `${(tick / scale.top) * 100}%` }}
                  />
                ))}
                <div className="relative flex h-full items-end gap-1.5 sm:gap-3">
                  {daily.map((day, i) => {
                    const pct = (day.count / scale.top) * 100;
                    return (
                      <div
                        key={`${day.date}-${i}`}
                        className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
                        title={`${label(day.date)}: ${day.count}`}
                      >
                        <span className="numeral mb-1 text-[11px] leading-none text-muted">
                          {day.count}
                        </span>
                        <div
                          className={`w-full max-w-9 rounded-t-[6px] ${
                            day.count > 0 ? "bg-accent" : "bg-tertiary/40"
                          }`}
                          style={{ height: day.count > 0 ? `${Math.max(pct, 2)}%` : "2px" }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Value axis on the trailing edge, like Health */}
              <div className="relative h-44 w-7 shrink-0" aria-hidden>
                {scale.ticks.map((tick) => (
                  <span
                    key={tick}
                    className="numeral absolute right-0 translate-y-1/2 text-[11px] leading-none text-tertiary"
                    style={{ bottom: `${(tick / scale.top) * 100}%` }}
                  >
                    {tick}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              <div className="flex flex-1 gap-1.5 sm:gap-3">
                {daily.map((day, i) => (
                  // Seven labels share a phone's width, so they must not wrap.
                  <span
                    key={`${day.date}-${i}`}
                    className="min-w-0 flex-1 truncate text-center text-[11px] text-muted"
                  >
                    {label(day.date)}
                  </span>
                ))}
              </div>
              <div className="w-7 shrink-0" />
            </div>
          </div>
        </section>

        {/* Top keywords */}
        <section className="min-w-0">
          <h2 className="group-header">{t("Top Keywords")}</h2>
          <div className="group">
            {stats?.topKeywords.length === 0 && (
              <p className="footnote px-4 py-10 text-center">{t("No keyword matches yet")}</p>
            )}
            {stats?.topKeywords.map((keyword) => (
              <div key={keyword.keyword} className="group-row flex-col items-stretch gap-1.5 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[15px]">{keyword.keyword}</span>
                  <span className="numeral text-[15px] text-muted">
                    {keyword.count.toLocaleString(locale)}
                  </span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${(keyword.count / keywordTotal) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Recent activity */}
      <section>
        <div className="flex items-end justify-between gap-3 pr-4">
          <h2 className="group-header">{t("Recent Activity")}</h2>
          <a href="/logs" className="pb-1.5 text-[13px] text-accent-text hover:opacity-75">
            {t("See activity")}
          </a>
        </div>
        <div className="group">
          {stats?.recentLogs.length === 0 && (
            <p className="footnote px-4 py-10 text-center">{t("No activity yet")}</p>
          )}
          {stats?.recentLogs.map((log) => (
            <div key={log.id} className="group-row items-start py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium">
                  @{log.commenterName ?? "unknown"}
                </p>
                <p className="truncate text-[13px] leading-[18px] text-muted">
                  {log.instagramAccount ? `@${log.instagramAccount.username} · ` : ""}
                  {log.commentText}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <time
                  dateTime={log.createdAt}
                  title={new Date(log.createdAt).toLocaleString(locale)}
                  className="caption"
                >
                  {relativeTime(log.createdAt, locale)}
                </time>
                <StatusBadge status={log.status} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
