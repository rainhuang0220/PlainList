import { describe, expect, it } from 'vitest';
import { completionPctForDate, visiblePlansOnDate } from './completionPct';
import type { ChecksByPlan, PlanRecord } from '../types';

function plan(partial: Partial<PlanRecord> & Pick<PlanRecord, 'id' | 'type' | 'name'>): PlanRecord {
  return {
    time: '09:00',
    sortOrder: 0,
    ...partial,
  };
}

describe('visiblePlansOnDate', () => {
  it('hides todos that belong to another day', () => {
    const plans = [
      plan({ id: 1, type: 'habit', name: 'Read', visibleFrom: '2026-08-01' }),
      plan({ id: 2, type: 'todo', name: 'Paper', scheduledDate: '2026-08-26' }),
      plan({ id: 3, type: 'todo', name: 'Other', scheduledDate: '2026-08-20' }),
    ];

    const visible = visiblePlansOnDate(plans, '2026-08-26');
    expect(visible.map((item) => item.id)).toEqual([1, 2]);
  });

  it('hides habits before visibleFrom', () => {
    const plans = [plan({ id: 1, type: 'habit', name: 'Read', visibleFrom: '2026-08-26' })];
    expect(visiblePlansOnDate(plans, '2026-08-25')).toEqual([]);
    expect(visiblePlansOnDate(plans, '2026-08-26').map((item) => item.id)).toEqual([1]);
  });
});

describe('completionPctForDate', () => {
  const plans: PlanRecord[] = [
    plan({ id: 1, type: 'habit', name: 'Read', visibleFrom: '2026-08-01' }),
    plan({ id: 2, type: 'todo', name: 'Paper', scheduledDate: '2026-08-26' }),
    plan({ id: 3, type: 'todo', name: 'Old', scheduledDate: '2026-08-20' }),
  ];

  it('ignores todos scheduled on other days in the denominator', () => {
    const checks: ChecksByPlan = {
      1: { '2026-08-26': { done: true } },
      2: { '2026-08-26': { done: true } },
    };

    expect(completionPctForDate(plans, checks, '2026-08-26')).toEqual({
      pct: 100,
      done: 2,
      total: 2,
    });
  });

  it('does not let a backfilled todo reduce another day', () => {
    const checks: ChecksByPlan = {
      1: { '2026-08-25': { done: true } },
    };

    expect(completionPctForDate(plans, checks, '2026-08-25')).toEqual({
      pct: 100,
      done: 1,
      total: 1,
    });
  });

  it('returns null when no plans are visible that day', () => {
    expect(completionPctForDate([], {}, '2026-08-26')).toBeNull();
  });

  it('counts unchecked visible items as incomplete, not as missing days', () => {
    const checks: ChecksByPlan = {};
    expect(completionPctForDate(plans, checks, '2026-08-26')).toEqual({
      pct: 0,
      done: 0,
      total: 2,
    });
  });
});
