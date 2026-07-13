import type { PlanRecord, PlanType } from '@plainlist/shared';
import { dedupeHabitPlans, sortPlansByTime } from '@plainlist/shared';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useApi } from '@/shared/api/useApi';

export const usePlansStore = defineStore('plans', () => {
  const { del, get, patch, post } = useApi();
  const plans = ref<PlanRecord[]>([]);

  async function fetch() {
    plans.value = dedupeHabitPlans(sortPlansByTime(await get<PlanRecord[]>('/plans')));
  }

  async function add(name: string, type: PlanType, time: string, scheduledDate?: string, description?: string) {
    const payload: {
      name: string;
      type: PlanType;
      time: string;
      scheduledDate?: string;
      description?: string;
    } = { name, type, time };

    if (type === 'todo' && scheduledDate) {
      payload.scheduledDate = scheduledDate;
    }
    if (description) {
      payload.description = description;
    }

    const createdPlan = await post<PlanRecord>('/plans', payload);
    const withoutDuplicate = plans.value.filter((plan) => plan.id !== createdPlan.id);
    plans.value = dedupeHabitPlans(sortPlansByTime([...withoutDuplicate, createdPlan]));
    return createdPlan;
  }

  async function update(id: number, updates: { name?: string; description?: string | null; type?: PlanType; time?: string }) {
    const updatedPlan = await patch<PlanRecord>(`/plans/${id}`, updates);
    plans.value = dedupeHabitPlans(sortPlansByTime(
      plans.value.map((plan) => plan.id === id ? updatedPlan : plan),
    ));
    return updatedPlan;
  }

  async function remove(id: number) {
    await del<{ ok: true }>(`/plans/${id}`);
    plans.value = plans.value.filter((plan) => plan.id !== id);
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
    }
    return { removed, failed };
  }

  function clear() {
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
