import { defineStore } from 'pinia';
import { ref } from 'vue';
import { toDateKey } from '@plainlist/shared';
import { useApi } from '@/shared/api/useApi';

export const useReviewsStore = defineStore('reviews', () => {
  const { get, put } = useApi();
  const reviews = ref<Record<string, string>>({});

  async function fetchRange(from: string, to: string) {
    const data = await get<Record<string, string>>(`/reviews?from=${from}&to=${to}`);
    Object.assign(reviews.value, data);
  }

  async function fetchYear(year: number) {
    const today = new Date();
    const end = new Date(year, 11, 31);
    const capped = end > today ? today : end;
    const to = `${capped.getFullYear()}-${String(capped.getMonth() + 1).padStart(2, '0')}-${String(capped.getDate()).padStart(2, '0')}`;
    await fetchRange(`${year}-01-01`, to);
  }

  async function upsert(dateKey: string, content: string) {
    if (dateKey !== toDateKey(new Date())) {
      return;
    }
    reviews.value[dateKey] = content;
    try {
      await put<{ ok: true }>(`/reviews/${dateKey}`, { content });
    } catch (error) {
      console.error('[reviews] failed to save review', error);
    }
  }

  function getReview(dateKey: string): string {
    return reviews.value[dateKey] ?? '';
  }

  function clear() {
    reviews.value = {};
  }

  return {
    reviews,
    fetchRange,
    fetchYear,
    upsert,
    getReview,
    clear,
  };
});
