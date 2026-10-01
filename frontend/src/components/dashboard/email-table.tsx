"use client";

import type { EmailListItem, EmailStatus, EmailTab } from "@scheduler/shared";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { api, queryKeys } from "@/lib/api";
import { formatBadgeTime } from "@/lib/format";

export const PAGE_SIZE = 20;
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

function Checkbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label
      className="relative flex cursor-pointer items-center"
      aria-label={label}
    >
      <input
        type="checkbox"
        checked={checked}
        ref={(el) => {
          if (el) el.indeterminate = indeterminate ?? false;
        }}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border bg-white transition-colors peer-checked:border-brand-600 peer-checked:bg-brand-600">
        {(checked || indeterminate) && (
          <svg
            viewBox="0 0 12 12"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3 w-3"
          >
            {indeterminate && !checked ? (
              <path d="M2 6h8" />
            ) : (
              <path d="M2 6l3 3 5-5" />
            )}
          </svg>
        )}
      </span>
    </label>
  );
}

function EmailRow({
  email,
  selected,
  onSelect,
  onOpen,
}: {
  email: EmailListItem;
  selected: boolean;
  onSelect: (id: string, v: boolean) => void;
  onOpen: (id: string) => void;
}) {
  const displayTime = email.sentAt ?? email.scheduledAt;
  return (
    <li
      className={`relative flex items-center gap-4 border-b border-border px-4 py-4 text-[15px] transition-colors ${selected ? "bg-mint/40" : "hover:bg-field/60"}`}
    >
      <div
        className="relative z-10 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={selected}
          onChange={(v) => onSelect(email.id, v)}
          label={`Select ${email.recipient}`}
        />
      </div>
      <button
        type="button"
        onClick={() => onOpen(email.id)}
        className="w-44 shrink-0 truncate text-left text-sm after:absolute after:inset-0"
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

function TableHeader({
  tab,
  allChecked,
  indeterminate,
  onSelectAll,
}: {
  tab: EmailTab;
  allChecked: boolean;
  indeterminate: boolean;
  onSelectAll: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
      <div className="shrink-0">
        <Checkbox
          checked={allChecked}
          indeterminate={indeterminate}
          onChange={onSelectAll}
          label="Select all"
        />
      </div>
      <span className="w-44 shrink-0">Recipient</span>
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
      <Skeleton className="h-4 w-4 shrink-0 rounded" />
      <Skeleton className="h-4 w-44 shrink-0" />
      <Skeleton className="h-4 min-w-0 flex-1" />
      <Skeleton className="h-6 w-28 shrink-0 rounded-full" />
      <Skeleton className="h-4 w-32 shrink-0" />
      <span className="w-14 shrink-0" />
    </li>
  );
}

function BulkActionBar({
  count,
  tab,
  onDelete,
  onArchive,
  onClear,
  loading,
}: {
  count: number;
  tab: EmailTab;
  onDelete: () => void;
  onArchive: () => void;
  onClear: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-control border border-brand-600 bg-mint px-4 py-2 text-sm">
      <span className="font-medium text-brand-600">{count} selected</span>
      <span className="flex-1" />
      {tab !== "archived" && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onArchive}
          loading={loading}
        >
          Archive
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={onDelete}
        loading={loading}
        className="text-danger-fg hover:bg-danger-bg"
      >
        Delete
      </Button>
      <button
        type="button"
        onClick={onClear}
        className="ml-1 text-ink-muted hover:text-ink"
        aria-label="Clear selection"
      >
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          className="h-4 w-4"
        >
          <path d="M15 5L5 15M5 5l10 10" />
        </svg>
      </button>
    </div>
  );
}

interface EmailTableProps {
  tab: EmailTab;
  page: number;
  onPageChange: (page: number) => void;
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
  const queryClient = useQueryClient();
  const selectionKey = `${tab}|${page}|${search}|${status}`;
  const [selectionState, setSelectionState] = useState<{
    key: string;
    selected: Set<string>;
  }>({ key: selectionKey, selected: new Set() });

  const selected =
    selectionState.key === selectionKey
      ? selectionState.selected
      : new Set<string>();

  const setSelected = (next: Set<string>) =>
    setSelectionState({ key: selectionKey, selected: next });

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
  const rows = query.data?.items;

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["emails"] });

  const bulkDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => api.deleteEmail(id)));
    },
    onSuccess: (_, ids) => {
      toast.success(`Deleted ${ids.length} email${ids.length > 1 ? "s" : ""}`);
      setSelected(new Set());
      void invalidate();
    },
    onError: () => toast.error("Delete failed — please try again"),
  });

  const bulkArchive = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => api.setArchived(id, true)));
    },
    onSuccess: (_, ids) => {
      toast.success(`Archived ${ids.length} email${ids.length > 1 ? "s" : ""}`);
      setSelected(new Set());
      void invalidate();
    },
    onError: () => toast.error("Archive failed — please try again"),
  });

  const filtered = Boolean(search || status);

  const handleSelect = (id: string, v: boolean) => {
    const next = new Set(selected);
    if (v) next.add(id);
    else next.delete(id);
    setSelected(next);
  };

  const handleSelectAll = (v: boolean) => {
    if (v && rows) setSelected(new Set(rows.map((e) => e.id)));
    else setSelected(new Set());
  };

  const allChecked = !!rows?.length && rows.every((e) => selected.has(e.id));
  const indeterminate =
    !allChecked && rows?.some((e) => selected.has(e.id)) === true;

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

  const selectedIds = Array.from(selected);

  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-3 px-4">
        {selected.size > 0 ? (
          <BulkActionBar
            count={selected.size}
            tab={tab}
            loading={bulkDelete.isPending || bulkArchive.isPending}
            onDelete={() => bulkDelete.mutate(selectedIds)}
            onArchive={() => bulkArchive.mutate(selectedIds)}
            onClear={() => setSelected(new Set())}
          />
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-ink-muted ml-auto">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#068736] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#068736]" />
            </span>
            Live · updates every 5s
          </span>
        )}
      </div>
      <TableHeader
        tab={tab}
        allChecked={allChecked}
        indeterminate={indeterminate}
        onSelectAll={handleSelectAll}
      />
      <ul aria-label={tab === "scheduled" ? "Scheduled emails" : "Sent emails"}>
        {rows
          ? rows.map((email) => (
              <EmailRow
                key={email.id}
                email={email}
                selected={selected.has(email.id)}
                onSelect={handleSelect}
                onOpen={onOpen}
              />
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
