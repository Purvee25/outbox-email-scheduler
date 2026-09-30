"use client";

import {
  MAX_SEARCH_LENGTH,
  TAB_STATUSES,
  type EmailStatus,
  type EmailTab,
} from "@scheduler/shared";
import { Input } from "@/components/ui/field";

const STATUS_LABELS: Record<EmailStatus, string> = {
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
};

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
  return (
    <div className="flex flex-col gap-3 border-b border-border px-6 py-3 sm:flex-row">
      <div className="relative flex-1">
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle"
        >
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.45 4.39l3.08 3.08a.75.75 0 1 1-1.06 1.06l-3.08-3.08A7 7 0 0 1 2 9Z"
            clipRule="evenodd"
          />
        </svg>
        <Input
          type="search"
          aria-label="Search emails"
          placeholder="Search by email, subject or body…"
          value={search}
          maxLength={MAX_SEARCH_LENGTH}
          onChange={(event) => onSearchChange(event.target.value)}
          className="pl-9"
        />
      </div>
      <select
        aria-label="Filter by status"
        value={status ?? ""}
        onChange={(event) =>
          onStatusChange(
            (event.target.value || undefined) as EmailStatus | undefined,
          )
        }
        className="h-10 rounded-control border border-border bg-surface px-3 text-sm text-ink focus:border-brand-500 focus:ring-3 focus:ring-brand-100 focus:outline-none"
      >
        <option value="">All statuses</option>
        {TAB_STATUSES[tab].map((value) => (
          <option key={value} value={value}>
            {STATUS_LABELS[value]}
          </option>
        ))}
      </select>
    </div>
  );
}
