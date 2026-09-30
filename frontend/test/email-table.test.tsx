import type { EmailListItem, ListEmailsResponse } from "@scheduler/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { EmailTable } from "@/components/dashboard/email-table";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: { listEmails: vi.fn() },
  queryKeys: { emails: vi.fn((params: unknown) => ["emails", params]) },
}));

const page = (items: EmailListItem[]): ListEmailsResponse => ({
  items,
  page: 1,
  pageSize: 20,
  total: items.length,
});

const email = (overrides: Partial<EmailListItem> = {}): EmailListItem => ({
  id: "0b6f3a9e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
  recipient: "ada@acme.test",
  subject: "Quarterly update",
  preview: "Hello Ada",
  starred: false,
  sender: "s1@ethereal.email",
  status: "scheduled",
  archived: false,
  scheduledAt: "2026-10-01T09:00:00.000Z",
  sentAt: null,
  previewUrl: null,
  error: null,
  ...overrides,
});

function renderTable(tab: "scheduled" | "sent" = "scheduled") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <EmailTable
        tab={tab}
        page={1}
        onPageChange={() => {}}
        search=""
        emptyAction={<button>Compose Action</button>}
        onOpen={() => {}}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(api.listEmails).mockReset();
});

test("renders empty state for scheduled tab when there are no emails", async () => {
  vi.mocked(api.listEmails).mockResolvedValue(page([]));

  renderTable();

  expect(await screen.findByText("No scheduled emails")).toBeInTheDocument();
  expect(screen.getByText("Compose Action")).toBeInTheDocument();
});

test("shows the sent-tab empty state without a compose action", async () => {
  vi.mocked(api.listEmails).mockResolvedValue(page([]));

  renderTable("sent");

  expect(await screen.findByText("No sent emails yet")).toBeInTheDocument();
  expect(screen.queryByText("Compose Action")).not.toBeInTheDocument();
});

test("shows column-shaped skeleton rows while loading", () => {
  vi.mocked(api.listEmails).mockReturnValue(new Promise(() => {}));

  renderTable();

  expect(screen.getByText("Scheduled for")).toBeInTheDocument();
  expect(
    within(screen.getByRole("list")).getAllByRole("listitem"),
  ).toHaveLength(6);
});

test("lists scheduled emails with recipient, subject, status and scheduled time", async () => {
  vi.mocked(api.listEmails).mockResolvedValue(page([email()]));

  renderTable();

  const row = await screen.findByRole("listitem");
  expect(within(row).getByText("ada@acme.test")).toBeInTheDocument();
  expect(within(row).getByText(/Quarterly update/)).toBeInTheDocument();
  expect(within(row).getByText("Scheduled")).toBeInTheDocument();
  expect(row.querySelector("time")).toHaveAttribute(
    "datetime",
    "2026-10-01T09:00:00.000Z",
  );
});

test("labels the time column 'Sent at' and links sent emails to their preview", async () => {
  const sent = email({
    status: "sent",
    sentAt: "2026-10-01T09:00:05.000Z",
    previewUrl: "https://ethereal.email/message/abc",
  });
  vi.mocked(api.listEmails).mockResolvedValue(page([sent]));

  renderTable("sent");

  const row = await screen.findByRole("listitem");
  expect(screen.getByText("Sent at")).toBeInTheDocument();
  expect(row.querySelector("time")).toHaveAttribute(
    "datetime",
    "2026-10-01T09:00:05.000Z",
  );
  expect(within(row).getByRole("link", { name: "Preview" })).toHaveAttribute(
    "href",
    "https://ethereal.email/message/abc",
  );
});

test("shows an error with a retry that reloads the list", async () => {
  vi.mocked(api.listEmails)
    .mockRejectedValueOnce(new Error("Network down"))
    .mockResolvedValueOnce(page([email()]));

  renderTable();

  expect(await screen.findByRole("alert")).toHaveTextContent("Network down");
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("ada@acme.test")).toBeInTheDocument();
});
