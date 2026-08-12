import type { PlanRecord, PlanType } from '@plainlist/shared';
import { dedupeHabitPlans, sortPlansByTime } from '@plainlist/shared';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useApi } from '@/shared/api/useApi';
import { getNotificationScheduler } from '@/shared/notifications';

export const usePlansStore = defineStore('plans', () => {
  const { del, get, patch, post } = useApi();
  const plans = ref<PlanRecord[]>([]);

  async function syncReminders() {
    // Fire-and-forget: LocalNotifications permission prompts must never block UI.
    void getNotificationScheduler().syncFromPlans(plans.value).catch((error) => {
      console.warn('[plans] reminder sync failed', error);
    });
  }

  async function fetch() {
    plans.value = dedupeHabitPlans(sortPlansByTime(await get<PlanRecord[]>('/plans')));
    void syncReminders();
  }

  async function add(
    name: string,
    type: PlanType,
    time: string,
    scheduledDate?: string,
    description?: string,
    durationMinutes?: number | null,
  ) {
    const payload: {
      name: string;
      type: PlanType;
      time: string;
      scheduledDate?: string;
      description?: string;
      durationMinutes?: number | null;
    } = { name, type, time };

    if (type === 'todo' && scheduledDate) {
      payload.scheduledDate = scheduledDate;
    }
    if (description) {
      payload.description = description;
    }
    if (durationMinutes !== undefined) {
      payload.durationMinutes = durationMinutes;
    }

    const createdPlan = await post<PlanRecord>('/plans', payload);
    const withoutDuplicate = plans.value.filter((plan) => plan.id !== createdPlan.id);
    plans.value = dedupeHabitPlans(sortPlansByTime([...withoutDuplicate, createdPlan]));
    void syncReminders();
    return createdPlan;
  }

  async function update(id: number, updates: {
    name?: string;
    description?: string | null;
    type?: PlanType;
    time?: string;
    durationMinutes?: number | null;
  }) {
    const updatedPlan = await patch<PlanRecord>(`/plans/${id}`, updates);
    plans.value = dedupeHabitPlans(sortPlansByTime(
      plans.value.map((plan) => plan.id === id ? updatedPlan : plan),
    ));
    void syncReminders();
    return updatedPlan;
  }

  async function remove(id: number) {
    await del<{ ok: true }>(`/plans/${id}`);
    plans.value = plans.value.filter((plan) => plan.id !== id);
    void syncReminders();
  }

  async function removeMany(ids: number[]): Promise<{ removed: number[]; failed: Array<{ id: number; reason: string }> }> {
    const removed: number[] = [];
    const failed: Array<{ id: number; reason: string }> = [];
    for (const id of ids) {
      try {
        await del<{ ok: true }>(`/plans/${id}`);
        removed.push(id);
      } catch (caughtError) {
        const reason = caughtError instanceof Error ? caughtError.message : 'unknown error';
        failed.push({ id, reason });
        console.error('[plans.removeMany] failed to delete plan', id, reason);
      }
    }
    if (removed.length > 0) {
      const removedSet = new Set(removed);
      plans.value = dedupeHabitPlans(sortPlansByTime(plans.value.filter((plan) => !removedSet.has(plan.id))));
      void syncReminders();
    }
    return { removed, failed };
  }

  function clear() {
    void getNotificationScheduler().clearAll();
    plans.value = [];
  }

  return {
    plans,
    fetch,
    add,
    update,
    remove,
    removeMany,
    clear,
  };
});
