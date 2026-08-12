import { describe, expect, it } from 'vitest';
import type { PlanRecord } from '../types';
import { aggregateDurationStats } from './aggregateHours';

describe('aggregateDurationStats', () => {
  const emptyPrefs = { hiddenPlanIds: [] as number[], merges: [] as Array<{ label: string; planIds: number[] }> };

  it('sums effective minutes as hours per visible plan-day in range', () => {
    const plans: PlanRecord[] = [
      {
        id: 1,
        type: 'todo',
        name: 'Task A',
        time: '09:00',
        sortOrder: 0,
        durationMinutes: 60,
        scheduledDate: '2026-08-10',
      },
      {
        id: 2,
        type: 'todo',
        name: 'Task B',
        time: '10:00',
        sortOrder: 1,
        durationMinutes: 30,
        scheduledDate: '2026-08-11',
      },
    ];
    const checks = {
      '1': { '2026-08-10': { done: true } },
      '2': { '2026-08-11': { done: true } },
    };

    const result = aggregateDurationStats({
      plans,
      checks,
      from: '2026-08-10',
      to: '2026-08-11',
      prefs: emptyPrefs,
    });

    expect(result.totalHours).toBeCloseTo(1.5);
    expect(result.hourRows).toEqual([
      { label: 'Task A', planIds: [1], hours: 1 },
      { label: 'Task B', planIds: [2], hours: 0.5 },
    ]);
  });

  it('skips hidden plan ids from hour rows and total', () => {
    const plans: PlanRecord[] = [
      {
        id: 1,
        type: 'todo',
        name: 'Visible',
        time: '09:00',
        sortOrder: 0,
        durationMinutes: 60,
        scheduledDate: '2026-08-10',
      },
      {
        id: 2,
        type: 'todo',
        name: 'Hidden',
        time: '10:00',
        sortOrder: 1,
        durationMinutes: 60,
        scheduledDate: '2026-08-10',
      },
    ];
    const checks = {
      '1': { '2026-08-10': { done: true } },
      '2': { '2026-08-10': { done: true } },
    };

    const result = aggregateDurationStats({
      plans,
      checks,
      from: '2026-08-10',
      to: '2026-08-10',
      prefs: { hiddenPlanIds: [2], merges: [] },
    });

    expect(result.totalHours).toBeCloseTo(1);
    expect(result.hourRows).toEqual([{ label: 'Visible', planIds: [1], hours: 1 }]);
  });

  it('merges selected plans under one label with summed hours', () => {
    const plans: PlanRecord[] = [
      {
        id: 1,
        type: 'todo',
        name: 'Alpha',
        time: '09:00',
        sortOrder: 0,
        durationMinutes: 60,
        scheduledDate: '2026-08-10',
      },
      {
        id: 2,
        type: 'todo',
        name: 'Beta',
        time: '10:00',
        sortOrder: 1,
        durationMinutes: 30,
        scheduledDate: '2026-08-10',
      },
    ];
    const checks = {
      '1': { '2026-08-10': { done: true } },
      '2': { '2026-08-10': { done: true } },
    };

    const result = aggregateDurationStats({
      plans,
      checks,
      from: '2026-08-10',
      to: '2026-08-10',
      prefs: { hiddenPlanIds: [], merges: [{ label: 'Study', planIds: [1, 2] }] },
    });

    expect(result.totalHours).toBeCloseTo(1.5);
    expect(result.hourRows).toEqual([{ label: 'Study', planIds: [1, 2], hours: 1.5 }]);
  });

  it('counts habit done days in range regardless of minutes', () => {
    const plans: PlanRecord[] = [
      {
        id: 10,
        type: 'habit',
        name: 'Meditate',
        time: '07:00',
        sortOrder: 0,
      },
    ];
    const checks = {
      '10': {
        '2026-08-10': { done: true },
        '2026-08-11': { done: true },
        '2026-08-12': { done: false },
      },
    };

    const result = aggregateDurationStats({
      plans,
      checks,
      from: '2026-08-10',
      to: '2026-08-12',
      prefs: emptyPrefs,
    });

    expect(result.habitCounts).toEqual([{ planId: 10, name: 'Meditate', count: 2 }]);
    expect(result.hourRows).toEqual([]);
    expect(result.totalHours).toBe(0);
  });
});
