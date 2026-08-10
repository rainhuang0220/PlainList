import { LocalNotifications } from '@capacitor/local-notifications';
import { buildReminderSchedules } from './planReminders';
import type { NotificationScheduler, ReminderPlanLike } from './types';

async function cancelTracked() {
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) {
    await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  }
}

export const localScheduler: NotificationScheduler = {
  async requestPermission() {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return true;
    const requested = await LocalNotifications.requestPermissions();
    return requested.display === 'granted';
  },

  async syncFromPlans(plans: ReminderPlanLike[]) {
    const granted = await this.requestPermission();
    if (!granted) return;

    await cancelTracked();
    const items = buildReminderSchedules(plans);
    if (!items.length) return;

    await LocalNotifications.schedule({
      notifications: items.map((item) => ({
        id: item.id,
        title: item.title,
        body: item.body,
        schedule: { at: item.at },
        extra: { planId: item.planId },
      })),
    });
  },

  async clearAll() {
    await cancelTracked();
  },
};
