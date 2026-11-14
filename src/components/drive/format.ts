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
