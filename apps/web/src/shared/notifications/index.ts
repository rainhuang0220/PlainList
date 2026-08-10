import { isNativePlatform } from '@/shared/platform';
import { localScheduler } from './localScheduler';
import { noopScheduler } from './noopScheduler';
import type { NotificationScheduler } from './types';

export type { NotificationScheduler, ReminderPlanLike } from './types';
export { buildReminderSchedules } from './planReminders';

export function getNotificationScheduler(): NotificationScheduler {
  return isNativePlatform() ? localScheduler : noopScheduler;
}
