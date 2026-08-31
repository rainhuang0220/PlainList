import { getWeekStart, parseDateKey, toDateKey } from '../date';

export function validateDateRange(dateStart: string, dateEnd: string): void {
  if (dateStart > dateEnd) throw new Error('dateStart must be on or before dateEnd');
}

export function normalizeWeekStart(dateKey: string): string {
  return toDateKey(getWeekStart(parseDateKey(dateKey)));
}
