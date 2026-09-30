import type { ReactNode } from "react";
import { Button } from "./button";
import { Skeleton } from "./skeleton";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  empty: ReactNode;
  caption: string;
}

const SKELETON_ROWS = 5;

/** Table with built-in loading, error and empty states. */
export function DataTable<T>({ columns, rows, rowKey, loading, error, onRetry, empty, caption }: DataTableProps<T>) {
  if (error && !rows) {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="text-sm text-danger-700">Couldn&apos;t load emails: {error.message}</p>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }
  if (!loading && rows?.length === 0) return <>{empty}</>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-border bg-canvas text-xs font-medium uppercase tracking-wide text-ink-muted">
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className="px-6 py-3 font-medium">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {loading && !rows
            ? Array.from({ length: SKELETON_ROWS }, (_, index) => (
                <tr key={index}>
                  {columns.map((column) => (
                    <td key={column.key} className="px-6 py-4">
                      <Skeleton className="h-4 w-full max-w-48" />
                    </td>
                  ))}
                </tr>
              ))
            : rows?.map((row) => (
                <tr key={rowKey(row)} className="hover:bg-canvas/60">
                  {columns.map((column) => (
                    <td key={column.key} className={column.className ?? "px-6 py-4 text-ink"}>
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}
