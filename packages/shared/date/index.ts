export function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Local calendar date at midnight. Does not use UTC / toISOString(). */
export function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addCalendarDays(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

export function shiftDateKey(dateKey: string, amount: number): string {
  return toDateKey(addCalendarDays(parseDateKey(dateKey), amount));
}

export function msUntilNextLocalMidnight(now: Date): number {
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(0, nextMidnight.getTime() - now.getTime());
}

/**
 * Technical write window for diary persistence: today and yesterday.
 * Yesterday exists so an in-flight midnight flush can finish — not as
 * a product feature for editing history.
 */
export function isReviewWriteAllowed(dateKey: string, now: Date = new Date()): boolean {
  const today = toDateKey(now);
  const yesterday = toDateKey(addCalendarDays(now, -1));
  return dateKey === today || dateKey === yesterday;
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function getMonthRange(year: number, month: number): { from: string; to: string } {
  return {
    from: `${year}-${pad2(month + 1)}-01`,
    to: `${year}-${pad2(month + 1)}-${pad2(getDaysInMonth(year, month))}`,
  };
}

export function getPreviousMonth(year: number, month: number): { year: number; month: number } {
  if (month === 0) {
    return { year: year - 1, month: 11 };
  }

  return { year, month: month - 1 };
}

export function getWeekStart(date: Date): Date {
  const value = new Date(date);
  const day = value.getDay();
  value.setDate(value.getDate() - (day === 0 ? 6 : day - 1));
  value.setHours(0, 0, 0, 0);
  return value;
}

export * from './reviewClock';
