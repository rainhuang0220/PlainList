import { describe, expect, it } from 'vitest';
import { decideMakeupTodo, findTodoByNameOnDate, resolveMakeupAfterCreate } from './makeupTodo';
import type { PlanRecord } from '../types';

function todo(id: number, name: string, date: string): PlanRecord {
  return {
    id,
    type: 'todo',
    name,
    time: '09:00',
    sortOrder: 0,
    scheduledDate: date,
  };
}

const plans: PlanRecord[] = [
  todo(10, '写论文', '2026-08-26'),
  todo(11, '写论文', '2026-08-25'),
  {
    id: 12,
    type: 'habit',
    name: '写论文',
    time: '07:00',
    sortOrder: 0,
  },
];

describe('findTodoByNameOnDate', () => {
  it('matches the same-name todo on that date only', () => {
    expect(findTodoByNameOnDate(plans, '写论文', '2026-08-26')?.id).toBe(10);
    expect(findTodoByNameOnDate(plans, '写 论文', '2026-08-26')?.id).toBe(10);
    expect(findTodoByNameOnDate(plans, '写论文', '2026-08-24')).toBeUndefined();
  });

  it('does not treat a same-name habit as a makeup target', () => {
    expect(findTodoByNameOnDate([plans[2]], '写论文', '2026-08-26')).toBeUndefined();
  });
});

describe('decideMakeupTodo', () => {
  it('creates when no same-name todo exists that day', () => {
    expect(decideMakeupTodo({
      plans,
      name: '完成论文实验',
      dateKey: '2026-08-26',
      wantComplete: true,
      alreadyDone: false,
    })).toEqual({ action: 'create' });
  });

  it('requires confirmation instead of silently completing an existing incomplete todo', () => {
    expect(decideMakeupTodo({
      plans,
      name: '写论文',
      dateKey: '2026-08-26',
      wantComplete: true,
      alreadyDone: false,
    })).toEqual({ action: 'confirm-complete', plan: plans[0] });
  });

  it('does not rewrite an already completed same-name todo', () => {
    expect(decideMakeupTodo({
      plans,
      name: '写论文',
      dateKey: '2026-08-26',
      wantComplete: true,
      alreadyDone: true,
    })).toEqual({ action: 'already-complete', plan: plans[0] });
  });

  it('does not mark complete when the user unchecked completed', () => {
    expect(decideMakeupTodo({
      plans,
      name: '写论文',
      dateKey: '2026-08-26',
      wantComplete: false,
      alreadyDone: false,
    })).toEqual({ action: 'exists-incomplete', plan: plans[0] });
  });
});

describe('resolveMakeupAfterCreate', () => {
  it('marks complete only for a newly inserted todo', () => {
    expect(resolveMakeupAfterCreate({ existed: false, alreadyDone: false, wantComplete: true }))
      .toEqual({ action: 'mark-complete' });
  });

  it('aborts silent complete when API returned an existing incomplete row', () => {
    expect(resolveMakeupAfterCreate({ existed: true, alreadyDone: false, wantComplete: true }))
      .toEqual({ action: 'abort-needs-confirm' });
  });

  it('does not touch checks when the existing row is already complete', () => {
    expect(resolveMakeupAfterCreate({ existed: true, alreadyDone: true, wantComplete: true }))
      .toEqual({ action: 'noop-already-complete' });
  });
});
