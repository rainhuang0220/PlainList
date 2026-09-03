export const VISIBLE_CLOSED_WEEK_LIMIT = 7;

export function selectVisibleClosedWeeks<T extends { weekStart: string }>(
  weeks: T[],
  limit = VISIBLE_CLOSED_WEEK_LIMIT,
): T[] {
  return [...weeks]
    .sort((left, right) => right.weekStart.localeCompare(left.weekStart))
    .slice(0, limit);
}
