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
    <div className="mb-4 flex items-center gap-1 rounded-control border border-border bg-field/40 px-2 py-2 text-sm">
      {STAT_ITEMS.map(({ key, label, activeColor }, i) => {
        const value = data[key];
        const active = value > 0;
        return (
          <span key={key} className="flex items-center">
            {i > 0 && <span className="mx-2 h-4 w-px bg-border" aria-hidden />}
            <span
              className={cn(
                "flex items-baseline gap-1.5 rounded-lg px-3 py-1.5 transition-colors",
                active && "bg-white shadow-sm",
              )}
            >
              <span
                className={cn(
                  "text-base font-bold tabular-nums leading-none",
                  active ? activeColor : "text-ink-muted/50",
                )}
              >
                {value.toLocaleString()}
              </span>
              <span
                className={cn(
                  "text-xs",
                  active ? "text-ink-muted" : "text-ink-muted/40",
                )}
              >
                {label}
              </span>
            </span>
          </span>
        );
      })}
      <span className="ml-auto pr-2 text-xs text-ink-muted">
        {total.toLocaleString()} total
      </span>
    </div>
  );
}
