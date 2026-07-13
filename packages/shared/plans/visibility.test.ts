import { describe, expect, it } from 'vitest';
import { isPlanVisibleOnDate } from './visibility';

describe('isPlanVisibleOnDate', () => {
  it('shows habits without visibleFrom on every day', () => {
    expect(isPlanVisibleOnDate({ type: 'habit', scheduledDate: null }, '2026-07-03')).toBe(true);
  });

  it('hides habits on days before visibleFrom', () => {
    const habit = { type: 'habit' as const, scheduledDate: null, visibleFrom: '2026-07-03' };
    expect(isPlanVisibleOnDate(habit, '2026-07-02')).toBe(false);
    expect(isPlanVisibleOnDate(habit, '2026-07-03')).toBe(true);
    expect(isPlanVisibleOnDate(habit, '2026-08-01')).toBe(true);
  });

  it('shows todos only on their scheduled date', () => {
    expect(isPlanVisibleOnDate({ type: 'todo', scheduledDate: '2026-07-03' }, '2026-07-03')).toBe(true);
    expect(isPlanVisibleOnDate({ type: 'todo', scheduledDate: '2026-06-01' }, '2026-07-03')).toBe(false);
  });
});
