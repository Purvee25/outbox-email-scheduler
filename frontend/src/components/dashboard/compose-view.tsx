"use client";

import {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENTS_PER_CAMPAIGN,
  MAX_ATTACHMENT_BYTES,
  createCampaignSchema,
  type Attachment,
  type CreateCampaignInput,
  type User,
} from "@scheduler/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { toast } from "sonner";
import { z } from "zod";
import { AttachmentCard } from "@/components/ui/attachment-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { api, queryKeys } from "@/lib/api";
import { formatDateTime, toDateTimeLocalValue, tomorrowAt } from "@/lib/format";
import { parseLeadsFile } from "@/lib/leads";

const DEFAULT_DELAY_SECONDS = 2;
const DEFAULT_HOURLY_LIMIT = 200;
const VISIBLE_CHIPS = 3;
const QUICK_TIMES = [
  { label: "Tomorrow", hour: 9 },
  { label: "Tomorrow, 10:00 AM", hour: 10 },
  { label: "Tomorrow, 11:00 AM", hour: 11 },
  { label: "Tomorrow, 3:00 PM", hour: 15 },
];

type SendUnit = "seconds" | "minutes" | "hours";

function offsetNow(amount: number, unit: SendUnit): string {
  const ms =
    unit === "seconds"
      ? amount * 1_000
      : unit === "minutes"
        ? amount * 60_000
        : amount * 3_600_000;
  return toDateTimeLocalValue(new Date(Date.now() + ms));
}

const UNIT_LABELS: Record<SendUnit, string> = {
  seconds: "Seconds",
  minutes: "Minutes",
  hours: "Hours",
};

const UNIT_MAX: Record<SendUnit, number> = {
  seconds: 3600,
  minutes: 1440,
  hours: 720,
};

type FieldName =
  "subject" | "body" | "recipients" | "startAt" | "delayMs" | "hourlyLimit";
type FieldErrors = Partial<Record<FieldName, string>>;

const emailSchema = z.email();

const LABEL = "w-28 shrink-0 text-[15px]";
const ROW = "flex items-center gap-4";
const UNDERLINE_INPUT =
  "h-11 flex-1 border-0 border-b border-border-strong bg-transparent px-1 text-[15px] placeholder:text-ink-muted focus:outline-none focus:border-brand-500";

function SendLater({
  value,
  onApply,
  onClose,
}: {
  value: string;
  onApply: (value: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <div className="absolute top-full right-0 z-30 mt-2 w-[22rem] rounded-card border border-border bg-white p-5 shadow-xl">
      <h2 className="mb-4 text-base font-semibold">Send Later</h2>
      <input
        type="datetime-local"
        aria-label="Pick date & time"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="h-11 w-full border-0 border-b border-border-strong bg-transparent text-[15px] focus:border-brand-500 focus:outline-none"
      />
      <ul className="mt-4">
        {QUICK_TIMES.map(({ label, hour }) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => setDraft(tomorrowAt(hour))}
              className="w-full rounded-lg px-2 py-2.5 text-left text-[15px] text-ink-muted hover:bg-field"
            >
              {label}
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="secondary"
          disabled={!draft}
          onClick={() => onApply(draft)}
        >
          Done
        </Button>
      </div>
    </div>
  );
}

export function ComposeView({
  user,
  onClose,
}: {
  user: User;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const attachmentInput = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<
    { attachment: Attachment; thumbnail?: string }[]
  >([]);
  const [uploading, setUploading] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [delaySeconds, setDelaySeconds] = useState(
    String(DEFAULT_DELAY_SECONDS),
  );
  const [hourlyLimit, setHourlyLimit] = useState(String(DEFAULT_HOURLY_LIMIT));
  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientDraft, setRecipientDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [scheduledAt, setScheduledAt] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sendAmount, setSendAmount] = useState(30);
  const [sendUnit, setSendUnit] = useState<SendUnit>("minutes");
  const [sendMode, setSendMode] = useState<"offset" | "custom" | null>(null);
  const [parsing, setParsing] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const schedule = useMutation({
    mutationFn: (input: CreateCampaignInput) => api.createCampaign(input),
    onSuccess: (result) => {
      toast.success(`Scheduled ${result.scheduledCount} emails`, {
        description: `First send ${formatDateTime(result.firstSendAt)} · last ${formatDateTime(result.lastSendAt)}`,
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.allEmails });
      onClose();
    },
    onError: (error) => toast.error(`Couldn't schedule: ${error.message}`),
  });

  async function handleAttachments(event: ChangeEvent<HTMLInputElement>) {
    const picked = [...(event.target.files ?? [])];
    event.target.value = "";
    if (picked.length === 0) return;
    setUploading(true);
    for (const file of picked) {
      if (files.length >= MAX_ATTACHMENTS_PER_CAMPAIGN) {
        toast.error(`At most ${MAX_ATTACHMENTS_PER_CAMPAIGN} attachments`);
        break;
      }
      if (
        !(ALLOWED_ATTACHMENT_TYPES as readonly string[]).includes(file.type)
      ) {
        toast.error(
          `${file.name}: only images, PDF, text and CSV files can be attached`,
        );
        continue;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast.error(`${file.name} is larger than 5 MB`);
        continue;
      }
      try {
        const attachment = await api.uploadAttachment(file);
        const thumbnail = file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : undefined;
        setFiles((current) => [...current, { attachment, thumbnail }]);
      } catch (error) {
        toast.error(
          `${file.name}: ${error instanceof Error ? error.message : "upload failed"}`,
        );
      }
    }
    setUploading(false);
  }

  function removeAttachment(id: string) {
    const removed = files.find((file) => file.attachment.id === id);
    setFiles((current) => current.filter((file) => file.attachment.id !== id));
    if (removed?.thumbnail) URL.revokeObjectURL(removed.thumbnail);
    void api.deleteAttachment(id).catch(() => undefined);
  }

  const addRecipients = (incoming: string[]) =>
    setRecipients((current) => [...new Set([...current, ...incoming])]);

  function commitDraft() {
    const value = recipientDraft.trim().replace(/,$/, "");
    if (!value) return;
    if (!emailSchema.safeParse(value).success) {
      setErrors((current) => ({
        ...current,
        recipients: `"${value}" is not a valid email address`,
      }));
      return;
    }
    addRecipients([value]);
    setRecipientDraft("");
    setErrors((current) => ({ ...current, recipients: undefined }));
  }

  function handleDraftKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitDraft();
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setParsing(true);
    try {
      const parsed = await parseLeadsFile(file);
      addRecipients(parsed.emails);
      setNotice(
        `${parsed.emails.length} from ${file.name}` +
          (parsed.duplicates
            ? ` · ${parsed.duplicates} duplicates removed`
            : "") +
          (parsed.invalid ? ` · ${parsed.invalid} invalid skipped` : ""),
      );
      setErrors((current) => ({
        ...current,
        recipients:
          parsed.emails.length === 0
            ? "No email addresses found in this file"
            : undefined,
      }));
    } catch (error) {
      setErrors((current) => ({
        ...current,
        recipients:
          error instanceof Error ? error.message : "Couldn't read file",
      }));
    } finally {
      setParsing(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = createCampaignSchema.safeParse({
      subject,
      body,
      recipients,
      startAt: (scheduledAt ? new Date(scheduledAt) : new Date()).toISOString(),
      delayMs: Math.round(Number(delaySeconds) * 1000),
      hourlyLimit: Number(hourlyLimit),
      attachmentIds: files.map((file) => file.attachment.id),
    });
    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const name = issue.path[0] as FieldName;
        fieldErrors[name] ??= issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    schedule.mutate(parsed.data);
  }

  const hidden = recipients.length - VISIBLE_CHIPS;

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="animate-fade-up mx-auto flex min-h-screen max-w-[1100px] flex-col px-6 pb-10"
    >
      <header className="flex h-24 items-center gap-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back"
          className="flex size-10 items-center justify-center rounded-full hover:bg-field"
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-6"
            aria-hidden
          >
            <path d="M16 10H4m5.5-5.5L4 10l5.5 5.5" />
          </svg>
        </button>
        <h1 className="flex-1 text-3xl font-normal tracking-tight">
          Compose New Email
        </h1>

        <button
          type="button"
          aria-label="Attach files"
          disabled={uploading}
          onClick={() => attachmentInput.current?.click()}
          className="relative flex size-10 items-center justify-center rounded-full text-brand-600 hover:bg-mint disabled:opacity-50"
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-6"
            aria-hidden
          >
            <path d="m16 9.5-6.2 6.2a4 4 0 0 1-5.6-5.6l6.5-6.5a2.7 2.7 0 0 1 3.8 3.8l-6.5 6.5a1.3 1.3 0 0 1-1.9-1.9l5.9-5.9" />
          </svg>
          {files.length > 0 && (
            <span className="absolute right-0 bottom-0 flex size-4 items-center justify-center rounded-full bg-field text-[10px] text-ink">
              {files.length}
            </span>
          )}
        </button>
        <input
          ref={attachmentInput}
          type="file"
          multiple
          accept={ALLOWED_ATTACHMENT_TYPES.join(",")}
          onChange={handleAttachments}
          className="sr-only"
          tabIndex={-1}
          aria-label="Attach files"
        />

        <div className="relative">
          <button
            type="button"
            aria-label="Send later"
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((open) => !open)}
            className="flex size-10 items-center justify-center rounded-full text-brand-600 hover:bg-mint"
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-6"
              aria-hidden
            >
              <circle cx="10" cy="10" r="7.25" />
              <path d="M10 6v4.25l2.75 1.75" />
            </svg>
          </button>
          {pickerOpen && (
            <SendLater
              value={scheduledAt}
              onApply={(value) => {
                setScheduledAt(value);
                setPickerOpen(false);
              }}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </div>
        <Button
          type="submit"
          variant="secondary"
          size="lg"
          loading={schedule.isPending}
          disabled={parsing || uploading}
        >
          {scheduledAt ? "Send Later" : "Send"}
        </Button>
      </header>

      <div className="flex flex-col gap-5 px-2">
        {scheduledAt && (
          <p className="text-sm text-ink-muted">
            Scheduled for {formatDateTime(new Date(scheduledAt).toISOString())}{" "}
            <button
              type="button"
              onClick={() => setScheduledAt("")}
              className="text-brand-600 hover:underline"
            >
              Clear
            </button>
          </p>
        )}

        <div className={ROW}>
          <span className={LABEL}>From</span>
          <span className="rounded-control bg-field px-4 py-2.5 text-[15px]">
            {user.email}
          </span>
        </div>

        <div>
          <div className={ROW}>
            <label htmlFor="to" className={LABEL}>
              To
            </label>
            <div className="flex min-h-11 flex-1 flex-wrap items-center gap-2 border-b border-border-strong focus-within:border-brand-500">
              {recipients.slice(0, VISIBLE_CHIPS).map((email) => (
                <span
                  key={email}
                  className="rounded-pill border border-brand-600 bg-mint px-3 py-1 text-sm"
                >
                  {email}
                </span>
              ))}
              {hidden > 0 && (
                <span className="rounded-pill border border-brand-600 bg-mint px-3 py-1 text-sm">
                  +{hidden}
                </span>
              )}
              <input
                id="to"
                type="text"
                value={recipientDraft}
                onChange={(event) => setRecipientDraft(event.target.value)}
                onKeyDown={handleDraftKey}
                onBlur={commitDraft}
                placeholder={recipients.length ? "" : "recipient@example.com"}
                aria-invalid={errors.recipients ? true : undefined}
                className="min-w-40 flex-1 bg-transparent px-1 py-2 text-[15px] placeholder:text-ink-muted focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex items-center gap-2 text-[15px] font-medium text-brand-600 hover:text-brand-700"
            >
              <svg
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-5"
                aria-hidden
              >
                <path d="M10 13V3m0 0L6 7m4-4 4 4M3.5 13v3.5h13V13" />
              </svg>
              {parsing ? "Reading…" : "Upload List"}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              onChange={handleFile}
              className="sr-only"
              tabIndex={-1}
              aria-label="Upload leads file"
            />
          </div>
          {(errors.recipients || notice) && (
            <p
              role={errors.recipients ? "alert" : undefined}
              className={`mt-1 pl-32 text-xs ${errors.recipients ? "text-danger-fg" : "text-ink-muted"}`}
            >
              {errors.recipients ?? notice}
            </p>
          )}
        </div>

        <div>
          <div className={ROW}>
            <label htmlFor="subject" className={LABEL}>
              Subject
            </label>
            <input
              id="subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Subject"
              maxLength={998}
              aria-invalid={errors.subject ? true : undefined}
              className={UNDERLINE_INPUT}
            />
          </div>
          {errors.subject && (
            <p role="alert" className="mt-1 pl-32 text-xs text-danger-fg">
              {errors.subject}
            </p>
          )}
        </div>

        <div>
          <div className={ROW}>
            <span className={LABEL}>Send in</span>
            <div className="flex flex-1 items-center gap-3">
              {/* − number + stepper */}
              <div className="flex items-center rounded-control border border-border bg-white overflow-hidden">
                <button
                  type="button"
                  aria-label="Decrease"
                  onClick={() => {
                    const next = Math.max(1, sendAmount - 1);
                    setSendAmount(next);
                    if (sendMode === "offset")
                      setScheduledAt(offsetNow(next, sendUnit));
                  }}
                  className="flex h-10 w-10 items-center justify-center text-xl font-light text-ink-muted hover:bg-field hover:text-ink active:bg-mint"
                >
                  −
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  value={sendAmount}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      const next = Math.min(sendAmount + 1, UNIT_MAX[sendUnit]);
                      setSendAmount(next);
                      if (sendMode === "offset")
                        setScheduledAt(offsetNow(next, sendUnit));
                    } else if (e.key === "ArrowDown") {
                      e.preventDefault();
                      const next = Math.max(1, sendAmount - 1);
                      setSendAmount(next);
                      if (sendMode === "offset")
                        setScheduledAt(offsetNow(next, sendUnit));
                    }
                  }}
                  onChange={(e) => {
                    const v = Math.max(
                      1,
                      Math.min(Number(e.target.value) || 1, UNIT_MAX[sendUnit]),
                    );
                    setSendAmount(v);
                    if (sendMode === "offset")
                      setScheduledAt(offsetNow(v, sendUnit));
                  }}
                  onWheel={(e) => {
                    e.preventDefault();
                    const delta = e.deltaY < 0 ? 1 : -1;
                    const next = Math.max(
                      1,
                      Math.min(sendAmount + delta, UNIT_MAX[sendUnit]),
                    );
                    setSendAmount(next);
                    if (sendMode === "offset")
                      setScheduledAt(offsetNow(next, sendUnit));
                  }}
                  className="h-10 w-14 border-x border-border bg-white text-center text-[15px] font-semibold tabular-nums focus:outline-none focus:ring-0"
                />
                <button
                  type="button"
                  aria-label="Increase"
                  onClick={() => {
                    const next = Math.min(sendAmount + 1, UNIT_MAX[sendUnit]);
                    setSendAmount(next);
                    if (sendMode === "offset")
                      setScheduledAt(offsetNow(next, sendUnit));
                  }}
                  className="flex h-10 w-10 items-center justify-center text-xl font-light text-ink-muted hover:bg-field hover:text-ink active:bg-mint"
                >
                  +
                </button>
              </div>
              {/* Segmented unit control */}
              {(["seconds", "minutes", "hours"] as SendUnit[]).map((u, i) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => {
                    setSendUnit(u);
                    setSendMode("offset");
                    setScheduledAt(offsetNow(sendAmount, u));
                  }}
                  className={`h-10 border border-l-0 px-4 text-[13px] font-medium transition-colors
                    ${i === 2 ? "rounded-r-control" : ""}
                    ${
                      sendMode === "offset" && sendUnit === u
                        ? "border-brand-600 bg-mint text-brand-600 z-10"
                        : "border-border bg-white text-ink-muted hover:bg-field"
                    }`}
                >
                  {UNIT_LABELS[u]}
                </button>
              ))}

              {/* Divider */}
              <span className="mx-4 text-[13px] text-ink-muted">or</span>

              {/* Custom date+time — single pill */}
              <label
                className={`flex h-10 cursor-pointer items-center gap-2 rounded-control border px-4 text-[13px] font-medium transition-colors ${
                  sendMode === "custom"
                    ? "border-brand-600 bg-mint text-brand-600"
                    : "border-border text-ink-muted hover:bg-field"
                }`}
              >
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-4 shrink-0"
                  aria-hidden
                >
                  <rect x="2.5" y="3.5" width="15" height="14" rx="2" />
                  <path d="M2.5 8h15M7 1.5v4M13 1.5v4" />
                </svg>
                {sendMode === "custom" && scheduledAt
                  ? new Date(scheduledAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : "Pick date & time"}
                <input
                  id="send-at-custom"
                  type="datetime-local"
                  value={sendMode === "custom" ? scheduledAt : ""}
                  onChange={(e) => {
                    setSendMode("custom");
                    setScheduledAt(e.target.value);
                  }}
                  className="sr-only"
                />
              </label>

              {/* Clear */}
              {scheduledAt && (
                <button
                  type="button"
                  onClick={() => {
                    setScheduledAt("");
                    setSendMode(null);
                  }}
                  className="ml-3 text-[13px] text-brand-600 hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Confirmation */}
          {scheduledAt && (
            <p className="mt-1.5 pl-32 text-xs text-ink-muted">
              Sends{" "}
              <strong className="text-ink">
                {new Date(scheduledAt).toLocaleString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </strong>
            </p>
          )}
          {errors.startAt && (
            <p role="alert" className="mt-1 pl-32 text-xs text-danger-fg">
              {errors.startAt}
            </p>
          )}
        </div>

        <div>
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <label
                htmlFor="delay"
                className="shrink-0 text-[15px] text-ink-muted"
              >
                Delay (s)
              </label>
              <Input
                id="delay"
                type="number"
                min={0}
                step={1}
                value={delaySeconds}
                onChange={(event) => setDelaySeconds(event.target.value)}
                placeholder="2"
                className="w-20 text-center"
              />
            </div>
            <div className="flex items-center gap-3">
              <label
                htmlFor="hourly"
                className="shrink-0 text-[15px] text-ink-muted"
              >
                Hourly limit
              </label>
              <Input
                id="hourly"
                type="number"
                min={1}
                step={1}
                value={hourlyLimit}
                onChange={(event) => setHourlyLimit(event.target.value)}
                placeholder="200"
                className="w-20 text-center"
              />
            </div>
          </div>
          {(errors.delayMs || errors.hourlyLimit) && (
            <p role="alert" className="mt-1 text-xs text-danger-fg">
              {errors.delayMs ?? errors.hourlyLimit}
            </p>
          )}
        </div>

        <div>
          <RichTextEditor
            label="Body"
            placeholder="Type Your Reply..."
            invalid={Boolean(errors.body)}
            onChange={setBody}
          />
          {errors.body && (
            <p role="alert" className="mt-1 text-xs text-danger-fg">
              {errors.body}
            </p>
          )}
          {files.length > 0 && (
            <ul aria-label="Attachments" className="mt-6 flex flex-wrap gap-4">
              {files.map(({ attachment, thumbnail }) => (
                <AttachmentCard
                  key={attachment.id}
                  attachment={attachment}
                  thumbnail={thumbnail}
                  onRemove={() => removeAttachment(attachment.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </form>
  );
}
