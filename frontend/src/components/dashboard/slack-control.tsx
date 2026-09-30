"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, buttonClasses } from "@/components/ui/button";
import { api, queryKeys, slackConnectUrl } from "@/lib/api";

export function SlackControl({ connected }: { connected: boolean }) {
  const queryClient = useQueryClient();
  const disconnect = useMutation({
    mutationFn: api.disconnectSlack,
    onSuccess: () => {
      toast.success("Slack disconnected");
      return queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
    onError: (error) => toast.error(`Couldn't disconnect Slack: ${error.message}`),
  });
  const sendTest = useMutation({
    mutationFn: api.sendSlackTest,
    onSuccess: () => toast.success("Test message sent to Slack"),
    onError: (error) => toast.error(`Slack test failed: ${error.message}`),
  });

  if (!connected) {
    // Full-page navigation: the OAuth flow redirects through Slack and back.
    return (
      <a href={slackConnectUrl} className={buttonClasses("secondary", "sm")}>
        Connect Slack
      </a>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden items-center gap-1.5 text-sm text-success-700 md:inline-flex">
        <span aria-hidden className="size-2 rounded-full bg-current" />
        Slack connected
      </span>
      <Button variant="ghost" size="sm" loading={sendTest.isPending} onClick={() => sendTest.mutate()}>
        Send test
      </Button>
      <Button variant="ghost" size="sm" loading={disconnect.isPending} onClick={() => disconnect.mutate()}>
        Disconnect
      </Button>
    </div>
  );
}
