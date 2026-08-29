import type { PlanRecord } from '../types';
import { normalizePlanName } from './dedupe';

export function findTodoByNameOnDate(
  plans: PlanRecord[],
  name: string,
  dateKey: string,
): PlanRecord | undefined {
  const key = normalizePlanName(name);
  return plans.find((plan) => (
    plan.type === 'todo'
    && plan.scheduledDate === dateKey
    && normalizePlanName(plan.name) === key
  ));
}

export type MakeupTodoDecision =
  | { action: 'create' }
  | { action: 'already-complete'; plan: PlanRecord }
  | { action: 'confirm-complete'; plan: PlanRecord }
  | { action: 'exists-incomplete'; plan: PlanRecord };

export function decideMakeupTodo(input: {
  plans: PlanRecord[];
  name: string;
  dateKey: string;
  wantComplete: boolean;
  alreadyDone: boolean;
}): MakeupTodoDecision {
  const plan = findTodoByNameOnDate(input.plans, input.name, input.dateKey);
  if (!plan) {
    return { action: 'create' };
  }
  if (input.alreadyDone) {
    return { action: 'already-complete', plan };
  }
  if (input.wantComplete) {
    return { action: 'confirm-complete', plan };
  }
  return { action: 'exists-incomplete', plan };
}

export type MakeupAfterCreateDecision =
  | { action: 'mark-complete' }
  | { action: 'created' }
  | { action: 'abort-needs-confirm' }
  | { action: 'noop-already-complete' }
  | { action: 'noop-exists' };

export function resolveMakeupAfterCreate(input: {
  existed: boolean;
  alreadyDone: boolean;
  wantComplete: boolean;
}): MakeupAfterCreateDecision {
  if (!input.existed) {
    return input.wantComplete ? { action: 'mark-complete' } : { action: 'created' };
  }
  if (input.alreadyDone) {
    return { action: 'noop-already-complete' };
  }
  if (input.wantComplete) {
    return { action: 'abort-needs-confirm' };
  }
  return { action: 'noop-exists' };
}
