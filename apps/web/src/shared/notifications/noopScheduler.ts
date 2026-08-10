import type { NotificationScheduler, ReminderPlanLike } from './types';

export const noopScheduler: NotificationScheduler = {
  async requestPermission() {
    return false;
  },
  async syncFromPlans(_plans: ReminderPlanLike[]) {},
  async clearAll() {},
};
