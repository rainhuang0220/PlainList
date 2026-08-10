import { LocalNotifications } from '@capacitor/local-notifications';
import { buildReminderSchedules } from './planReminders';
import type { NotificationScheduler, ReminderPlanLike } from './types';

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function cancelTracked() {
  const pending = await withTimeout(LocalNotifications.getPending(), 4000, 'getPending');
  if (pending.notifications.length) {
    await withTimeout(
      LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) }),
      4000,
      'cancel',
    );
  }
}

export const localScheduler: NotificationScheduler = {
  async requestPermission() {
    try {
      const current = await withTimeout(LocalNotifications.checkPermissions(), 4000, 'checkPermissions');
      if (current.display === 'granted') return true;
      const requested = await withTimeout(LocalNotifications.requestPermissions(), 15000, 'requestPermissions');
      return requested.display === 'granted';
    } catch (error) {
      console.warn('[notifications] permission failed', error);
      return false;
    }
  },

  async syncFromPlans(plans: ReminderPlanLike[]) {
    try {
      const granted = await this.requestPermission();
      if (!granted) return;

      await cancelTracked();
      const items = buildReminderSchedules(plans);
      if (!items.length) return;

      await withTimeout(
        LocalNotifications.schedule({
          notifications: items.map((item) => ({
            id: item.id,
            title: item.title,
            body: item.body,
            schedule: { at: item.at },
            extra: { planId: item.planId },
          })),
        }),
        8000,
        'schedule',
      );
    } catch (error) {
      console.warn('[notifications] syncFromPlans failed', error);
    }
  },

  async clearAll() {
    try {
      await cancelTracked();
    } catch (error) {
      console.warn('[notifications] clearAll failed', error);
    }
  },
};
