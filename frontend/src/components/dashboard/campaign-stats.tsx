"use client";

import { useQuery } from "@tanstack/react-query";
import { api, queryKeys } from "@/lib/api";

const STAT_ITEMS = [
  { key: "scheduled" as const, label: "Scheduled", color: "text-ink-muted" },
  { key: "sending" as const, label: "Sending", color: "text-brand-600" },
  { key: "sent" as const, label: "Sent", color: "text-[#068736]" },
  { key: "failed" as const, label: "Failed", color: "text-danger-fg" },
];

export function CampaignStats() {
  const { data } = useQuery({
    queryKey: queryKeys.emailStats,
    queryFn: api.getEmailStats,
    refetchInterval: 5_000,
  });

  if (!data) return null;
  const total = data.scheduled + data.sending + data.sent + data.failed;
  if (total === 0) return null;

  return (
    <div className="mb-4 flex items-center gap-6 rounded-control border border-border bg-field/50 px-5 py-3 text-sm">
      {STAT_ITEMS.map(({ key, label, color }) => (
        <span key={key} className="flex items-center gap-1.5">
          <span className={`font-semibold tabular-nums ${color}`}>
            {data[key].toLocaleString()}
          </span>
          <span className="text-ink-muted">{label}</span>
        </span>
      ))}
      <span className="ml-auto text-xs text-ink-muted">
        {total.toLocaleString()} total
      </span>
    </div>
  );
}
