import { isPlanVisibleOnDate } from '../plans/visibility';
import type { ChecksByPlan, DurationChartPrefs, PlanRecord } from '../types';
import { effectiveMinutes } from './effectiveMinutes';

export interface HourRow {
  label: string;
  planIds: number[];
  hours: number;
}

export interface HabitCountRow {
  planId: number;
  name: string;
  count: number;
}

export interface AggregateDurationStatsInput {
  plans: PlanRecord[];
  checks: ChecksByPlan;
  from: string;
  to: string;
  prefs: DurationChartPrefs;
}

export interface AggregateDurationStatsResult {
  hourRows: HourRow[];
  habitCounts: HabitCountRow[];
  totalHours: number;
}

function* iterateDateKeys(from: string, to: string): Generator<string> {
  const current = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);

  while (current <= end) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    yield `${year}-${month}-${day}`;
    current.setDate(current.getDate() + 1);
  }
}

function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10;
}

export function aggregateDurationStats({
  plans,
  checks,
  from,
  to,
  prefs,
}: AggregateDurationStatsInput): AggregateDurationStatsResult {
  const hidden = new Set(prefs.hiddenPlanIds);
  const mergedPlanIds = new Set(prefs.merges.flatMap((merge) => merge.planIds));
  const minutesByPlanId = new Map<number, number>();
  const habitCounts: HabitCountRow[] = [];

  for (const plan of plans) {
    if (hidden.has(plan.id)) {
      continue;
    }

    const planKey = String(plan.id);
    let habitDoneDays = 0;

    for (const dateKey of iterateDateKeys(from, to)) {
      if (!isPlanVisibleOnDate(plan, dateKey)) {
        continue;
      }

      const cell = checks[planKey]?.[dateKey];
      if (!cell?.done) {
        continue;
      }

      if (plan.type === 'habit') {
        habitDoneDays += 1;
      }

      const minutes = effectiveMinutes(plan, cell);
      if (minutes != null) {
        minutesByPlanId.set(plan.id, (minutesByPlanId.get(plan.id) ?? 0) + minutes);
      }
    }

    if (plan.type === 'habit' && habitDoneDays > 0) {
      habitCounts.push({ planId: plan.id, name: plan.name, count: habitDoneDays });
    }
  }

  const hourRows: HourRow[] = [];
  const includedPlanIds = new Set<number>();

  for (const merge of prefs.merges) {
    const visiblePlanIds = merge.planIds.filter((planId) => !hidden.has(planId));
    if (visiblePlanIds.length === 0) {
      continue;
    }

    let mergeMinutes = 0;
    for (const planId of visiblePlanIds) {
      mergeMinutes += minutesByPlanId.get(planId) ?? 0;
      includedPlanIds.add(planId);
    }

    if (mergeMinutes > 0) {
      hourRows.push({
        label: merge.label,
        planIds: visiblePlanIds,
        hours: minutesToHours(mergeMinutes),
      });
    }
  }

  for (const plan of plans) {
    if (hidden.has(plan.id) || mergedPlanIds.has(plan.id) || includedPlanIds.has(plan.id)) {
      continue;
    }

    const minutes = minutesByPlanId.get(plan.id) ?? 0;
    if (minutes > 0) {
      hourRows.push({
        label: plan.name,
        planIds: [plan.id],
        hours: minutesToHours(minutes),
      });
    }
  }

  hourRows.sort((left, right) => right.hours - left.hours);
  habitCounts.sort((left, right) => right.count - left.count);

  let totalMinutes = 0;
  for (const planId of new Set(hourRows.flatMap((row) => row.planIds))) {
    totalMinutes += minutesByPlanId.get(planId) ?? 0;
  }
  const totalHours = minutesToHours(totalMinutes);

  return { hourRows, habitCounts, totalHours };
}
