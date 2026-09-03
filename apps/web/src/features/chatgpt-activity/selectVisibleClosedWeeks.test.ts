import { describe, expect, it } from 'vitest';
import { VISIBLE_CLOSED_WEEK_LIMIT, selectVisibleClosedWeeks } from './selectVisibleClosedWeeks';

describe('selectVisibleClosedWeeks', () => {
  it('keeps the newest 7 closed weeks and does not mutate the source list', () => {
    const weeks = [
      { weekStart: '2026-07-07' },
      { weekStart: '2026-08-25' },
      { weekStart: '2026-08-04' },
      { weekStart: '2026-08-18' },
      { weekStart: '2026-07-21' },
      { weekStart: '2026-08-11' },
      { weekStart: '2026-07-28' },
      { weekStart: '2026-07-14' },
      { weekStart: '2026-06-30' },
    ];
    const visible = selectVisibleClosedWeeks(weeks);
    expect(VISIBLE_CLOSED_WEEK_LIMIT).toBe(7);
    expect(visible.map((item) => item.weekStart)).toEqual([
      '2026-08-25',
      '2026-08-18',
      '2026-08-11',
      '2026-08-04',
      '2026-07-28',
      '2026-07-21',
      '2026-07-14',
    ]);
    expect(weeks).toHaveLength(9);
  });

  it('returns fewer than 7 when history is shorter', () => {
    const weeks = [{ weekStart: '2026-08-25' }, { weekStart: '2026-08-18' }];
    expect(selectVisibleClosedWeeks(weeks).map((item) => item.weekStart)).toEqual([
      '2026-08-25',
      '2026-08-18',
    ]);
  });
});
