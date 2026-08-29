import { describe, expect, it } from 'vitest';
import {
  addCalendarDays,
  getMonthRange,
  getPreviousMonth,
  getWeekStart,
  isReviewWriteAllowed,
  msUntilNextLocalMidnight,
  shiftDateKey,
  toDateKey,
} from './index';

describe('date helpers', () => {
  it('formats date keys', () => {
    expect(toDateKey(new Date('2026-03-31T08:00:00Z'))).toBe('2026-03-31');
  });

  it('uses local calendar fields, not UTC ISO', () => {
    const local = new Date(2026, 7, 28, 23, 30, 0);
    expect(toDateKey(local)).toBe('2026-08-28');
    expect(toDateKey(local)).toBe(
      `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`,
    );
  });

  it('shifts calendar days across month boundaries', () => {
    expect(toDateKey(addCalendarDays(new Date(2026, 7, 31), 1))).toBe('2026-09-01');
    expect(shiftDateKey('2026-08-28', -1)).toBe('2026-08-27');
    expect(shiftDateKey('2026-08-28', 1)).toBe('2026-08-29');
  });

  it('counts milliseconds until the next local midnight', () => {
    const now = new Date(2026, 7, 28, 23, 59, 59, 500);
    expect(msUntilNextLocalMidnight(now)).toBe(500);
  });

  it('allows review writes for today and yesterday only', () => {
    const now = new Date(2026, 7, 29, 0, 2, 0);
    expect(isReviewWriteAllowed('2026-08-29', now)).toBe(true);
    expect(isReviewWriteAllowed('2026-08-28', now)).toBe(true);
    expect(isReviewWriteAllowed('2026-08-27', now)).toBe(false);
    expect(isReviewWriteAllowed('2026-08-30', now)).toBe(false);
  });

  it('builds month ranges', () => {
    expect(getMonthRange(2026, 1)).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
  });

  it('resolves previous month across year boundaries', () => {
    expect(getPreviousMonth(2026, 0)).toEqual({ year: 2025, month: 11 });
  });

  it('returns monday as week start', () => {
    expect(toDateKey(getWeekStart(new Date('2026-03-31T10:00:00')))).toBe('2026-03-30');
  });
});
