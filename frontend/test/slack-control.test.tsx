import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, expect, test, vi } from "vitest";
import { SlackControl } from "@/components/dashboard/slack-control";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: { sendSlackTest: vi.fn(), disconnectSlack: vi.fn() },
  queryKeys: { me: ["me"] },
  slackConnectUrl: "https://app.test/api/slack/connect",
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderControl(connected: boolean) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <SlackControl connected={connected} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

test("offers the real Slack OAuth flow when not connected", () => {
  renderControl(false);

  expect(screen.getByRole("link", { name: "Connect Slack" })).toHaveAttribute(
    "href",
    "https://app.test/api/slack/connect",
  );
  expect(screen.queryByText("Slack connected")).not.toBeInTheDocument();
});

test("sends a test message and confirms it", async () => {
  vi.mocked(api.sendSlackTest).mockResolvedValue(undefined);
  renderControl(true);

  await userEvent.click(screen.getByRole("button", { name: "Send test" }));

  expect(api.sendSlackTest).toHaveBeenCalled();
  await vi.waitFor(() =>
    expect(toast.success).toHaveBeenCalledWith("Test message sent to Slack"),
  );
});

test("surfaces a failed test message instead of failing silently", async () => {
  vi.mocked(api.sendSlackTest).mockRejectedValue(new Error("webhook revoked"));
  renderControl(true);

  await userEvent.click(screen.getByRole("button", { name: "Send test" }));

  await vi.waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith(
      "Slack test failed: webhook revoked",
    ),
  );
});

test("disconnects Slack", async () => {
  vi.mocked(api.disconnectSlack).mockResolvedValue(undefined);
  renderControl(true);

  await userEvent.click(screen.getByRole("button", { name: "Disconnect" }));

  expect(api.disconnectSlack).toHaveBeenCalled();
  await vi.waitFor(() =>
    expect(toast.success).toHaveBeenCalledWith("Slack disconnected"),
  );
});
