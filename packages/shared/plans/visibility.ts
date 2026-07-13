import type { PlanRecord } from '../types';

/**
 * Habits recur daily starting from `visibleFrom` (creation date or first
 * check, whichever is earlier); todos only appear on their scheduled date.
 */
export function isPlanVisibleOnDate(
  plan: Pick<PlanRecord, 'type' | 'scheduledDate' | 'visibleFrom'>,
  dateKey: string,
): boolean {
  if (plan.type === 'habit') {
    return !plan.visibleFrom || dateKey >= plan.visibleFrom;
  }

  return plan.scheduledDate === dateKey;
}
