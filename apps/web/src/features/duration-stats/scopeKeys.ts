import { getWeekStart, pad2, toDateKey } from '@plainlist/shared';

export type DurationChartScope = 'week' | 'month' | 'year';

/** ISO week key, e.g. `2026-W33`. */
export function isoWeekScopeKey(date: Date): string {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${pad2(week)}`;
}

/** Month key, e.g. `2026-08` (`monthIndex` is 0-based). */
export function monthScopeKey(year: number, monthIndex: number): string {
  return `${year}-${pad2(monthIndex + 1)}`;
}

export function yearScopeKey(year: number): string {
  return String(year);
}

export function weekDateRange(date: Date): { from: string; to: string } {
  const monday = getWeekStart(date);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: toDateKey(monday), to: toDateKey(sunday) };
}

export function yearDateRange(year: number): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}
