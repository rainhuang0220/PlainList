import type { ChecksByPlan, PlanRecord } from '../types';
import { isPlanVisibleOnDate } from './visibility';

export function visiblePlansOnDate(
  plans: PlanRecord[],
  dateKey: string,
): PlanRecord[] {
  return plans.filter((plan) => isPlanVisibleOnDate(plan, dateKey));
}

export function completionPctForDate(
  plans: PlanRecord[],
  checks: ChecksByPlan,
  dateKey: string,
): { pct: number; done: number; total: number } | null {
  const visible = visiblePlansOnDate(plans, dateKey);
  if (!visible.length) {
    return null;
  }

  const done = visible.filter((plan) => Boolean(checks[String(plan.id)]?.[dateKey]?.done)).length;
  return {
    pct: Math.round((done / visible.length) * 100),
    done,
    total: visible.length,
  };
}
