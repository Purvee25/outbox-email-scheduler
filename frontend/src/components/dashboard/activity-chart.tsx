"use client";

import { useQuery } from "@tanstack/react-query";
import { api, queryKeys } from "@/lib/api";

// Fixed pixel heights — bars never grow beyond MAX_BAR_H regardless of data
const MAX_BAR_H = 72;
const DAY_LABEL_H = 28;
const VALUE_LABEL_H = 18;
const SVG_H = MAX_BAR_H + DAY_LABEL_H + VALUE_LABEL_H;
const SVG_W = 560;
const BAR_GAP = 10;
const BAR_R = 4;

function dayLabel(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
  });
}

export function ActivityChart() {
  const { data } = useQuery({
    queryKey: queryKeys.emailActivity,
    queryFn: api.getEmailActivity,
    refetchInterval: 30_000,
  });

  if (!data || data.every((p) => p.sent === 0 && p.failed === 0)) return null;

  const n = data.length;
  const barW = (SVG_W - BAR_GAP * (n - 1)) / n;
  const maxVal = Math.max(...data.map((p) => p.sent + p.failed), 1);
  // Scale so the tallest bar is exactly MAX_BAR_H
  const toH = (v: number) => (v / maxVal) * MAX_BAR_H;

  // Grid values: 3 lines at 33 / 66 / 100 % of max
  const gridVals = [
    Math.round(maxVal * 0.33),
    Math.round(maxVal * 0.66),
    maxVal,
  ].filter((v) => v > 0);

  const baseY = VALUE_LABEL_H + MAX_BAR_H; // y of the baseline

  return (
    <div className="mb-4 overflow-hidden rounded-control border border-border bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
          Sends — last 7 days
        </p>
        <div className="flex items-center gap-4 text-xs text-ink-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#068736]" />
            Sent
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-red-400" />
            Failed
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="px-5 py-4">
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          style={{ height: SVG_H }}
          className="w-full overflow-visible"
          aria-label="Emails sent per day over the last 7 days"
          role="img"
        >
          {/* Grid lines */}
          {gridVals.map((val) => {
            const y = baseY - toH(val);
            return (
              <g key={val}>
                <line
                  x1={0}
                  x2={SVG_W}
                  y1={y}
                  y2={y}
                  stroke="#e5e7eb"
                  strokeWidth={1}
                  strokeDasharray="3 4"
                />
                <text
                  x={-4}
                  y={y + 4}
                  textAnchor="end"
                  fontSize={8}
                  fill="#9ca3af"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Bars */}
          {data.map((point, i) => {
            const x = i * (barW + BAR_GAP);
            const sentH = toH(point.sent);
            const failH = toH(point.failed);
            const totalH = sentH + failH;
            const total = point.sent + point.failed;

            return (
              <g key={point.date}>
                {/* Sent bar */}
                {point.sent > 0 && (
                  <rect
                    x={x}
                    y={baseY - sentH}
                    width={barW}
                    height={sentH}
                    rx={point.failed > 0 ? 0 : BAR_R}
                    ry={point.failed > 0 ? 0 : BAR_R}
                    fill="#068736"
                  />
                )}
                {/* Round bottom corners of sent bar */}
                {point.sent > 0 && (
                  <rect
                    x={x}
                    y={baseY - BAR_R}
                    width={barW}
                    height={BAR_R}
                    fill="#068736"
                  />
                )}
                {/* Failed bar on top */}
                {point.failed > 0 && (
                  <rect
                    x={x}
                    y={baseY - totalH}
                    width={barW}
                    height={failH}
                    rx={BAR_R}
                    ry={BAR_R}
                    fill="#f87171"
                  />
                )}
                {/* Remove radius at bottom of failed when stacked */}
                {point.failed > 0 && point.sent > 0 && (
                  <rect
                    x={x}
                    y={baseY - totalH + BAR_R}
                    width={barW}
                    height={BAR_R}
                    fill="#f87171"
                  />
                )}
                {/* Empty placeholder */}
                {total === 0 && (
                  <rect
                    x={x}
                    y={baseY - 2}
                    width={barW}
                    height={2}
                    rx={1}
                    fill="#e5e7eb"
                  />
                )}
                {/* Value label */}
                {total > 0 && (
                  <text
                    x={x + barW / 2}
                    y={baseY - totalH - 5}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={700}
                    fill="#374151"
                  >
                    {total}
                  </text>
                )}
                {/* Day label */}
                <text
                  x={x + barW / 2}
                  y={SVG_H - 4}
                  textAnchor="middle"
                  fontSize={11}
                  fill="#9ca3af"
                >
                  {dayLabel(point.date)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
