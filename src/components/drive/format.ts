const dateFormat = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const timeFormat = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" });

/** "14 Nov 2026", or the time for today. Uses the viewer's time zone (client components only). */
export function formatModified(iso: string, now = new Date()): string {
  const date = new Date(iso);
  return date.toDateString() === now.toDateString()
    ? timeFormat.format(date)
    : dateFormat.format(date);
}

const dateTimeFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

/** "Nov 14, 2026, 3:05 PM" in the viewer's time zone (client components only). */
export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

/** "3:05 PM" in the viewer's time zone (client components only). */
export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}
