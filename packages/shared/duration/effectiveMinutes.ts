import type { CheckDayState, PlanRecord } from '../types';

export function effectiveMinutes(
  plan: Pick<PlanRecord, 'durationMinutes'>,
  cell: CheckDayState,
): number | null {
  if (!cell.done) {
    return null;
  }

  if (cell.actualMinutes != null) {
    return cell.actualMinutes;
  }

  if (plan.durationMinutes != null) {
    return plan.durationMinutes;
  }

  return null;
}
