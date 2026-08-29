import type { WeeklySummaryResponse } from '@plainlist/shared';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { toDateKey } from '@plainlist/shared';
import { useApi } from '@/shared/api/useApi';

export const useReviewsStore = defineStore('reviews', () => {
  const { get, put, post } = useApi();
  const reviews = ref<Record<string, string>>({});

  async function fetchRange(from: string, to: string) {
    const data = await get<Record<string, string>>(`/reviews?from=${from}&to=${to}`);
    Object.assign(reviews.value, data);
  }

  async function fetchYear(year: number) {
    const today = new Date();
    const end = new Date(year, 11, 31);
    const capped = end > today ? today : end;
    await fetchRange(`${year}-01-01`, toDateKey(capped));
  }

  /**
   * Persist to the provided dateKey. Callers must bind editingDate
   * before invoking — this function must not call today().
   */
  async function persist(dateKey: string, content: string) {
    reviews.value[dateKey] = content;
    await put<{ ok: true }>(`/reviews/${dateKey}`, { content });
  }

  function getReview(dateKey: string): string {
    return reviews.value[dateKey] ?? '';
  }

  async function fetchWeeklySummary(weekStart: string) {
    return get<WeeklySummaryResponse>(`/reviews/weekly-summary?weekStart=${weekStart}`);
  }

  async function generateWeeklySummary(weekStart: string) {
    return post<WeeklySummaryResponse>('/reviews/weekly-summary', { weekStart });
  }

  function clear() {
    reviews.value = {};
  }

  return {
    reviews,
    fetchRange,
    fetchYear,
    persist,
    getReview,
    fetchWeeklySummary,
    generateWeeklySummary,
    clear,
  };
});
