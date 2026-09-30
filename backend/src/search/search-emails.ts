import type { estypes } from "@elastic/elasticsearch";
import type { EmailStatus, ListEmailsResponse } from "@scheduler/shared";
import { EMAIL_INDEX, es, type EmailDocument } from "./client.js";

export interface SearchEmailsParams {
  userId: string;
  text: string;
  statuses: readonly EmailStatus[];
  sortField: "scheduledAt" | "updatedAt";
  sortOrder: "asc" | "desc";
  page: number;
  pageSize: number;
}

const SEARCH_FIELDS = [
  "recipient",
  "recipient._2gram",
  "recipient._3gram",
  "subject^2",
  "subject._2gram",
  "subject._3gram",
  "body",
];

/**
 * Full-text search over one user's emails. The userId filter is applied here, server side,
 * so a query can never return another user's documents.
 */
export async function searchEmails(
  params: SearchEmailsParams,
): Promise<ListEmailsResponse> {
  const response = await es.search<EmailDocument>({
    index: EMAIL_INDEX,
    from: (params.page - 1) * params.pageSize,
    size: params.pageSize,
    track_total_hits: true,
    query: {
      bool: {
        filter: [
          { term: { userId: params.userId } },
          { terms: { status: [...params.statuses] } },
        ],
        must: [
          {
            multi_match: {
              query: params.text,
              type: "bool_prefix",
              fields: SEARCH_FIELDS,
            },
          },
        ],
      },
    },
    sort: [
      { _score: { order: "desc" } },
      { [params.sortField]: { order: params.sortOrder } },
    ],
  });

  const total = response.hits.total as estypes.SearchTotalHits;
  return {
    items: response.hits.hits.flatMap((hit) => {
      const doc = hit._source;
      if (!doc) return [];
      return [
        {
          id: doc.id,
          recipient: doc.recipient,
          subject: doc.subject,
          sender: doc.sender,
          status: doc.status,
          scheduledAt: doc.scheduledAt,
          sentAt: doc.sentAt,
          previewUrl: doc.previewUrl,
          error: doc.error,
        },
      ];
    }),
    page: params.page,
    pageSize: params.pageSize,
    total: total.value,
  };
}
