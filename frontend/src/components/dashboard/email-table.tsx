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

function EmailRow({ email, onOpen }: { email: EmailListItem; onOpen: (id: string) => void }) {
  return (
    <li className="flex items-center gap-4 border-b border-border relative px-4 py-5 text-[15px] hover:bg-field/60">
      <button
        type="button"
        onClick={() => onOpen(email.id)}
        className="w-56 shrink-0 truncate text-left after:absolute after:inset-0"
      >
        To: {email.recipient}
      </button>
      <StatusBadge
        status={email.status}
        scheduledAt={email.scheduledAt}
        title={email.error ?? undefined}
      />
      <span className="min-w-0 flex-1 truncate">
        {email.subject}
        {email.preview && <span className="text-ink-muted"> - {email.preview}</span>}
      </span>
      {email.sentAt && (
        <time
          dateTime={email.sentAt}
          className="shrink-0 text-sm text-ink-muted"
        >
          {formatBadgeTime(email.sentAt)}
        </time>
      )}
      {email.previewUrl && (
        <a
          href={email.previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="relative z-10 shrink-0 text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          Preview
        </a>
      )}
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
      <ul aria-label={tab === "scheduled" ? "Scheduled emails" : "Sent emails"}>
        {rows
          ? rows.map((email) => <EmailRow key={email.id} email={email} onOpen={onOpen} />)
          : Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <li key={index} className="border-b border-border px-4 py-5">
                <Skeleton className="h-5 w-full" />
              </li>
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
