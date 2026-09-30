"use client";

import { useQuery } from "@tanstack/react-query";
import { api, queryKeys } from "@/lib/api";

const W = 600;
const H = 120;
const BAR_GAP = 6;
const LABEL_H = 20;
const CHART_H = H - LABEL_H;

function shortDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 3);
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

  return (
    <div className="mb-4 rounded-control border border-border bg-field/40 px-5 py-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-muted">
        Sends — last 7 days
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        aria-label="Emails sent per day over the last 7 days"
        role="img"
      >
        {data.map((point, i) => {
          const x = i * (barW + BAR_GAP);
          const sentH = (point.sent / maxVal) * CHART_H;
          const failedH = (point.failed / maxVal) * CHART_H;
          const totalH = sentH + failedH;
          const label = shortDate(point.date);

          return (
            <g key={point.date}>
              {/* Failed (top of stack, red) */}
              {point.failed > 0 && (
                <rect
                  x={x}
                  y={CHART_H - totalH}
                  width={barW}
                  height={failedH}
                  rx={point.sent === 0 ? 3 : 0}
                  ry={point.sent === 0 ? 3 : 0}
                  fill="#ef4444"
                  opacity={0.8}
                />
              )}
              {/* Sent (bottom of stack, green) */}
              {point.sent > 0 && (
                <rect
                  x={x}
                  y={CHART_H - sentH}
                  width={barW}
                  height={sentH}
                  rx={3}
                  ry={3}
                  fill="#068736"
                  opacity={0.85}
                />
              )}
              {/* Empty bar placeholder */}
              {point.sent === 0 && point.failed === 0 && (
                <rect
                  x={x}
                  y={CHART_H - 3}
                  width={barW}
                  height={3}
                  rx={2}
                  fill="currentColor"
                  className="text-border"
                />
              )}
              {/* Day label */}
              <text
                x={x + barW / 2}
                y={H - 2}
                textAnchor="middle"
                fontSize={10}
                fill="currentColor"
                className="text-ink-muted"
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex items-center gap-4 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-[#068736]" />
          Sent
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-red-500" />
          Failed
        </span>
      </div>
    </div>
  );
}
