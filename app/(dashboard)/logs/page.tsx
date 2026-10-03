"use client";

/**
 * DM Logs Page
 *
 * Filterable, paginated list of DM logs, laid out like a Mail message list:
 * commenter and relative time on the first line, the comment below, then the
 * campaign / matched keyword, with the status as colored text.
 */

import type { Locale } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";
import { useEffect, useState, useCallback } from "react";
import AccountSelect, { type AccountOption } from "@/components/account-select";
import StatusBadge from "@/components/status-badge";

interface DmLog {
  id: string;
  commenterId: string;
  commenterName: string | null;
  commentText: string;
  matchedKeyword?: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  automation: { name: string; keywords: string[] };
  instagramAccount: { username: string };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const STATUS_FILTERS = [
  "ALL",
  "SENT",
  "FAILED",
  "PENDING",
  "SKIPPED_RATE_LIMIT",
  "SKIPPED_PLAN_LIMIT",
  "SKIPPED_DEDUP",
];

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

export default function LogsPage() {
  const { t, label, locale } = useI18n();
  const [logs, setLogs] = useState<DmLog[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("all");
  const [page, setPage] = useState(1);

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (selectedAccountId !== "all") {
        params.set("instagramAccountId", selectedAccountId);
      }

      const res = await fetch(`/api/logs?${params}`);
      const data = await res.json();
      if (data.success) {
        setLogs(data.data.logs);
        setPagination(data.data.pagination);
      }
    } catch (err) {
      console.error("Failed to fetch logs:", err);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, selectedAccountId]);

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
      void fetchLogs();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchLogs]);

  function handleFilterChange(status: string) {
    setLoading(true);
    setStatusFilter(status);
    setPage(1);
  }

  function handleAccountChange(accountId: string) {
    setLoading(true);
    setSelectedAccountId(accountId);
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="large-title">{t("DM Logs")}</h1>
          {pagination && pagination.total > 0 && (
            <p className="footnote mt-1">
              {t("Showing {start}–{end} of {total}", {
                start: (pagination.page - 1) * pagination.limit + 1,
                end: Math.min(pagination.page * pagination.limit, pagination.total),
                total: pagination.total,
              })}
            </p>
          )}
        </div>
        {accounts.length > 1 && (
          <AccountSelect
            accounts={accounts}
            value={selectedAccountId}
            onChange={handleAccountChange}
          />
        )}
      </div>

      {/* Status filter. Seven segments outgrow a phone, so the control scrolls
          sideways inside its own strip instead of wrapping. */}
      <div className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        <div role="radiogroup" aria-label={t("Status")} className="segmented min-w-max">
          {STATUS_FILTERS.map((status) => (
            <button
              key={status}
              type="button"
              role="radio"
              aria-checked={statusFilter === status}
              onClick={() => handleFilterChange(status)}
            >
              {label(status)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="group">
          {loading &&
            [...Array(6)].map((_, i) => (
              <div key={i} className="group-row items-start py-3" aria-hidden>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3.5 w-32 rounded bg-surface-2" />
                  <div className="h-3 w-3/4 rounded bg-surface-2" />
                </div>
                <div className="h-3 w-12 rounded bg-surface-2" />
              </div>
            ))}

          {!loading && logs.length === 0 && (
            <p className="footnote px-4 py-16 text-center">{t("No logs found")}</p>
          )}

          {!loading &&
            logs.map((log) => (
              <div key={log.id} className="group-row items-start gap-4 py-3 sm:pr-5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className="min-w-0 truncate text-[15px] font-semibold tracking-[-0.01em]">
                      @{log.commenterName ?? log.commenterId.slice(0, 8)}
                    </p>
                    {accounts.length > 1 && (
                      <p className="hidden shrink-0 text-[13px] text-tertiary sm:block">
                        @{log.instagramAccount.username}
                      </p>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[15px] leading-5 text-foreground/85">
                    {log.commentText}
                  </p>
                  <p className="caption mt-1 truncate lg:hidden">
                    {log.automation.name}
                    {log.matchedKeyword && (
                      <>
                        {" · "}
                        <span className="text-foreground/70">{log.matchedKeyword}</span>
                      </>
                    )}
                  </p>
                  {log.errorMessage && log.status === "FAILED" && (
                    <p className="mt-1 text-[12px] leading-4 text-error">{log.errorMessage}</p>
                  )}
                </div>
                {/* Wide screens: campaign and matched keyword get their own column */}
                <div className="hidden w-60 shrink-0 pt-0.5 lg:block">
                  <p className="truncate text-[13px] leading-[18px]">{log.automation.name}</p>
                  {log.matchedKeyword && (
                    <p className="caption mt-0.5 truncate">{log.matchedKeyword}</p>
                  )}
                </div>
                <div className="flex w-24 shrink-0 flex-col items-end gap-1 pt-0.5">
                  <time
                    dateTime={log.createdAt}
                    title={new Date(log.createdAt).toLocaleString(locale, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    className="caption whitespace-nowrap"
                  >
                    {relativeTime(log.createdAt, locale)}
                  </time>
                  <StatusBadge status={log.status} />
                </div>
              </div>
            ))}
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between gap-3 px-4 pt-3">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => {
                setLoading(true);
                setPage(page - 1);
              }}
              className="btn-plain text-[15px] disabled:pointer-events-none disabled:text-tertiary"
            >
              {t("Previous")}
            </button>
            <span className="numeral text-[13px] text-muted">
              {page} / {pagination.totalPages}
            </span>
            <button
              type="button"
              disabled={page >= pagination.totalPages}
              onClick={() => {
                setLoading(true);
                setPage(page + 1);
              }}
              className="btn-plain text-[15px] disabled:pointer-events-none disabled:text-tertiary"
            >
              {t("Next")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
