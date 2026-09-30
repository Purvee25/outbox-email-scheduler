"use client";

import { useQuery } from "@tanstack/react-query";
import { api, queryKeys } from "@/lib/api";

// Full-page chart constants
const MAX_BAR_H = 160;
const DAY_LABEL_H = 28;
const VALUE_LABEL_H = 20;
const SVG_H = MAX_BAR_H + DAY_LABEL_H + VALUE_LABEL_H;
const SVG_W = 700;
const BAR_GAP = 14;
const BAR_R = 5;

function dayLabel(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function BarChart() {
  const { data } = useQuery({
    queryKey: queryKeys.emailActivity,
    queryFn: api.getEmailActivity,
    refetchInterval: 30_000,
  });

  if (!data)
    return <div className="h-64 animate-pulse rounded-control bg-field" />;

  const allZero = data.every((p) => p.sent === 0 && p.failed === 0);
  if (allZero) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-ink-muted">
        No sends in the last 7 days
      </div>
    );
  }

  const n = data.length;
  const barW = (SVG_W - BAR_GAP * (n - 1)) / n;
  const maxVal = Math.max(...data.map((p) => p.sent + p.failed), 1);
  const toH = (v: number) => (v / maxVal) * MAX_BAR_H;
  const baseY = VALUE_LABEL_H + MAX_BAR_H;

  const gridVals = [
    Math.ceil(maxVal * 0.25),
    Math.ceil(maxVal * 0.5),
    Math.ceil(maxVal * 0.75),
    maxVal,
  ].filter((v, i, arr) => arr.indexOf(v) === i && v > 0);

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      style={{ height: SVG_H }}
      className="w-full"
      aria-label="Daily email activity"
      role="img"
    >
      {/* Grid */}
      {gridVals.map((val) => {
        const y = baseY - toH(val);
        return (
          <g key={val}>
            <line
              x1={0}
              x2={SVG_W}
              y1={y}
              y2={y}
              stroke="#f3f4f6"
              strokeWidth={1.5}
            />
            <text
              x={-6}
              y={y + 4}
              textAnchor="end"
              fontSize={10}
              fill="#9ca3af"
            >
              {val}
            </text>
          </g>
        );
      })}

      {/* Baseline */}
      <line
        x1={0}
        x2={SVG_W}
        y1={baseY}
        y2={baseY}
        stroke="#e5e7eb"
        strokeWidth={1}
      />

      {/* Bars */}
      {data.map((point, i) => {
        const x = i * (barW + BAR_GAP);
        const sentH = toH(point.sent);
        const failH = toH(point.failed);
        const totalH = sentH + failH;
        const total = point.sent + point.failed;

        return (
          <g key={point.date}>
            {/* Sent */}
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
            {/* Failed */}
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
                y={baseY - 3}
                width={barW}
                height={3}
                rx={2}
                fill="#e5e7eb"
              />
            )}
            {/* Value */}
            {total > 0 && (
              <text
                x={x + barW / 2}
                y={baseY - totalH - 6}
                textAnchor="middle"
                fontSize={11}
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
              fontSize={10}
              fill="#9ca3af"
            >
              {dayLabel(point.date)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-control border border-border bg-white p-5">
      <span className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
        {label}
      </span>
      <span className={`text-4xl font-bold tabular-nums leading-none ${color}`}>
        {value.toLocaleString()}
      </span>
      {sub && <span className="text-xs text-ink-muted">{sub}</span>}
    </div>
  );
}

export function AnalyticsView() {
  const stats = useQuery({
    queryKey: queryKeys.emailStats,
    queryFn: api.getEmailStats,
    refetchInterval: 5_000,
  });

  const d = stats.data;
  const total = d ? d.scheduled + d.sending + d.sent + d.failed : 0;
  const deliveryRate =
    d && d.sent + d.failed > 0
      ? Math.round((d.sent / (d.sent + d.failed)) * 100)
      : null;

  return (
    <div className="animate-fade-up min-w-0 flex-1 px-6 py-6 md:pr-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-sm text-ink-muted">
            Campaign performance at a glance
          </p>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-ink-muted">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#068736] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#068736]" />
          </span>
          Live · updates every 5s
        </span>
      </div>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatCard label="Total" value={total} color="text-ink" />
        <StatCard
          label="Scheduled"
          value={d?.scheduled ?? 0}
          color="text-ink-muted"
        />
        <StatCard
          label="Sending"
          value={d?.sending ?? 0}
          color="text-brand-600"
        />
        <StatCard label="Sent" value={d?.sent ?? 0} color="text-[#068736]" />
        <StatCard
          label="Failed"
          value={d?.failed ?? 0}
          color="text-danger-fg"
          sub={
            deliveryRate !== null ? `${deliveryRate}% delivery rate` : undefined
          }
        />
      </div>

      {/* Chart */}
      <div className="rounded-control border border-border bg-white">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <p className="font-semibold">Sends — last 7 days</p>
          <div className="flex items-center gap-4 text-xs text-ink-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-[#068736]" /> Sent
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-red-400" /> Failed
            </span>
          </div>
        </div>
        <div className="px-8 py-6">
          <BarChart />
        </div>
      </div>
    </div>
  );
}
