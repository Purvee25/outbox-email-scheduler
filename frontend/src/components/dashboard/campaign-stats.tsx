"use client";

import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/cn";
import { api, queryKeys } from "@/lib/api";

const STAT_ITEMS = [
  { key: "scheduled" as const, label: "Scheduled", activeColor: "text-ink" },
  { key: "sending" as const, label: "Sending", activeColor: "text-brand-600" },
  { key: "sent" as const, label: "Sent", activeColor: "text-[#068736]" },
  { key: "failed" as const, label: "Failed", activeColor: "text-danger-fg" },
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
    <div className="mb-4 flex items-stretch rounded-control border border-border bg-white text-sm overflow-hidden">
      {STAT_ITEMS.map(({ key, label, activeColor }, i) => {
        const value = data[key];
        const active = value > 0;
        return (
          <div
            key={key}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 py-3 transition-colors",
              i > 0 && "border-l border-border",
              active && "bg-field/30",
            )}
          >
            <span
              className={cn(
                "text-xl font-bold tabular-nums leading-none",
                active ? activeColor : "text-ink-muted/40",
              )}
            >
              {value.toLocaleString()}
            </span>
            <span
              className={cn(
                "text-[11px] font-medium",
                active ? "text-ink-muted" : "text-ink-muted/30",
              )}
            >
              {label}
            </span>
          </div>
        );
      })}
      <div className="flex flex-col items-center justify-center border-l border-border px-5 py-3">
        <span className="text-xl font-bold tabular-nums text-ink leading-none">
          {total.toLocaleString()}
        </span>
        <span className="text-[11px] font-medium text-ink-muted">Total</span>
      </div>
    </div>
  );
}
