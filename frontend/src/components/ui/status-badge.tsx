import type { EmailStatus } from "@scheduler/shared";
import { cn } from "@/lib/cn";

const STATUS_STYLES: Record<EmailStatus, { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "bg-info-50 text-info-700" },
  sending: { label: "Sending", className: "bg-warning-50 text-warning-700" },
  sent: { label: "Sent", className: "bg-success-50 text-success-700" },
  failed: { label: "Failed", className: "bg-danger-50 text-danger-700" },
};

export function StatusBadge({ status, title }: { status: EmailStatus; title?: string }) {
  const { label, className } = STATUS_STYLES[status];
  return (
    <span
      title={title}
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", className)}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
