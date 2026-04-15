import type { PlanRecord, PlanType } from '@plainlist/shared';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useAiReviewStore } from '@/features/ai-review/model/useAiReviewStore';
import { useApi } from '@/shared/api/useApi';

export const usePlansStore = defineStore('plans', () => {
  const { del, get, post } = useApi();
  const aiReview = useAiReviewStore();
  const plans = ref<PlanRecord[]>([]);

  async function fetch() {
    plans.value = await get<PlanRecord[]>('/plans');
  }

  async function add(name: string, type: PlanType, time: string) {
    const createdPlan = await post<PlanRecord>('/plans', { name, type, time });
    plans.value.push(createdPlan);
    aiReview.clear();
    return createdPlan;
  }

  async function remove(id: number) {
    await del<{ ok: true }>(`/plans/${id}`);
    plans.value = plans.value.filter((plan) => plan.id !== id);
    aiReview.clear();
  }

  function clear() {
    plans.value = [];
    aiReview.clear();
  }

  return {
    plans,
    fetch,
    add,
    remove,
    clear,
  };
});
