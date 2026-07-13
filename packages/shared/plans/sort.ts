import type { PlanRecord } from '../types';

export function comparePlansByTime(
  left: Pick<PlanRecord, 'time' | 'sortOrder' | 'id'>,
  right: Pick<PlanRecord, 'time' | 'sortOrder' | 'id'>,
): number {
  const byTime = left.time.localeCompare(right.time);
  if (byTime !== 0) {
    return byTime;
  }

  const orderDiff = (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
  if (orderDiff !== 0) {
    return orderDiff;
  }

  return left.id - right.id;
}

export function sortPlansByTime<T extends Pick<PlanRecord, 'time' | 'sortOrder' | 'id'>>(plans: T[]): T[] {
  return [...plans].sort(comparePlansByTime);
}
