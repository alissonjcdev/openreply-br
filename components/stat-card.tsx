"use client";

import { useI18n } from "@/lib/i18n/provider";

/**
 * Stat Card
 *
 * One metric cell meant to live inside a grouped container (`.group`), next
 * to its siblings and separated from them by hairlines. It draws no surface
 * of its own: a row of stand-alone metric cards is exactly the template look
 * the design system avoids.
 *
 * `size="lg"` is the hero metric of a group; `tone` colors the numeral only
 * when the value is a status (failures), never decoratively.
 */

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: string;
  trendUp?: boolean;
  size?: "md" | "lg";
  tone?: "default" | "error" | "warning" | "success";
  footnote?: string;
  className?: string;
}

const toneClass = {
  default: "text-foreground",
  error: "text-error",
  warning: "text-warning",
  success: "text-success",
} as const;

export default function StatCard({
  label,
  value,
  trend,
  trendUp,
  size = "md",
  tone = "default",
  footnote,
  className = "",
}: StatCardProps) {
  const { t } = useI18n();
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="truncate text-[13px] leading-[18px] text-muted">{label}</p>
      <p
        className={`numeral mt-1 font-semibold leading-none ${toneClass[tone]} ${
          size === "lg" ? "text-[40px] sm:text-[48px]" : "text-[26px] sm:text-[28px]"
        }`}
      >
        {value}
      </p>
      {footnote && <p className="caption mt-2 truncate">{footnote}</p>}
      {trend && (
        <p className={`caption mt-1.5 ${trendUp ? "!text-success" : "!text-error"}`}>
          {trendUp ? t("Up") : t("Down")} {trend}
        </p>
      )}
    </div>
  );
}
