import type { Attachment } from "@scheduler/shared";

const BYTES_PER_KB = 1024;
const BYTES_PER_MB = BYTES_PER_KB * 1024;

export function formatFileSize(bytes: number): string {
  if (bytes >= BYTES_PER_MB) return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / BYTES_PER_KB))} KB`;
}

interface AttachmentCardProps {
  attachment: Attachment;
  /** Image thumbnail source; non-images show a file icon. */
  thumbnail?: string;
  /** Makes the card a download link. */
  href?: string;
  onRemove?: () => void;
}

export function AttachmentCard({ attachment, thumbnail, href, onRemove }: AttachmentCardProps) {
  const body = (
    <>
      <div className="flex h-36 items-center justify-center overflow-hidden rounded-t-control bg-field">
        {thumbnail ? (
          // Local blob or API URL; next/image can't optimise either.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnail} alt="" className="size-full object-cover" />
        ) : (
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.2" className="size-10 text-ink-subtle" aria-hidden>
            <path d="M5 2.5h6.5L15 6v11.5H5zM11.5 2.5V6H15" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <div className="px-3 py-2">
        <p className="truncate text-[15px]">{attachment.filename}</p>
        <p className="text-xs text-ink-muted">{formatFileSize(attachment.size)}</p>
      </div>
    </>
  );

  return (
    <li className="relative w-[18rem] max-w-full overflow-hidden rounded-control border border-border bg-white">
      {href ? (
        <a href={href} download={attachment.filename} className="block hover:bg-field/50">
          {body}
        </a>
      ) : (
        body
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${attachment.filename}`}
          className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-white/90 text-ink-muted shadow hover:text-danger-fg"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="size-4" aria-hidden>
            <path d="m5 5 10 10M15 5 5 15" />
          </svg>
        </button>
      )}
    </li>
  );
}
