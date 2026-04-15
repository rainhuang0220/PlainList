import type { AiReviewPeriod, AiReviewResponse } from '@plainlist/shared';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useApi } from '@/shared/api/useApi';

export const useAiReviewStore = defineStore('aiReview', () => {
  const { post } = useApi();
  const current = ref<AiReviewResponse | null>(null);
  const activePeriod = ref<AiReviewPeriod>('day');
  const loading = ref(false);
  const error = ref('');

  async function generate(period: AiReviewPeriod, referenceDate?: string) {
    activePeriod.value = period;
    loading.value = true;
    error.value = '';

    try {
      const response = await post<AiReviewResponse>('/ai-reviews', {
        period,
        referenceDate,
      });
      current.value = response;
      return response;
    } catch (caughtError) {
      current.value = null;
      error.value = caughtError instanceof Error ? caughtError.message : 'Failed to generate AI review';
      throw caughtError;
    } finally {
      loading.value = false;
    }
  }

  function clear() {
    current.value = null;
    error.value = '';
    loading.value = false;
  }

  return {
    current,
    activePeriod,
    loading,
    error,
    generate,
    clear,
  };
});
