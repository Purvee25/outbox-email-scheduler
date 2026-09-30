import type { EmailStatus } from "@scheduler/shared";
import { cn } from "@/lib/cn";
import { formatBadgeTime } from "@/lib/format";

const STATUS_STYLES: Record<EmailStatus, { label: string; classes: string }> = {
  scheduled: {
    label: "Scheduled",
    classes: "border-warning-border bg-warning-bg text-warning-fg",
  },
  sending: {
    label: "Sending",
    classes: "border-warning-border bg-warning-bg text-warning-fg",
  },
  sent: {
    label: "Sent",
    classes: "border-border bg-neutral-bg text-neutral-fg",
  },
  failed: {
    label: "Failed",
    classes: "border-danger-fg/20 bg-danger-bg text-danger-fg",
  },
};

function ClockIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className="size-3.5"
      aria-hidden
    >
      <circle cx="10" cy="10" r="7.25" />
      <path
        d="M10 6v4.25l2.75 1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Scheduled emails show their send time in the pill (per the design); other states show the status. */
export function StatusBadge({
  status,
  scheduledAt,
  title,
}: {
  status: EmailStatus;
  scheduledAt?: string;
  title?: string;
}) {
  const { label, classes } = STATUS_STYLES[status];
  const showTime = status === "scheduled" && scheduledAt;
  const pending = status === "scheduled" || status === "sending";
  return (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border px-3 py-1 text-sm font-medium",
        classes,
        status === "sending" && "pulse-dot",
      )}
    >
      {pending && <ClockIcon />}
      {showTime ? formatBadgeTime(scheduledAt) : label}
    </span>
  );
}
