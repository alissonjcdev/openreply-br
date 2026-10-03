"use client";

/**
 * Followers Over Time
 *
 * Single-series line chart over stored daily snapshots. Deliberately separate
 * from the Overview stat tiles: those sum the selected posts, while this is an
 * account-level total that ignores the post range.
 *
 * History depth is limited by what has been snapshotted — Instagram only serves
 * ~30 days of account insights, so earlier days exist only if this instance was
 * already running then.
 */

import { formatCompact as formatCompactNumber } from "@/lib/utils/format";
import type { Locale } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";
import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface FollowerChartPoint {
  date: string;
  followers: number;
  delta: number | null;
}

// Theme tokens from globals.css, so the chart follows light/dark. Recharts
// passes these through as SVG presentation attributes, where var() resolves.
// The accent line clears 3:1 on both chart surfaces; grid/axis text match the
// border/muted tokens.
const SERIES_COLOR = "var(--accent)";
// Flat tint under the line (no gradient), mixed from the accent token so it
// follows the theme.
const AREA_FILL = "color-mix(in srgb, var(--accent) 12%, transparent)";
const GRID_COLOR = "var(--border)";
const AXIS_TEXT = "var(--tertiary)";
const SURFACE_COLOR = "var(--surface)";

function formatCompact(n: number, locale: Locale): string {
  if (Math.abs(n) >= 1_000) return formatCompactNumber(n, locale);
  return n.toLocaleString(locale);
}

function formatDay(iso: string, locale: Locale): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatSigned(n: number, locale: Locale): string {
  return `${n > 0 ? "+" : ""}${n.toLocaleString(locale)}`;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: FollowerChartPoint }>;
}) {
  const { t, locale } = useI18n();
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;

  return (
    <div className="popover px-3 py-2 text-[12px] leading-4">
      <p className="text-muted">{formatDay(point.date, locale)}</p>
      <p className="numeral mt-1 text-[13px] font-semibold text-foreground">
        {point.followers.toLocaleString(locale)} {t("followers")}
      </p>
      {point.delta !== null && point.delta !== 0 && (
        <p className={point.delta > 0 ? "text-success" : "text-error"}>
          {formatSigned(point.delta, locale)} {t("that day")}
        </p>
      )}
    </div>
  );
}

export default function FollowerChart({
  data,
  followers,
}: {
  data: FollowerChartPoint[];
  followers: number | null;
}) {
  const { t, locale } = useI18n();
  const [showTable, setShowTable] = useState(false);

  const current = followers ?? data.at(-1)?.followers ?? null;

  // Net change across the whole visible window, shown once in the header rather
  // than labelling every point.
  const net =
    data.length > 1 ? data[data.length - 1].followers - data[0].followers : null;

  return (
    <section>
      <div className="flex items-end justify-between gap-3 pr-4">
        <h2 className="group-header">{t("Followers over time")}</h2>
        {data.length > 1 && (
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className="btn-plain mb-1.5 text-[13px]"
          >
            {showTable ? t("Show chart") : t("Show table")}
          </button>
        )}
      </div>

      <div className="group">
        <div className="px-4 pt-4 sm:px-5">
          {current === null ? (
            <p className="title-3 text-muted">{t("Follower count unavailable")}</p>
          ) : (
            <p className="numeral text-[28px] font-semibold leading-9">
              {current.toLocaleString(locale)}
              <span className="ml-1.5 font-sans text-[15px] font-normal tracking-normal text-muted">
                {t("followers")}
              </span>
            </p>
          )}
          {net !== null && (
            <p className="footnote">
              <span className={`numeral font-medium ${net >= 0 ? "text-success" : "text-error"}`}>
                {formatSigned(net, locale)}
              </span>{" "}
              {t("over {count} days", { count: data.length })}
            </p>
          )}
        </div>

        {data.length < 2 ? (
          <div className="px-4 pt-8 pb-10 text-center sm:px-5">
            <p className="text-[15px] font-medium">{t("Collecting follower history")}</p>
            <p className="footnote mx-auto mt-1 max-w-md">
              {data.length === 0
                ? t("No snapshots recorded yet.")
                : t("One day recorded so far.")}{" "}
              {t("A point is added daily — the chart appears once there are at least two.")}
            </p>
          </div>
        ) : showTable ? (
          <div className="mt-3 max-h-80 overflow-y-auto border-t-[0.5px] border-border-hover">
            <table className="w-full text-[14px]">
              <thead className="material sticky top-0">
                <tr className="text-left text-[12px] text-muted">
                  <th className="py-2 pl-4 pr-3 font-medium sm:pl-5">{t("Date")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("Followers")}</th>
                  <th className="py-2 pl-3 pr-4 text-right font-medium sm:pr-5">{t("Change")}</th>
                </tr>
              </thead>
              <tbody>
                {[...data].reverse().map((p) => (
                  <tr key={p.date} className="border-t-[0.5px] border-border-hover">
                    <td className="py-2.5 pl-4 pr-3 sm:pl-5">{formatDay(p.date, locale)}</td>
                    <td className="numeral px-3 py-2.5 text-right">
                      {p.followers.toLocaleString(locale)}
                    </td>
                    <td
                      className={`numeral py-2.5 pl-3 pr-4 text-right sm:pr-5 ${
                        p.delta === null || p.delta === 0
                          ? "text-muted"
                          : p.delta > 0
                            ? "text-success"
                            : "text-error"
                      }`}
                    >
                      {p.delta === null ? "—" : formatSigned(p.delta, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 h-56 pr-1 pb-3 pl-4 sm:h-64 sm:pl-5">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID_COLOR} strokeWidth={0.75} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => formatDay(value, locale)}
                  tick={{ fill: AXIS_TEXT, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={8}
                  minTickGap={32}
                />
                <YAxis
                  orientation="right"
                  tickFormatter={(value) => formatCompact(value, locale)}
                  tick={{ fill: AXIS_TEXT, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={6}
                  width={48}
                  tickCount={4}
                  allowDecimals={false}
                  // Followers rarely start near zero, so a zero baseline would
                  // flatten the line into a straight edge. "auto" on both ends
                  // fits the data and still lands on round tick values.
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  content={<ChartTooltip />}
                  cursor={{ stroke: "var(--border-hover)", strokeWidth: 1 }}
                />
                <Area
                  type="monotone"
                  dataKey="followers"
                  stroke={SERIES_COLOR}
                  strokeWidth={2}
                  fill={AREA_FILL}
                  fillOpacity={1}
                  dot={false}
                  activeDot={{ r: 4.5, fill: SERIES_COLOR, stroke: SURFACE_COLOR, strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  );
}
