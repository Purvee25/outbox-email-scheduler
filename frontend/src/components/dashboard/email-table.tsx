"use client";

import type { EmailListItem, EmailTab } from "@scheduler/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/ui/status-badge";
import { api, queryKeys } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

export const PAGE_SIZE = 20;
/** Tables refresh on this interval so emails move from Scheduled to Sent on their own. */
const POLL_INTERVAL_MS = 5_000;

const recipientColumn: Column<EmailListItem> = {
  key: "recipient",
  header: "Email",
  render: (email) => <span className="font-medium">{email.recipient}</span>,
};
const subjectColumn: Column<EmailListItem> = {
  key: "subject",
  header: "Subject",
  render: (email) => <span className="line-clamp-1 max-w-xs">{email.subject}</span>,
};

const COLUMNS: Record<EmailTab, Column<EmailListItem>[]> = {
  scheduled: [
    recipientColumn,
    subjectColumn,
    { key: "scheduledAt", header: "Scheduled time", render: (email) => formatDateTime(email.scheduledAt) },
    { key: "status", header: "Status", render: (email) => <StatusBadge status={email.status} /> },
  ],
  sent: [
    recipientColumn,
    subjectColumn,
    { key: "sentAt", header: "Sent time", render: (email) => formatDateTime(email.sentAt) },
    {
      key: "status",
      header: "Status",
      render: (email) => <StatusBadge status={email.status} title={email.error ?? undefined} />,
    },
    {
      key: "preview",
      header: "",
      render: (email) =>
        email.previewUrl && (
          <a
            href={email.previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            Preview
          </a>
        ),
    },
  ],
};

const EMPTY_COPY: Record<EmailTab, { title: string; description: string }> = {
  scheduled: {
    title: "No scheduled emails",
    description: "Compose a campaign and upload your leads to schedule emails.",
  },
  sent: { title: "No sent emails yet", description: "Emails appear here as soon as they are sent." },
};

interface EmailTableProps {
  tab: EmailTab;
  page: number;
  onPageChange: (page: number) => void;
  emptyAction: ReactNode;
}

export function EmailTable({ tab, page, onPageChange, emptyAction }: EmailTableProps) {
  const query = useQuery({
    queryKey: queryKeys.emails(tab, page),
    queryFn: () => api.listEmails(tab, page, PAGE_SIZE),
    refetchInterval: POLL_INTERVAL_MS,
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <DataTable
        caption={tab === "scheduled" ? "Scheduled emails" : "Sent emails"}
        columns={COLUMNS[tab]}
        rows={query.data?.items}
        rowKey={(email) => email.id}
        loading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        empty={<EmptyState {...EMPTY_COPY[tab]} action={tab === "scheduled" ? emptyAction : undefined} />}
      />
      {query.data && (
        <Pagination page={page} pageSize={PAGE_SIZE} total={query.data.total} onPageChange={onPageChange} />
      )}
    </>
  );
}
