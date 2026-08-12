import { describe, expect, it } from 'vitest';
import {
  isoWeekScopeKey,
  monthScopeKey,
  weekDateRange,
  yearDateRange,
  yearScopeKey,
} from './scopeKeys';

describe('duration chart scope keys', () => {
  it('builds ISO week scopeKey like 2026-W33', () => {
    expect(isoWeekScopeKey(new Date(2026, 7, 12))).toBe('2026-W33');
    expect(isoWeekScopeKey(new Date(2026, 0, 1))).toBe('2026-W01');
  });

  it('builds month and year scopeKeys', () => {
    expect(monthScopeKey(2026, 7)).toBe('2026-08');
    expect(yearScopeKey(2026)).toBe('2026');
  });

  it('returns Mon–Sun week range and full year range', () => {
    expect(weekDateRange(new Date(2026, 7, 12))).toEqual({
      from: '2026-08-10',
      to: '2026-08-16',
    });
    expect(yearDateRange(2026)).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
    });
  });
});
