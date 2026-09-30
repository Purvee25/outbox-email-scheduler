"use client";

import type { EmailListItem, EmailStatus, EmailTab } from "@scheduler/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { api, queryKeys } from "@/lib/api";
import { formatBadgeTime } from "@/lib/format";

export const PAGE_SIZE = 20;
/** Lists refresh on this interval so emails move from Scheduled to Sent on their own. */
const POLL_INTERVAL_MS = 5_000;
const SKELETON_ROWS = 6;

const EMPTY_COPY: Record<EmailTab, { title: string; description: string }> = {
  scheduled: {
    title: "No scheduled emails",
    description: "Compose a campaign and upload your leads to schedule emails.",
  },
  sent: {
    title: "No sent emails yet",
    description: "Emails appear here as soon as they are sent.",
  },
  archived: {
    title: "No archived emails",
    description: "Emails you archive will appear here.",
  },
};

function EmailRow({
  email,
  onOpen,
}: {
  email: EmailListItem;
  onOpen: (id: string) => void;
}) {
  const displayTime = email.sentAt ?? email.scheduledAt;
  return (
    <li className="relative flex items-center gap-4 border-b border-border px-4 py-4 text-[15px] hover:bg-field/60">
      <button
        type="button"
        onClick={() => onOpen(email.id)}
        className="w-48 shrink-0 truncate text-left text-sm after:absolute after:inset-0"
      >
        {email.recipient}
      </button>
      <span className="min-w-0 flex-1 truncate font-medium">
        {email.subject}
        {email.preview && (
          <span className="font-normal text-ink-muted"> — {email.preview}</span>
        )}
      </span>
      <span className="w-28 shrink-0">
        <StatusBadge status={email.status} title={email.error ?? undefined} />
      </span>
      <time
        dateTime={displayTime}
        className="w-32 shrink-0 text-right text-sm text-ink-muted"
      >
        {formatBadgeTime(displayTime)}
      </time>
      {email.previewUrl ? (
        <a
          href={email.previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="relative z-10 w-14 shrink-0 text-right text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          Preview
        </a>
      ) : (
        <span className="w-14 shrink-0" />
      )}
    </li>
  );
}

const TIME_HEADER: Record<EmailTab, string> = {
  scheduled: "Scheduled for",
  sent: "Sent at",
  archived: "Time",
};

function TableHeader({ tab }: { tab: EmailTab }) {
  return (
    <div className="flex items-center gap-4 border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
      <span className="w-48 shrink-0">Recipient</span>
      <span className="min-w-0 flex-1">Subject</span>
      <span className="w-28 shrink-0">Status</span>
      <span className="w-32 shrink-0 text-right">{TIME_HEADER[tab]}</span>
      <span className="w-14 shrink-0" />
    </div>
  );
}

function SkeletonRow() {
  return (
    <li className="flex items-center gap-4 border-b border-border px-4 py-4">
      <Skeleton className="h-4 w-48 shrink-0" />
      <Skeleton className="h-4 min-w-0 flex-1" />
      <Skeleton className="h-6 w-28 shrink-0 rounded-full" />
      <Skeleton className="h-4 w-32 shrink-0" />
      <span className="w-14 shrink-0" />
    </li>
  );
}

interface EmailTableProps {
  tab: EmailTab;
  page: number;
  onPageChange: (page: number) => void;
  /** Debounced free-text search; empty lists everything. */
  search: string;
  status?: EmailStatus;
  emptyAction: ReactNode;
  onOpen: (id: string) => void;
}

export function EmailTable({
  tab,
  page,
  onPageChange,
  search,
  status,
  emptyAction,
  onOpen,
}: EmailTableProps) {
  const params = {
    tab,
    page,
    pageSize: PAGE_SIZE,
    q: search || undefined,
    status,
  };
  const query = useQuery({
    queryKey: queryKeys.emails(params),
    queryFn: () => api.listEmails(params),
    refetchInterval: POLL_INTERVAL_MS,
    placeholderData: keepPreviousData,
  });
  const filtered = Boolean(search || status);
  const rows = query.data?.items;

  if (query.error && !rows) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 px-6 py-16 text-center"
      >
        <p className="text-sm text-danger-fg">
          Couldn&apos;t load emails: {query.error.message}
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void query.refetch()}
        >
          Try again
        </Button>
      </div>
    );
  }
  if (rows?.length === 0) {
    return filtered ? (
      <EmptyState
        title="No matching emails"
        description="Try a different search or clear the filters."
      />
    ) : (
      <EmptyState
        {...EMPTY_COPY[tab]}
        action={tab === "scheduled" ? emptyAction : undefined}
      />
    );
  }

  return (
    <>
      <TableHeader tab={tab} />
      <ul aria-label={tab === "scheduled" ? "Scheduled emails" : "Sent emails"}>
        {rows
          ? rows.map((email) => (
              <EmailRow key={email.id} email={email} onOpen={onOpen} />
            ))
          : Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <SkeletonRow key={index} />
            ))}
      </ul>
      {query.data && (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={query.data.total}
          onPageChange={onPageChange}
        />
      )}
    </>
  );
}
