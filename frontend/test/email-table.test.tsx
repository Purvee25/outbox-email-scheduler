import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { EmailTable } from "@/components/dashboard/email-table";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: {
    listEmails: vi.fn(),
  },
  queryKeys: {
    emails: vi.fn(() => ["emails"]),
  },
}));

test("renders empty state for scheduled tab when there are no emails", async () => {
  vi.mocked(api.listEmails).mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 20,
    total: 0,
  });

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <EmailTable
        tab="scheduled"
        page={1}
        onPageChange={() => {}}
        search=""
        emptyAction={<button>Compose Action</button>}
        onOpen={() => {}}
      />
    </QueryClientProvider>
  );

  // Should show the empty state title eventually
  expect(await screen.findByText("No scheduled emails")).toBeInTheDocument();
  expect(screen.getByText("Compose Action")).toBeInTheDocument();
});
