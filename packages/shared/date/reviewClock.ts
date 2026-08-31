export interface ReviewWindow {
  reviewAsOfDate: string;
  windowStartDate: string;
  windowEndDate: string;
}

export interface ReviewClockOptions {
  timezone: string;
  now?: () => Date;
}

function dateParts(dateKey: string): [number, number, number] {
  const [year, month, day] = dateKey.split('-').map(Number);
  return [year, month, day];
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shiftCalendarDate(dateKey: string, days: number): string {
  const [year, month, day] = dateParts(dateKey);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return formatDateKey(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

function mondayFor(dateKey: string): string {
  const [year, month, day] = dateParts(dateKey);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return shiftCalendarDate(dateKey, weekday === 0 ? -6 : 1 - weekday);
}

function dateKeyInTimezone(date: Date, formatter: Intl.DateTimeFormat): string {
  const parts = formatter.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function reviewWindowFor(asOfDate: string): ReviewWindow {
  const windowEndDate = shiftCalendarDate(asOfDate, -1);
  const asOfMonday = mondayFor(asOfDate);
  const windowStartDate = asOfMonday === asOfDate
    ? shiftCalendarDate(asOfMonday, -7)
    : asOfMonday;

  return {
    reviewAsOfDate: asOfDate,
    windowStartDate,
    windowEndDate,
  };
}

export function createReviewClock(options: ReviewClockOptions) {
  const now = options.now ?? (() => new Date());
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: options.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const currentDateKey = () => dateKeyInTimezone(now(), formatter);

  function millisecondsUntilNextMidnight(): number {
    const current = now();
    const nextDateKey = shiftCalendarDate(dateKeyInTimezone(current, formatter), 1);
    let low = current.getTime();
    let high = low + (48 * 60 * 60 * 1000);

    while (dateKeyInTimezone(new Date(high), formatter) < nextDateKey) {
      high += 24 * 60 * 60 * 1000;
    }

    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (dateKeyInTimezone(new Date(middle), formatter) < nextDateKey) {
        low = middle;
      } else {
        high = middle;
      }
    }

    return Math.max(0, high - current.getTime());
  }

  return {
    timezone: options.timezone,
    now,
    currentDateKey,
    reviewWindow: () => reviewWindowFor(currentDateKey()),
    millisecondsUntilNextMidnight,
  };
}
