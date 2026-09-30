"use client";

import type { User } from "@scheduler/shared";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AttachmentCard } from "@/components/ui/attachment-card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { api, attachmentUrl, queryKeys } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

/** Read-only view of one email. The body HTML is sanitised server-side. */
export function EmailDetail({
  emailId,
  user,
  onBack,
}: {
  emailId: string;
  user: User;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.email(emailId),
    queryFn: () => api.getEmail(emailId),
  });
  const email = query.data;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.email(emailId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.allEmails });
  };

  const toggleStar = useMutation({
    mutationFn: (starred: boolean) => api.setStarred(emailId, starred),
    onSuccess: refresh,
    onError: (error) => toast.error(`Couldn't update star: ${error.message}`),
  });

  const toggleArchive = useMutation({
    mutationFn: (archived: boolean) => api.setArchived(emailId, archived),
    onSuccess: (_, archived) => {
      refresh();
      toast.success(archived ? "Moved to Archived" : "Moved out of Archived");
    },
    onError: (error) => toast.error(`Couldn't archive: ${error.message}`),
  });

  const retryMutation = useMutation({
    mutationFn: () => api.retryEmail(emailId),
    onSuccess: () => {
      refresh();
      toast.success("Email re-queued — it will send shortly");
    },
    onError: (error) => toast.error(`Couldn't retry: ${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteEmail(emailId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.allEmails });
      toast.success("Email deleted");
      onBack();
    },
    onError: (error) => toast.error(`Couldn't delete: ${error.message}`),
  });

  function confirmDelete() {
    const warning =
      email?.status === "scheduled"
        ? "Delete this email? It is still scheduled and will not be sent."
        : "Delete this email permanently?";
    if (window.confirm(warning)) deleteMutation.mutate();
  }

  return (
    <div className="animate-fade-up mx-auto flex min-h-screen max-w-[1100px] flex-col px-6 pb-10">
      <header className="flex h-24 items-center gap-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="flex size-10 items-center justify-center rounded-full hover:bg-field"
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-6"
            aria-hidden
          >
            <path d="M16 10H4m5.5-5.5L4 10l5.5 5.5" />
          </svg>
        </button>
        <h1 className="min-w-0 flex-1 truncate text-3xl font-normal tracking-tight">
          {email?.subject ?? " "}
        </h1>
        {email && (
          <div className="flex items-center gap-2">
            {email.status === "failed" && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => retryMutation.mutate()}
                loading={retryMutation.isPending}
              >
                Retry
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleStar.mutate(!email.starred)}
              loading={toggleStar.isPending}
            >
              {email.starred ? "Unstar" : "Star"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleArchive.mutate(!email.archived)}
              loading={toggleArchive.isPending}
            >
              {email.archived ? "Unarchive" : "Archive"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-danger-fg hover:bg-danger-bg hover:text-danger-fg"
              onClick={confirmDelete}
              loading={deleteMutation.isPending}
            >
              Delete
            </Button>
          </div>
        )}
        <Avatar name={user.name} src={user.avatarUrl} />
      </header>

      {query.error && (
        <div role="alert" className="flex flex-col items-start gap-3 px-2">
          <p className="text-sm text-danger-fg">
            Couldn&apos;t load this email: {query.error.message}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void query.refetch()}
          >
            Try again
          </Button>
        </div>
      )}

      {!email && !query.error && (
        <div className="space-y-4 px-2">
          <Skeleton className="h-12 w-72" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {email && (
        <article className="px-2">
          <div className="flex items-start gap-4">
            <span
              aria-hidden
              className="flex size-14 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xl font-medium text-white"
            >
              {email.sender[0]?.toUpperCase()}
            </span>
            <div className="min-w-0 flex-1 leading-snug">
              <p className="truncate text-lg font-semibold">{email.sender}</p>
              <p className="truncate text-sm text-ink-muted">
                To: {email.recipient}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2 text-sm text-ink-muted">
              <StatusBadge
                status={email.status}
                scheduledAt={email.scheduledAt}
                title={email.error ?? undefined}
              />
              <time dateTime={email.sentAt ?? email.scheduledAt}>
                {formatDateTime(email.sentAt ?? email.scheduledAt)}
              </time>
            </div>
          </div>

          {email.error && (
            <p
              role="alert"
              className="mt-6 rounded-control bg-danger-bg px-4 py-3 text-sm text-danger-fg"
            >
              {email.error}
            </p>
          )}

          {/* Sanitised by the API on write and again on read. */}
          <div
            className="rich-text mt-8 text-[15px] leading-relaxed"
            dangerouslySetInnerHTML={{ __html: email.body }}
          />

          {email.attachments.length > 0 && (
            <ul aria-label="Attachments" className="mt-8 flex flex-wrap gap-4">
              {email.attachments.map((attachment) => (
                <AttachmentCard
                  key={attachment.id}
                  attachment={attachment}
                  href={attachmentUrl(attachment.id)}
                  thumbnail={
                    attachment.contentType.startsWith("image/")
                      ? attachmentUrl(attachment.id)
                      : undefined
                  }
                />
              ))}
            </ul>
          )}

          {email.previewUrl && (
            <a
              href={email.previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 inline-block text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              Open Ethereal preview
            </a>
          )}
        </article>
      )}
    </div>
  );
}
