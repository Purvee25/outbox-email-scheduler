import {
  createCampaignResponseSchema,
  attachmentSchema,
  emailDetailSchema,
  listEmailsResponseSchema,
  meResponseSchema,
  type CreateCampaignInput,
  type EmailStatus,
  type EmailTab,
} from "@scheduler/shared";
import type { z } from "zod";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Full-page navigations (OAuth redirects) rather than fetches. */
export const googleLoginUrl = `${API_URL}/auth/google`;
export const attachmentUrl = (id: string) => `${API_URL}/api/attachments/${id}`;
export const slackConnectUrl = `${API_URL}/api/slack/connect`;

export interface ListEmailsParams {
  tab: EmailTab;
  page: number;
  pageSize: number;
  /** Free-text search, served by Elasticsearch. */
  q?: string;
  status?: EmailStatus;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { ...(typeof init.body === "string" ? { "content-type": "application/json" } : {}), ...init.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(response.status, body?.error ?? `Request failed (${response.status})`);
  }
  return response;
}

/** Fetches JSON and validates it at runtime against the shared schema. */
async function requestJson<T extends z.ZodType>(path: string, schema: T, init?: RequestInit): Promise<z.infer<T>> {
  const response = await request(path, init);
  return schema.parse(await response.json());
}

export const api = {
  me: () => requestJson("/api/me", meResponseSchema),

  listEmails: ({ tab, page, pageSize, q, status }: ListEmailsParams) => {
    const params = new URLSearchParams({ tab, page: String(page), pageSize: String(pageSize) });
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    return requestJson(`/api/emails?${params}`, listEmailsResponseSchema);
  },

  getEmail: (id: string) => requestJson(`/api/emails/${id}`, emailDetailSchema),

  uploadAttachment: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return requestJson("/api/attachments", attachmentSchema, { method: "POST", body: form });
  },

  deleteAttachment: async (id: string) => {
    await request(`/api/attachments/${id}`, { method: "DELETE" });
  },

  createCampaign: (input: CreateCampaignInput) =>
    requestJson("/api/campaigns", createCampaignResponseSchema, { method: "POST", body: JSON.stringify(input) }),

  logout: async () => {
    await request("/auth/logout", { method: "POST" });
  },

  disconnectSlack: async () => {
    await request("/api/slack", { method: "DELETE" });
  },

  sendSlackTest: async () => {
    await request("/api/slack/test", { method: "POST" });
  },

  setStarred: async (id: string, starred: boolean) => {
    await request(`/api/emails/${id}/star`, { method: "PUT", body: JSON.stringify({ starred }) });
  },

  setArchived: async (id: string, archived: boolean) => {
    await request(`/api/emails/${id}/archive`, { method: "PUT", body: JSON.stringify({ archived }) });
  },

  deleteEmail: async (id: string) => {
    await request(`/api/emails/${id}`, { method: "DELETE" });
  },
};

export const queryKeys = {
  me: ["me"] as const,
  emails: (params: ListEmailsParams) => ["emails", params] as const,
  allEmails: ["emails"] as const,
  email: (id: string) => ["emails", "detail", id] as const,
};
