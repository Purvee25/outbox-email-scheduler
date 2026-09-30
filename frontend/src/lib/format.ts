const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "medium",
});

export function formatDateTime(iso: string | null): string {
  return iso ? dateTimeFormat.format(new Date(iso)) : "—";
}

/** Value for <input type="datetime-local"> in the user's local time zone. */
export function toDateTimeLocalValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const RECENT_DAYS = 6;
const timeFormat: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
};
const nearFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  ...timeFormat,
});
const farFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  ...timeFormat,
});

/** Compact send time for list pills: "Tue 9:15:12 AM" within a week, otherwise "Oct 3, 9:15:12 AM". */
export function formatBadgeTime(iso: string): string {
  const date = new Date(iso);
  const near = Math.abs(date.getTime() - Date.now()) < RECENT_DAYS * MS_PER_DAY;
  return (near ? nearFormat : farFormat).format(date);
}

/** Tomorrow at the given local hour, as a datetime-local value. */
export function tomorrowAt(hour: number): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(hour, 0, 0, 0);
  return toDateTimeLocalValue(date);
}
