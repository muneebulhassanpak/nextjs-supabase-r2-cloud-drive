const thisYear = new Intl.DateTimeFormat("en", { weekday: "long", day: "numeric", month: "long" });
const otherYear = new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric" });

/** "Today", "Yesterday", "Monday, November 23" or "November 23, 2025", in the local time zone. */
export function localDay(date: Date, now: Date): string {
  const yesterday = new Date(now);
  // setDate counts calendar days, so a clock change doesn't shift it.
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === now.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return (date.getFullYear() === now.getFullYear() ? thisYear : otherYear).format(date);
}
