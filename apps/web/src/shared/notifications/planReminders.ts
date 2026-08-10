import type { ReminderPlanLike, ReminderScheduleItem } from './types';

const NOTIFICATION_ID_OFFSET = 100_000;

export function buildReminderSchedules(
  plans: ReminderPlanLike[],
  now: Date = new Date(),
): ReminderScheduleItem[] {
  const items: ReminderScheduleItem[] = [];

  for (const plan of plans) {
    if (plan.type !== 'todo' || !plan.scheduledDate) continue;
    const match = /^(\d{2}):(\d{2})$/.exec(plan.time);
    if (!match) continue;

    const [year, month, day] = plan.scheduledDate.split('-').map(Number);
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!year || !month || !day) continue;

    const at = new Date(year, month - 1, day, hour, minute, 0, 0);
    if (at.getTime() <= now.getTime()) continue;

    items.push({
      id: NOTIFICATION_ID_OFFSET + plan.id,
      planId: plan.id,
      title: 'PlainList',
      body: plan.name,
      at,
    });
  }

  return items;
}
