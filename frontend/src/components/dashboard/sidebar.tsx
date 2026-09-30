"use client";

import { EMAIL_TABS, type EmailTab, type User } from "@scheduler/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { api, queryKeys } from "@/lib/api";
import { cn } from "@/lib/cn";
import { SlackControl } from "./slack-control";

const COUNT_POLL_MS = 5_000;

const TAB_LABELS: Record<EmailTab, string> = {
  scheduled: "Scheduled",
  sent: "Sent",
  archived: "Archived",
};

const TAB_ICONS: Record<EmailTab, ReactNode> = {
  scheduled: (
    <>
      <circle cx="10" cy="10" r="7.25" />
      <path d="M10 6v4.25l2.75 1.75" />
    </>
  ),
  sent: (
    <path d="M17.5 2.5 8.75 11.25M17.5 2.5l-5.5 15-3.25-6.25L2.5 8l15-5.5Z" />
  ),
  archived: (
    <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4.5M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
  ),
};

function useTabCount(tab: EmailTab) {
  const params = { tab, page: 1, pageSize: 1 };
  return useQuery({
    queryKey: queryKeys.emails(params),
    queryFn: () => api.listEmails(params),
    refetchInterval: COUNT_POLL_MS,
    select: (data) => data.total,
  });
}

function NavItem({
  tab,
  active,
  onSelect,
}: {
  tab: EmailTab;
  active: boolean;
  onSelect: () => void;
}) {
  const count = useTabCount(tab);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-11 w-full items-center gap-3 rounded-control px-3 text-left text-[15px] transition-colors",
        active
          ? "bg-mint font-semibold text-ink"
          : "text-ink-muted hover:bg-field",
      )}
    >
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-5 shrink-0"
        aria-hidden
      >
        {TAB_ICONS[tab]}
      </svg>
      <span className="flex-1">{TAB_LABELS[tab]}</span>
      <span className="text-sm font-normal text-ink-muted">
        {count.data ?? ""}
      </span>
    </button>
  );
}

interface SidebarProps {
  user: User;
  slackConnected: boolean;
  tab: EmailTab;
  onTabChange: (tab: EmailTab) => void;
  onCompose: () => void;
}

export function Sidebar({
  user,
  slackConnected,
  tab,
  onTabChange,
  onCompose,
}: SidebarProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      queryClient.clear();
      router.replace("/login");
    },
    onError: (error) => toast.error(`Logout failed: ${error.message}`),
  });

  return (
    <aside className="flex w-full shrink-0 flex-col gap-3 p-3 md:sticky md:top-0 md:h-screen md:w-[240px]">
      <p
        aria-label="ONB"
        className="px-3 pt-2 pb-1 font-mono text-4xl font-black tracking-tighter"
      >
        ONB
      </p>

      <details className="group rounded-card bg-field">
        <summary className="flex cursor-pointer list-none items-center gap-3 p-3 [&::-webkit-details-marker]:hidden">
          <Avatar name={user.name} src={user.avatarUrl} />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[15px] font-medium">{user.name}</p>
            <p className="truncate text-xs text-ink-muted">{user.email}</p>
          </div>
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180"
            aria-hidden
          >
            <path
              d="m5 7.5 5 5 5-5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </summary>
        <div className="flex flex-col gap-2 border-t border-border p-3">
          <SlackControl connected={slackConnected} />
          <Button
            variant="ghost"
            size="sm"
            id="logout-btn"
            loading={logout.isPending}
            onClick={() => logout.mutate()}
            className="justify-start"
          >
            Log out
          </Button>
        </div>
      </details>

      <Button
        id="compose-btn"
        title="Compose New Email"
        variant="secondary"
        size="lg"
        onClick={onCompose}
      >
        Compose
      </Button>

      <nav aria-label="Email lists" className="mt-3 flex flex-col gap-1">
        <p className="px-3 pb-1 text-xs tracking-wide text-ink-muted uppercase">
          Core
        </p>
        {EMAIL_TABS.map((value) => (
          <NavItem
            key={value}
            tab={value}
            active={value === tab}
            onSelect={() => onTabChange(value)}
          />
        ))}
      </nav>
    </aside>
  );
}
