"use client";

import { useQuery } from "@tanstack/react-query";
import { api, queryKeys } from "@/lib/api";

// Sidebar-sized chart constants
const MAX_BAR_H = 56;
const DAY_LABEL_H = 20;
const VALUE_LABEL_H = 14;
const SVG_H = MAX_BAR_H + DAY_LABEL_H + VALUE_LABEL_H;
const BAR_GAP = 5;
const BAR_R = 3;

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
  // Width is dynamic — we use a % viewBox so the SVG fills its container
  const SVG_W = 200;
  const barW = (SVG_W - BAR_GAP * (n - 1)) / n;
  const maxVal = Math.max(...data.map((p) => p.sent + p.failed), 1);
  const toH = (v: number) => (v / maxVal) * MAX_BAR_H;
  const baseY = VALUE_LABEL_H + MAX_BAR_H;

  return (
    <div className="rounded-control border border-border bg-white overflow-hidden">
      {/* Mini legend */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted">
          Last 7 days
        </span>
        <div className="flex items-center gap-2 text-[10px] text-ink-muted">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-sm bg-[#068736]" />
            Sent
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-sm bg-red-400" />
            Failed
          </span>
        </div>
      </div>

      <div className="px-3 py-3">
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          style={{ height: SVG_H }}
          className="w-full"
          aria-label="Emails sent per day"
          role="img"
        >
          {/* Baseline */}
          <line
            x1={0}
            x2={SVG_W}
            y1={baseY}
            y2={baseY}
            stroke="#e5e7eb"
            strokeWidth={1}
          />

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
                {point.sent > 0 && (
                  <rect
                    x={x}
                    y={baseY - BAR_R}
                    width={barW}
                    height={BAR_R}
                    fill="#068736"
                  />
                )}
                {/* Failed on top */}
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
                {point.failed > 0 && point.sent > 0 && (
                  <rect
                    x={x}
                    y={baseY - totalH + BAR_R}
                    width={barW}
                    height={BAR_R}
                    fill="#f87171"
                  />
                )}
                {/* Empty */}
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
                    y={baseY - totalH - 3}
                    textAnchor="middle"
                    fontSize={8}
                    fontWeight={700}
                    fill="#374151"
                  >
                    {total}
                  </text>
                )}
                {/* Day label */}
                <text
                  x={x + barW / 2}
                  y={SVG_H - 2}
                  textAnchor="middle"
                  fontSize={8}
                  fill="#9ca3af"
                >
                  {dayLabel(point.date).slice(0, 2)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
