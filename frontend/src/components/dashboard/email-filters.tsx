"use client";

import {
  MAX_SEARCH_LENGTH,
  TAB_STATUSES,
  type EmailStatus,
  type EmailTab,
} from "@scheduler/shared";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/api";
import { cn } from "@/lib/cn";

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
          placeholder="Search"
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
