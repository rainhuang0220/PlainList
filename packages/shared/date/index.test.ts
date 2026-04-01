import { describe, expect, it } from 'vitest';
import { getMonthRange, getPreviousMonth, getWeekStart, toDateKey } from './index';

describe('date helpers', () => {
  it('formats date keys', () => {
    expect(toDateKey(new Date('2026-03-31T08:00:00Z'))).toBe('2026-03-31');
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
