"use client";

import {
  MAX_SEARCH_LENGTH,
  TAB_STATUSES,
  type EmailStatus,
  type EmailTab,
} from "@scheduler/shared";
import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api, queryKeys } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatBadgeTime } from "@/lib/format";

const STATUS_LABELS: Record<EmailStatus, string> = {
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
};

const ICON_BUTTON =
  "flex size-10 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-field";

interface EmailFiltersProps {
  tab: EmailTab;
  search: string;
  onSearchChange: (value: string) => void;
  status: EmailStatus | undefined;
  onStatusChange: (value: EmailStatus | undefined) => void;
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const recent = useQuery({
    queryKey: queryKeys.emails({ tab: "sent", page: 1, pageSize: 5 }),
    queryFn: () => api.listEmails({ tab: "sent", page: 1, pageSize: 5 }),
    refetchInterval: 5_000,
  });

  const prevCount = useRef(0);
  useEffect(() => {
    const total = recent.data?.total ?? 0;
    if (total > prevCount.current)
      setUnread((u) => u + (total - prevCount.current));
    prevCount.current = total;
  }, [recent.data?.total]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const items = recent.data?.items ?? [];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => {
          setOpen((o) => !o);
          setUnread(0);
        }}
        className={cn(ICON_BUTTON, open && "bg-mint text-brand-700")}
      >
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-5"
          aria-hidden
        >
          <path d="M10 2a6 6 0 0 1 6 6c0 3.5 1.5 5 1.5 5h-15S4 11.5 4 8a6 6 0 0 1 6-6ZM8.5 16.5a1.5 1.5 0 0 0 3 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-control border border-border bg-white shadow-lg">
          <p className="border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Recent sends
          </p>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-muted">
              No emails sent yet
            </p>
          ) : (
            <ul>
              {items.map((e) => (
                <li
                  key={e.id}
                  className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-0"
                >
                  <span className="mt-0.5 flex h-2 w-2 shrink-0 rounded-full bg-[#068736]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">
                      {e.subject}
                    </p>
                    <p className="truncate text-xs text-ink-muted">
                      {e.recipient}
                    </p>
                  </div>
                  <time className="shrink-0 text-[11px] text-ink-muted">
                    {formatBadgeTime(e.sentAt ?? e.scheduledAt)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function EmailFilters({
  tab,
  search,
  onSearchChange,
  status,
  onStatusChange,
}: EmailFiltersProps) {
  const queryClient = useQueryClient();
  const refreshing = useIsFetching({ queryKey: queryKeys.allEmails }) > 0;

  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-1">
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-muted"
        >
          <circle cx="9" cy="9" r="5.75" />
          <path d="m13.5 13.5 3.5 3.5" />
        </svg>
        <input
          type="search"
          aria-label="Search emails"
          placeholder="Search by recipient, subject or body…"
          value={search}
          maxLength={MAX_SEARCH_LENGTH}
          onChange={(event) => onSearchChange(event.target.value)}
          className="h-12 w-full rounded-pill bg-field pr-4 pl-12 text-[15px] placeholder:text-ink-muted focus:outline-2 focus:outline-brand-500"
        />
      </div>

      <details className="relative">
        <summary
          aria-label="Filter by status"
          className={cn(
            ICON_BUTTON,
            "cursor-pointer list-none [&::-webkit-details-marker]:hidden",
            status && "bg-mint text-brand-700",
          )}
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
            className="size-5"
            aria-hidden
          >
            <path d="M2.5 4h15l-5.75 6.75v5l-3.5 1.5v-6.5L2.5 4Z" />
          </svg>
        </summary>
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-40 rounded-control border border-border bg-white p-1 shadow-lg"
        >
          {[undefined, ...TAB_STATUSES[tab]].map((value) => (
            <button
              key={value ?? "all"}
              type="button"
              role="menuitemradio"
              aria-checked={value === status}
              onClick={(event) => {
                onStatusChange(value);
                event.currentTarget.closest("details")?.removeAttribute("open");
              }}
              className={cn(
                "block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-field",
                value === status && "font-semibold text-brand-700",
              )}
            >
              {value ? STATUS_LABELS[value] : "All statuses"}
            </button>
          ))}
        </div>
      </details>

      <NotificationBell />

      <button
        type="button"
        aria-label="Refresh"
        onClick={() =>
          void queryClient.invalidateQueries({ queryKey: queryKeys.allEmails })
        }
        className={ICON_BUTTON}
      >
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn("size-5", refreshing && "animate-spin")}
          aria-hidden
        >
          <path d="M16.5 10a6.5 6.5 0 1 1-2-4.7M16.5 3.5v3h-3" />
        </svg>
      </button>
    </div>
  );
}
