"use client";

import { useI18n } from "@/lib/i18n/provider";
import { useEffect, useState } from "react";
import StatusBadge from "@/components/status-badge";

interface DiagnosticsData {
  queueCounts: Record<string, number>;
  workerHealth: {
    healthy: boolean;
    ageMs: number | null;
    heartbeat: {
      checkedAt: string;
      hostname?: string;
      pid: number;
      startedAt?: string;
    } | null;
  };
  workerAlerts: Array<{
    level: string;
    message: string;
    jobId?: string;
    commentId?: string;
    createdAt: string;
  }>;
  webhookFailures: Array<{
    id: string;
    object: string | null;
    errorMessage: string | null;
    createdAt: string;
  }>;
  dmFailures: Array<{
    id: string;
    status: string;
    commentId: string;
    commentText: string;
    errorMessage: string | null;
    updatedAt: string;
    automation: { name: string };
  }>;
  tokenRefreshFailures: Array<{
    id: string;
    message: string;
    createdAt: string;
  }>;
  operationalEvents: Array<{
    id: string;
    source: string;
    level: string;
    message: string;
    createdAt: string;
    resolvedAt: string | null;
  }>;
}

function formatDate(value: string, locale: string) {
  return new Date(value).toLocaleString(locale);
}

function EmptyState({ label }: { label: string }) {
  return <p className="footnote px-4 py-6 text-center">{label}</p>;
}

/** Grouped inset list with a sentence-case header, like System Settings. */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0">
      <h2 className="group-header">{title}</h2>
      <div className="group">{children}</div>
    </section>
  );
}

/** One System Information row: label leading, value trailing. */
function InfoRow({
  label,
  value,
  detail,
  valueClassName = "text-muted",
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="group-row justify-between gap-4">
      <div className="min-w-0">
        <p className="truncate text-[15px]">{label}</p>
        {detail && <p className="caption mt-0.5 truncate">{detail}</p>}
      </div>
      <span className={`shrink-0 text-right text-[15px] ${valueClassName}`}>{value}</span>
    </div>
  );
}

function levelClass(level: string) {
  const l = level.toLowerCase();
  if (l.startsWith("err") || l === "fatal" || l === "critical") return "text-error";
  if (l.startsWith("warn")) return "text-warning";
  return "text-muted";
}

export default function DiagnosticsPage() {
  const { t, label, locale } = useI18n();
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshDiagnostics() {
    setLoading(true);
    const response = await fetch("/api/admin/diagnostics");
    const payload = await response.json();
    if (payload.success) {
      setData(payload.data);
    }
    setLoading(false);
  }

  useEffect(() => {
    let active = true;

    async function loadInitialDiagnostics() {
      const response = await fetch("/api/admin/diagnostics");
      const payload = await response.json();
      if (active && payload.success) {
        setData(payload.data);
      }
      if (active) {
        setLoading(false);
      }
    }

    void loadInitialDiagnostics();

    return () => {
      active = false;
    };
  }, []);

  if (loading && !data) {
    return (
      <div className="mx-auto max-w-3xl space-y-8" aria-busy="true">
        <div className="space-y-2">
          <div className="h-9 w-72 rounded-md bg-surface-2" />
          <div className="h-4 w-96 max-w-full rounded-md bg-surface-2" />
        </div>
        <div className="group h-28" />
        <div className="group h-44" />
      </div>
    );
  }

  const workerAgeSeconds =
    data?.workerHealth.ageMs == null
      ? null
      : Math.round(data.workerHealth.ageMs / 1000);
  const heartbeat = data?.workerHealth.heartbeat;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="large-title">{t("Production Diagnostics")}</h1>
          <p className="footnote mt-1">
            {t("Health, queues, webhook failures, billing events, and worker alerts.")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshDiagnostics()}
          disabled={loading}
          className="btn btn-secondary btn-sm shrink-0 self-start sm:self-auto"
        >
          {t("Refresh")}
        </button>
      </div>

      <div className="grid gap-8 md:grid-cols-2 md:gap-6">
        <Section title={t("Worker health")}>
          <InfoRow
            label={t("Status")}
            value={data?.workerHealth.healthy ? t("Healthy") : t("Needs attention")}
            valueClassName={`font-medium ${
              data?.workerHealth.healthy ? "text-success" : "text-warning"
            }`}
          />
          <InfoRow
            label={
              workerAgeSeconds == null
                ? t("No heartbeat found")
                : t("Last heartbeat {seconds}s ago", { seconds: workerAgeSeconds })
            }
            value={
              heartbeat ? (
                <span className="numeral">
                  {new Date(heartbeat.checkedAt).toLocaleTimeString(locale)}
                </span>
              ) : (
                "—"
              )
            }
            detail={
              heartbeat
                ? [heartbeat.hostname, `pid ${heartbeat.pid}`].filter(Boolean).join(" · ")
                : undefined
            }
          />
        </Section>

        <Section title={t("Queue")}>
          {["waiting", "active", "delayed", "failed"].map((key) => {
            const value = data?.queueCounts[key] ?? 0;
            return (
              <InfoRow
                key={key}
                label={label(key)}
                value={<span className="numeral">{value.toLocaleString(locale)}</span>}
                valueClassName={
                  key === "failed" && value > 0 ? "font-medium text-error" : "text-muted"
                }
              />
            );
          })}
        </Section>
      </div>

      <Section title={t("Recent Worker Alerts")}>
        {data?.workerAlerts.length ? (
          data.workerAlerts.map((alert) => (
            <div
              key={`${alert.createdAt}-${alert.jobId ?? alert.message}`}
              className="group-row items-start justify-between gap-4 py-3"
            >
              <div className="min-w-0">
                <p className="break-words text-[15px]">{alert.message}</p>
                <p className="caption mt-0.5">
                  {formatDate(alert.createdAt, locale)}
                  {alert.commentId ? ` · ${alert.commentId}` : ""}
                </p>
              </div>
              <span className={`shrink-0 text-[13px] font-medium ${levelClass(alert.level)}`}>
                {alert.level}
              </span>
            </div>
          ))
        ) : (
          <EmptyState label={t("No worker alerts recorded.")} />
        )}
      </Section>

      <Section title={t("Campaign DM Failures And Skips")}>
        {data?.dmFailures.length ? (
          data.dmFailures.map((item) => (
            <div key={item.id} className="group-row items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-[15px]">{item.automation.name}</p>
                <p className="footnote mt-0.5 truncate">{item.commentText}</p>
                {item.errorMessage && (
                  <p className="mt-0.5 text-[12px] leading-4 text-error">{item.errorMessage}</p>
                )}
              </div>
              <StatusBadge status={item.status} className="pt-0.5" />
            </div>
          ))
        ) : (
          <EmptyState label={t("No DM failures or skips.")} />
        )}
      </Section>

      <div className="grid gap-8 md:grid-cols-2 md:gap-6">
        <Section title={t("Webhook Failures")}>
          {data?.webhookFailures.length ? (
            data.webhookFailures.map((event) => (
              <div key={event.id} className="group-row flex-col items-start gap-0.5 py-3">
                <p className="text-[15px]">{event.object ?? t("Instagram webhook")}</p>
                <p className="text-[13px] leading-[18px] text-error">
                  {event.errorMessage ?? t("Unknown error")}
                </p>
                <p className="caption">{formatDate(event.createdAt, locale)}</p>
              </div>
            ))
          ) : (
            <EmptyState label={t("No failed webhook events.")} />
          )}
        </Section>

        <Section title={t("Token Refresh Failures")}>
          {data?.tokenRefreshFailures.length ? (
            data.tokenRefreshFailures.map((event) => (
              <div key={event.id} className="group-row flex-col items-start gap-0.5 py-3">
                <p className="text-[15px]">{event.message}</p>
                <p className="caption">{formatDate(event.createdAt, locale)}</p>
              </div>
            ))
          ) : (
            <EmptyState label={t("No token refresh failures.")} />
          )}
        </Section>
      </div>

      <Section title={t("Operational Event Timeline")}>
        {data?.operationalEvents.length ? (
          data.operationalEvents.map((event) => (
            <div
              key={event.id}
              className="group-row grid items-start gap-x-4 gap-y-0.5 py-3 sm:grid-cols-[120px_1fr_auto]"
            >
              <p className={`text-[13px] font-medium ${levelClass(event.level)}`}>{event.source}</p>
              <p className="text-[15px]">{event.message}</p>
              <p className="caption whitespace-nowrap">{formatDate(event.createdAt, locale)}</p>
            </div>
          ))
        ) : (
          <EmptyState label={t("No operational events recorded.")} />
        )}
      </Section>
    </div>
  );
}
