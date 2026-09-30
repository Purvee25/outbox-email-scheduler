"use client";

import { EMAIL_TABS, type EmailTab } from "@scheduler/shared";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { useSession } from "@/hooks/use-session";
import { ComposeModal } from "./compose-modal";
import { EmailTable } from "./email-table";
import { Header } from "./header";

const TAB_LABELS: Record<EmailTab, string> = { scheduled: "Scheduled Emails", sent: "Sent Emails" };
const TABS = EMAIL_TABS.map((value) => ({ value, label: TAB_LABELS[value] }));

/** Messages for the ?slack= result the API redirects back with after the Slack OAuth flow. */
const SLACK_RESULTS: Record<string, () => void> = {
  connected: () => toast.success("Slack connected — rate-limit alerts will be posted there"),
  denied: () => toast.info("Slack connection cancelled"),
  error: () => toast.error("Couldn't connect Slack. Please try again."),
};

export function Dashboard() {
  const session = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<EmailTab>("scheduled");
  const [page, setPage] = useState(1);
  const [composeOpen, setComposeOpen] = useState(false);

  const slackResult = searchParams.get("slack");
  useEffect(() => {
    if (!slackResult) return;
    SLACK_RESULTS[slackResult]?.();
    router.replace("/dashboard");
  }, [slackResult, router]);

  if (!session.data) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6" aria-busy>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const openCompose = () => setComposeOpen(true);

  return (
    <>
      <Header user={session.data.user} slackConnected={session.data.slackConnected} />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Emails</h1>
            <p className="mt-1 text-sm text-ink-muted">Scheduled sends update automatically as they go out.</p>
          </div>
          <Button onClick={openCompose}>Compose New Email</Button>
        </div>

        <section className="overflow-hidden rounded-card border border-border bg-surface">
          <div className="border-b border-border px-6 pt-4">
            <Tabs
              label="Email lists"
              tabs={TABS}
              value={tab}
              onChange={(next) => {
                setTab(next);
                setPage(1);
              }}
            />
          </div>
          <div role="tabpanel">
            <EmailTable
              tab={tab}
              page={page}
              onPageChange={setPage}
              emptyAction={<Button onClick={openCompose}>Compose New Email</Button>}
            />
          </div>
        </section>
      </main>
      <ComposeModal open={composeOpen} onClose={() => setComposeOpen(false)} />
    </>
  );
}
