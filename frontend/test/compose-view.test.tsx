import type { User } from "@scheduler/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { ComposeView } from "@/components/dashboard/compose-view";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: {
    createCampaign: vi.fn(),
    uploadAttachment: vi.fn(),
    deleteAttachment: vi.fn(),
  },
  queryKeys: { allEmails: ["emails"] },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Tiptap needs layout APIs jsdom lacks; the form only depends on the editor's onChange contract.
vi.mock("@/components/ui/rich-text-editor", () => ({
  RichTextEditor: ({
    label,
    onChange,
  }: {
    label: string;
    onChange: (html: string) => void;
  }) => (
    <textarea
      aria-label={label}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

const USER: User = {
  id: "7d1e2f3a-4b5c-4d6e-8f70-81920a1b2c3d",
  email: "purvee@example.com",
  name: "Purvee Singh",
  avatarUrl: null,
};

function renderCompose(onClose = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ComposeView user={USER} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose };
}

beforeEach(() => {
  vi.mocked(api.createCampaign).mockReset();
});

test("shows field errors and does not call the API when the form is empty", async () => {
  renderCompose();

  await userEvent.click(screen.getByRole("button", { name: "Send" }));

  expect(screen.getByText("Subject is required")).toBeInTheDocument();
  expect(screen.getByText("Add at least one recipient")).toBeInTheDocument();
  expect(screen.getByText("Body is required")).toBeInTheDocument();
  expect(api.createCampaign).not.toHaveBeenCalled();
});

test("rejects a typed recipient that is not an email address", async () => {
  renderCompose();

  await userEvent.type(screen.getByLabelText("To"), "not-an-email{Enter}");

  expect(
    screen.getByText('"not-an-email" is not a valid email address'),
  ).toBeInTheDocument();
});

test("reports how many leads a CSV contained, after removing duplicates and invalid rows", async () => {
  renderCompose();
  const file = new File(
    ["email\nada@acme.test\nADA@acme.test\nlin@acme.test\nbroken@\n"],
    "leads.csv",
    { type: "text/csv" },
  );

  await userEvent.upload(screen.getByLabelText("Upload leads file"), file);

  expect(
    await screen.findByText(
      "2 from leads.csv · 1 duplicates removed · 1 invalid skipped",
    ),
  ).toBeInTheDocument();
  expect(screen.getByText("ada@acme.test")).toBeInTheDocument();
  expect(screen.getByText("lin@acme.test")).toBeInTheDocument();
});

test("schedules a valid campaign with the delay in milliseconds and closes", async () => {
  vi.mocked(api.createCampaign).mockResolvedValue({
    campaignId: "5a4b3c2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d",
    scheduledCount: 1,
    duplicatesRemoved: 0,
    firstSendAt: "2026-10-01T09:00:00.000Z",
    lastSendAt: "2026-10-01T09:00:00.000Z",
    effectiveHourlyLimit: 5,
  });
  const { onClose } = renderCompose();

  await userEvent.type(screen.getByLabelText("To"), "ada@acme.test{Enter}");
  await userEvent.type(screen.getByLabelText("Subject"), "Quarterly update");
  await userEvent.type(screen.getByLabelText("Body"), "Hello Ada");
  await userEvent.clear(screen.getByLabelText("Delay (s)"));
  await userEvent.type(screen.getByLabelText("Delay (s)"), "3");
  await userEvent.clear(screen.getByLabelText("Hourly limit"));
  await userEvent.type(screen.getByLabelText("Hourly limit"), "5");
  await userEvent.click(screen.getByRole("button", { name: "Send" }));

  expect(api.createCampaign).toHaveBeenCalledWith(
    expect.objectContaining({
      recipients: ["ada@acme.test"],
      subject: "Quarterly update",
      body: "Hello Ada",
      delayMs: 3000,
      hourlyLimit: 5,
    }),
  );
  await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
});
