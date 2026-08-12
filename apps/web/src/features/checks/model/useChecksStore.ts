import type { CheckDayState, ChecksByPlan } from '@plainlist/shared';
import { getMonthRange } from '@plainlist/shared';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useApi } from '@/shared/api/useApi';
import { usePlansStore } from '@/features/plans/model/usePlansStore';

export const useChecksStore = defineStore('checks', () => {
  const { get, put } = useApi();
  const checks = ref<ChecksByPlan>({});

  async function fetchRange(from: string, to: string) {
    const rows = await get<ChecksByPlan>(`/checks?from=${from}&to=${to}`);
    Object.keys(rows).forEach((planId) => {
      if (!checks.value[planId]) {
        checks.value[planId] = {};
      }

      Object.assign(checks.value[planId], rows[planId]);
    });
  }

  async function fetchMonth(year: number, month: number) {
    const range = getMonthRange(year, month - 1);
    await fetchRange(range.from, range.to);
  }

  function isChecked(planId: number | string, dateKey: string) {
    return Boolean(checks.value[String(planId)]?.[dateKey]?.done);
  }

  function getActualMinutes(planId: number | string, dateKey: string): number | null {
    const value = checks.value[String(planId)]?.[dateKey]?.actualMinutes;
    return value ?? null;
  }

  function resolveOptimisticActual(
    planId: number,
    next: { done: boolean; actualMinutes?: number | null },
    previous: CheckDayState | undefined,
  ): number | null | undefined {
    if (!next.done) {
      return null;
    }
    if (next.actualMinutes !== undefined) {
      return next.actualMinutes;
    }
    if (previous?.actualMinutes != null) {
      return previous.actualMinutes;
    }
    const plan = usePlansStore().plans.find((item) => item.id === planId);
    return plan?.durationMinutes ?? null;
  }

  async function setCheck(
    planId: number,
    dateKey: string,
    next: { done: boolean; actualMinutes?: number | null },
  ) {
    const planKey = String(planId);
    const previous = checks.value[planKey]?.[dateKey];

    if (!checks.value[planKey]) {
      checks.value[planKey] = {};
    }

    const optimisticActual = resolveOptimisticActual(planId, next, previous);
    const optimistic: CheckDayState = next.done
      ? {
          done: true,
          ...(optimisticActual !== undefined ? { actualMinutes: optimisticActual } : {}),
        }
      : { done: false, actualMinutes: null };

    checks.value[planKey][dateKey] = optimistic;

    const body: {
      planId: number;
      date: string;
      done: boolean;
      actualMinutes?: number | null;
    } = {
      planId,
      date: dateKey,
      done: next.done,
    };
    if (next.actualMinutes !== undefined) {
      body.actualMinutes = next.actualMinutes;
    }

    try {
      const cell = await put<CheckDayState>('/checks', body);
      checks.value[planKey][dateKey] = {
        done: cell.done,
        actualMinutes: cell.actualMinutes ?? null,
      };
    } catch (error) {
      if (previous === undefined) {
        delete checks.value[planKey][dateKey];
      } else {
        checks.value[planKey][dateKey] = previous;
      }
      throw error;
    }
  }

  async function toggle(planId: number, dateKey: string) {
    // Flip done; omit actualMinutes on become-done so API defaults / preserves custom.
    await setCheck(planId, dateKey, { done: !isChecked(planId, dateKey) });
  }

  function clear() {
    checks.value = {};
  }

  return {
    checks,
    fetchRange,
    fetchMonth,
    isChecked,
    getActualMinutes,
    setCheck,
    toggle,
    clear,
  };
});
