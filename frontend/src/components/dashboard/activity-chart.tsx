"use client";

import { useQuery } from "@tanstack/react-query";
import { api, queryKeys } from "@/lib/api";

const W = 560;
const H = 140;
const TOP_PAD = 24; // room for value labels
const BOT_PAD = 22; // room for day labels
const CHART_H = H - TOP_PAD - BOT_PAD;
const BAR_GAP = 10;

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
  const barW = (W - BAR_GAP * (n - 1)) / n;
  const maxVal = Math.max(...data.map((p) => p.sent + p.failed), 1);
  // Scale bars to at most 85% of chart height so they never slam the top
  const scale = (v: number) => (v / maxVal) * CHART_H * 0.85;

  const gridLines = [0.25, 0.5, 0.75, 1].map((f) => Math.round(maxVal * f));

  return (
    <div className="mb-4 rounded-control border border-border bg-white px-5 pt-4 pb-3">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
          Sends — last 7 days
        </p>
        <div className="flex items-center gap-3 text-xs text-ink-muted">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-[#068736]" />
            Sent
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-red-400" />
            Failed
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        aria-label="Emails sent per day over the last 7 days"
        role="img"
      >
        {/* Horizontal grid lines */}
        {gridLines.map((val) => {
          const y = TOP_PAD + CHART_H - scale(val);
          return (
            <line
              key={val}
              x1={0}
              x2={W}
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeWidth={0.5}
              strokeDasharray="4 4"
              className="text-border"
            />
          );
        })}

        {data.map((point, i) => {
          const x = i * (barW + BAR_GAP);
          const sentH = scale(point.sent);
          const failedH = scale(point.failed);
          const totalH = sentH + failedH;
          const baseY = TOP_PAD + CHART_H;
          const total = point.sent + point.failed;

          return (
            <g key={point.date}>
              {/* Failed segment (top, red) */}
              {point.failed > 0 && (
                <rect
                  x={x}
                  y={baseY - totalH}
                  width={barW}
                  height={failedH}
                  rx={point.sent === 0 ? 4 : 0}
                  ry={point.sent === 0 ? 4 : 0}
                  fill="#f87171"
                />
              )}
              {/* Sent segment (bottom, green) */}
              {point.sent > 0 && (
                <rect
                  x={x}
                  y={baseY - sentH}
                  width={barW}
                  height={sentH}
                  rx={4}
                  ry={4}
                  fill="#068736"
                />
              )}
              {/* Round top corners when stacked */}
              {point.sent > 0 && point.failed > 0 && (
                <rect
                  x={x}
                  y={baseY - sentH}
                  width={barW}
                  height={8}
                  fill="#068736"
                />
              )}
              {/* Empty bar */}
              {total === 0 && (
                <rect
                  x={x}
                  y={baseY - 3}
                  width={barW}
                  height={3}
                  rx={2}
                  fill="currentColor"
                  className="text-border"
                />
              )}
              {/* Value label above bar */}
              {total > 0 && (
                <text
                  x={x + barW / 2}
                  y={baseY - totalH - 5}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={600}
                  fill="currentColor"
                  className="text-ink-muted"
                >
                  {total}
                </text>
              )}
              {/* Day label */}
              <text
                x={x + barW / 2}
                y={H - 4}
                textAnchor="middle"
                fontSize={10}
                fill="currentColor"
                className="text-ink-muted"
              >
                {dayLabel(point.date)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
