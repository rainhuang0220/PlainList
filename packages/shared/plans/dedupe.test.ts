import { describe, expect, it } from 'vitest';
import { dedupeHabitPlans, findHabitByName, normalizePlanName } from './dedupe';

describe('normalizePlanName', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizePlanName('  吃午饭 ')).toBe('吃午饭');
  });
});

describe('dedupeHabitPlans', () => {
  it('keeps the first habit per name and all todos', () => {
    const plans = dedupeHabitPlans([
      { id: 1, type: 'habit', name: '吃午饭', time: '13:00', sortOrder: 0 },
      { id: 2, type: 'habit', name: '吃午饭', time: '13:00', sortOrder: 0 },
      { id: 3, type: 'todo', name: '学习', time: '14:00', sortOrder: 0 },
      { id: 4, type: 'habit', name: '吃晚饭', time: '20:00', sortOrder: 0 },
    ]);

    expect(plans.map((plan) => plan.id)).toEqual([1, 3, 4]);
  });
});

describe('findHabitByName', () => {
  it('matches habits by normalized name', () => {
    const plans = [
      { id: 1, type: 'habit' as const, name: '吃午饭', time: '13:00', sortOrder: 0 },
      { id: 2, type: 'todo' as const, name: '吃午饭', time: '13:00', sortOrder: 0 },
    ];

    expect(findHabitByName(plans, ' 吃午饭 ')?.id).toBe(1);
    expect(findHabitByName(plans, '吃晚饭')).toBeUndefined();
  });
});
