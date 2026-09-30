"use client";

import type { User } from "@scheduler/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { SlackControl } from "./slack-control";

export function Header({ user, slackConnected }: { user: User; slackConnected: boolean }) {
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
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <span aria-hidden className="flex size-8 items-center justify-center rounded-control bg-brand-600 text-sm font-bold text-white">
            R
          </span>
          <span className="text-base font-semibold">ReachInbox Scheduler</span>
        </div>
        <div className="flex items-center gap-3">
          <SlackControl connected={slackConnected} />
          <div className="flex items-center gap-3 border-l border-border pl-3">
            <Avatar name={user.name} src={user.avatarUrl} />
            <div className="hidden text-sm leading-tight sm:block">
              <p className="font-medium text-ink">{user.name}</p>
              <p className="text-ink-muted">{user.email}</p>
            </div>
            <Button variant="ghost" size="sm" loading={logout.isPending} onClick={() => logout.mutate()}>
              Log out
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
