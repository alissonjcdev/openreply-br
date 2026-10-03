"use client";

import type { StaticMessageKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";

/**
 * Status label for DM status. Plain colored text, the way Mail and Activity
 * Monitor show state: no badge, no dot, no capsule.
 */

const statusConfig: Record<string, { text: string; label: StaticMessageKey }> = {
  SENT: { text: "text-success", label: "Sent" },
  FAILED: { text: "text-error", label: "Failed" },
  PENDING: { text: "text-warning", label: "Pending" },
  SKIPPED_DEDUP: { text: "text-muted", label: "Dedup" },
  SKIPPED_RATE_LIMIT: { text: "text-warning", label: "Rate limited" },
  SKIPPED_PLAN_LIMIT: { text: "text-warning", label: "Skipped" },
  SKIPPED_NO_MATCH: { text: "text-muted", label: "No match" },
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export default function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const { t } = useI18n();
  const config = statusConfig[status] ?? statusConfig.PENDING;

  return (
    <span
      className={`shrink-0 whitespace-nowrap text-[13px] font-medium tracking-[-0.005em] ${config.text} ${className}`}
    >
      {t(config.label)}
    </span>
  );
}
