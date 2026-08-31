import { describe, expect, it } from 'vitest';
import { normalizeWeekStart, validateDateRange } from './dateRange';

describe('activity date ranges', () => {
  it('rejects inverted ranges and normalizes any date to its Monday', () => {
    expect(() => validateDateRange('2026-09-02', '2026-09-01')).toThrow('dateStart must be on or before dateEnd');
    expect(normalizeWeekStart('2026-08-30')).toBe('2026-08-24');
  });
});
