"use client";

import type { EmailStatus, EmailTab } from "@scheduler/shared";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useSession } from "@/hooks/use-session";
import { AnalyticsView } from "./analytics-view";
import { CampaignStats } from "./campaign-stats";
import { ComposeView } from "./compose-view";
import { EmailDetail } from "./email-detail";
import { EmailFilters } from "./email-filters";
import { EmailTable } from "./email-table";
import { Sidebar } from "./sidebar";

const SEARCH_DEBOUNCE_MS = 300;

const SLACK_RESULTS: Record<string, () => void> = {
  connected: () =>
    toast.success("Slack connected — rate-limit alerts will be posted there"),
  denied: () => toast.info("Slack connection cancelled"),
  error: () => toast.error("Couldn't connect Slack. Please try again."),
};

export function Dashboard() {
  const session = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<EmailTab>("scheduled");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<EmailStatus | undefined>();
  const [composing, setComposing] = useState(false);
  const [openEmailId, setOpenEmailId] = useState<string | null>(null);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);

  const slackResult = searchParams.get("slack");
  useEffect(() => {
    if (!slackResult) return;
    SLACK_RESULTS[slackResult]?.();
    router.replace("/dashboard");
  }, [slackResult, router]);

  if (!session.data) {
    return (
      <div className="flex min-h-screen">
        <div className="w-[240px] space-y-3 p-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
        <div className="flex-1 space-y-4 p-6">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-[420px] w-full" />
        </div>
      </div>
    );
  }

  if (composing) {
    return (
      <ComposeView
        user={session.data.user}
        onClose={() => setComposing(false)}
      />
    );
  }

  if (openEmailId) {
    return (
      <EmailDetail
        emailId={openEmailId}
        user={session.data.user}
        onBack={() => setOpenEmailId(null)}
      />
    );
  }

  const openCompose = () => setComposing(true);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar
        user={session.data.user}
        slackConnected={session.data.slackConnected}
        tab={tab}
        analyticsOpen={analyticsOpen}
        onTabChange={(next) => {
          setTab(next);
          setStatus(undefined);
          setPage(1);
          setAnalyticsOpen(false);
        }}
        onAnalytics={() => setAnalyticsOpen((o) => !o)}
        onCompose={openCompose}
      />
      {analyticsOpen ? (
        <AnalyticsView />
      ) : (
        <main className="animate-fade-up min-w-0 flex-1 px-4 py-4 md:pr-6">
          <CampaignStats />
          <EmailFilters
            tab={tab}
            search={search}
            onSearchChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            status={status}
            onStatusChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          />
          <div className="mt-4">
            <EmailTable
              tab={tab}
              page={page}
              onPageChange={setPage}
              search={debouncedSearch}
              status={status}
              onOpen={setOpenEmailId}
              emptyAction={
                <Button onClick={openCompose} id="compose-empty-btn">
                  Compose
                </Button>
              }
            />
          </div>
        </main>
      )}
    </div>
  );
}
