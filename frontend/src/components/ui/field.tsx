import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";

const CONTROL_CLASSES =
  "w-full rounded-control border border-transparent bg-field px-4 text-sm text-ink placeholder:text-ink-muted " +
  "transition-colors focus:border-brand-500 focus:bg-white focus:outline-none " +
  "aria-invalid:border-danger-fg";

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: (controlProps: {
    id: string;
    "aria-invalid"?: true;
    "aria-describedby"?: string;
  }) => ReactNode;
}

/** Label + control + hint/error, wired together for screen readers. */
export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? hint;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink-muted">
        {label}
      </label>
      {children({
        id,
        ...(error && { "aria-invalid": true }),
        ...(message && { "aria-describedby": messageId }),
      })}
      {message && (
        <p
          id={messageId}
          className={cn("text-xs", error ? "text-danger-fg" : "text-ink-muted")}
        >
          {message}
        </p>
      )}
    </div>
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input className={cn(CONTROL_CLASSES, "h-10", className)} {...props} />
  );
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(CONTROL_CLASSES, "min-h-32 py-2", className)}
      {...props}
    />
  );
}
