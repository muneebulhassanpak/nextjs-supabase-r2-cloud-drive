export interface DateGroup<T> {
  label: "Today" | "This week" | "Earlier";
  items: T[];
}

/**
 * Groups items by when they were opened, in the local time zone (the viewer's, in the browser):
 * Today, This week (the six days before today) and Earlier. Keeps their order; leaves out empty
 * groups.
 */
export function groupByOpened<T extends { openedAt?: string }>(
  items: readonly T[],
  now: Date,
): DateGroup<T>[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  // setDate counts calendar days, so a clock change in between doesn't shift the boundary.
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - 6);

  const groups: DateGroup<T>[] = [
    { label: "Today", items: [] },
    { label: "This week", items: [] },
    { label: "Earlier", items: [] },
  ];
  for (const item of items) {
    const opened = new Date(item.openedAt ?? 0);
    const group = opened >= today ? groups[0] : opened >= weekStart ? groups[1] : groups[2];
    group?.items.push(item);
  }
  return groups.filter((group) => group.items.length > 0);
}
