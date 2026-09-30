"use client";

import {
  createCampaignSchema,
  type CreateCampaignInput,
} from "@scheduler/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { api, queryKeys } from "@/lib/api";
import { formatDateTime, toDateTimeLocalValue } from "@/lib/format";
import { parseLeadsFile, type ParsedLeads } from "@/lib/leads";

const DEFAULT_START_OFFSET_MS = 5 * 60_000;
const DEFAULT_DELAY_SECONDS = 2;
const DEFAULT_HOURLY_LIMIT = 200;
const FORM_ID = "compose-form";

type FieldName =
  "subject" | "body" | "recipients" | "startAt" | "delayMs" | "hourlyLimit";
type FieldErrors = Partial<Record<FieldName, string>>;

const plural = (count: number, singular: string, pluralForm = `${singular}s`) =>
  `${count} ${count === 1 ? singular : pluralForm}`;

function initialForm() {
  return {
    subject: "",
    body: "",
    startAt: toDateTimeLocalValue(
      new Date(Date.now() + DEFAULT_START_OFFSET_MS),
    ),
    delaySeconds: String(DEFAULT_DELAY_SECONDS),
    hourlyLimit: String(DEFAULT_HOURLY_LIMIT),
  };
}

export function ComposeModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initialForm);
  const [leads, setLeads] = useState<ParsedLeads | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const close = () => {
    setForm(initialForm());
    setLeads(null);
    setFileName(null);
    setErrors({});
    onClose();
  };

  const schedule = useMutation({
    mutationFn: (input: CreateCampaignInput) => api.createCampaign(input),
    onSuccess: (result) => {
      toast.success(`Scheduled ${result.scheduledCount} emails`, {
        description: `First send ${formatDateTime(result.firstSendAt)} · last ${formatDateTime(result.lastSendAt)}`,
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.allEmails });
      close();
    },
    onError: (error) => toast.error(`Couldn't schedule: ${error.message}`),
  });

  const update =
    (name: keyof ReturnType<typeof initialForm>) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((current) => ({ ...current, [name]: event.target.value }));

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParsing(true);
    try {
      const parsed = await parseLeadsFile(file);
      setLeads(parsed);
      setErrors((current) => ({
        ...current,
        recipients:
          parsed.emails.length === 0
            ? "No email addresses found in this file"
            : undefined,
      }));
    } catch (error) {
      setLeads(null);
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
      subject: form.subject,
      body: form.body,
      recipients: leads?.emails ?? [],
      startAt: form.startAt ? new Date(form.startAt).toISOString() : "",
      delayMs: Math.round(Number(form.delaySeconds) * 1000),
      hourlyLimit: Number(form.hourlyLimit),
    });
    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const name = issue.path[0] as FieldName;
        fieldErrors[name] ??=
          name === "recipients"
            ? "Upload a file with at least one valid email"
            : issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    schedule.mutate(parsed.data);
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Compose new email"
      description="Upload your leads and choose when and how fast to send."
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            loading={schedule.isPending}
            disabled={parsing}
          >
            Schedule
          </Button>
        </>
      }
    >
      <form
        id={FORM_ID}
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-5"
      >
        <Field label="Subject" error={errors.subject}>
          {(props) => (
            <Input
              {...props}
              value={form.subject}
              onChange={update("subject")}
              placeholder="Quick question about…"
              maxLength={998}
            />
          )}
        </Field>
        <Field label="Body" error={errors.body}>
          {(props) => (
            <Textarea
              {...props}
              value={form.body}
              onChange={update("body")}
              placeholder="Hi there,"
            />
          )}
        </Field>
        <Field
          label="Leads (CSV or text file)"
          error={errors.recipients}
          hint={
            parsing
              ? "Reading file…"
              : leads
                ? `${plural(leads.emails.length, "email address", "email addresses")} detected in ${fileName}` +
                  (leads.duplicates
                    ? ` · ${plural(leads.duplicates, "duplicate")} removed`
                    : "") +
                  (leads.invalid ? ` · ${leads.invalid} invalid skipped` : "")
                : "Any column containing email addresses works; max 2 MB."
          }
        >
          {(props) => (
            <Input
              {...props}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              onChange={handleFile}
              className="py-2 file:mr-3 file:rounded file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-sm file:font-medium file:text-brand-700"
            />
          )}
        </Field>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Start time" error={errors.startAt}>
            {(props) => (
              <Input
                {...props}
                type="datetime-local"
                value={form.startAt}
                onChange={update("startAt")}
              />
            )}
          </Field>
          <Field
            label="Delay between emails"
            hint="Seconds"
            error={errors.delayMs}
          >
            {(props) => (
              <Input
                {...props}
                type="number"
                min={0}
                step={1}
                value={form.delaySeconds}
                onChange={update("delaySeconds")}
              />
            )}
          </Field>
          <Field
            label="Hourly limit"
            hint="Emails per hour"
            error={errors.hourlyLimit}
          >
            {(props) => (
              <Input
                {...props}
                type="number"
                min={1}
                step={1}
                value={form.hourlyLimit}
                onChange={update("hourlyLimit")}
              />
            )}
          </Field>
        </div>
      </form>
    </Modal>
  );
}
