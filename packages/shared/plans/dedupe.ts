import type { PlanRecord } from '../types';

export function normalizePlanName(name: string): string {
  return name.trim().replace(/\s+/g, '');
}

/** Keep the first habit per normalized name; todos are untouched. */
export function dedupeHabitPlans<T extends Pick<PlanRecord, 'id' | 'type' | 'name'>>(plans: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const plan of plans) {
    if (plan.type !== 'habit') {
      result.push(plan);
      continue;
    }

    const key = normalizePlanName(plan.name);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(plan);
  }

  return result;
}

export function findHabitByName<T extends Pick<PlanRecord, 'type' | 'name'>>(
  plans: T[],
  name: string,
): T | undefined {
  const key = normalizePlanName(name);
  return plans.find((plan) => plan.type === 'habit' && normalizePlanName(plan.name) === key);
}
