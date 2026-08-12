import type { DurationChartPrefs, DurationChartMerge } from '@plainlist/shared';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useApi } from '@/shared/api/useApi';
import type { DurationChartScope } from './scopeKeys';

const EMPTY_PREFS: DurationChartPrefs = { hiddenPlanIds: [], merges: [] };

function prefsCacheKey(scope: DurationChartScope, scopeKey: string): string {
  return `${scope}:${scopeKey}`;
}

function clonePrefs(prefs: DurationChartPrefs): DurationChartPrefs {
  return {
    hiddenPlanIds: [...prefs.hiddenPlanIds],
    merges: prefs.merges.map((merge) => ({
      label: merge.label,
      planIds: [...merge.planIds],
    })),
  };
}

export const useDurationChartPrefsStore = defineStore('durationChartPrefs', () => {
  const { get, put } = useApi();
  const byKey = ref<Record<string, DurationChartPrefs>>({});

  function getPrefs(scope: DurationChartScope, scopeKey: string): DurationChartPrefs {
    return byKey.value[prefsCacheKey(scope, scopeKey)] ?? clonePrefs(EMPTY_PREFS);
  }

  async function load(scope: DurationChartScope, scopeKey: string): Promise<DurationChartPrefs> {
    const prefs = await get<DurationChartPrefs>(
      `/duration-chart-prefs?scope=${encodeURIComponent(scope)}&scopeKey=${encodeURIComponent(scopeKey)}`,
    );
    const next = clonePrefs(prefs ?? EMPTY_PREFS);
    byKey.value = { ...byKey.value, [prefsCacheKey(scope, scopeKey)]: next };
    return next;
  }

  async function save(
    scope: DurationChartScope,
    scopeKey: string,
    prefs: DurationChartPrefs,
  ): Promise<DurationChartPrefs> {
    const body = clonePrefs(prefs);
    const saved = await put<DurationChartPrefs>(
      `/duration-chart-prefs?scope=${encodeURIComponent(scope)}&scopeKey=${encodeURIComponent(scopeKey)}`,
      body,
    );
    const next = clonePrefs(saved ?? body);
    byKey.value = { ...byKey.value, [prefsCacheKey(scope, scopeKey)]: next };
    return next;
  }

  async function hidePlan(scope: DurationChartScope, scopeKey: string, planId: number) {
    const current = getPrefs(scope, scopeKey);
    if (current.hiddenPlanIds.includes(planId)) {
      return current;
    }
    return save(scope, scopeKey, {
      ...current,
      hiddenPlanIds: [...current.hiddenPlanIds, planId],
    });
  }

  async function restorePlan(scope: DurationChartScope, scopeKey: string, planId: number) {
    const current = getPrefs(scope, scopeKey);
    return save(scope, scopeKey, {
      ...current,
      hiddenPlanIds: current.hiddenPlanIds.filter((id) => id !== planId),
    });
  }

  async function mergePlans(
    scope: DurationChartScope,
    scopeKey: string,
    label: string,
    planIds: number[],
  ) {
    const trimmed = label.trim();
    if (!trimmed || planIds.length < 2) {
      return getPrefs(scope, scopeKey);
    }
    const current = getPrefs(scope, scopeKey);
    const merge: DurationChartMerge = { label: trimmed, planIds: [...planIds] };
    return save(scope, scopeKey, {
      ...current,
      merges: [...current.merges, merge],
    });
  }

  async function unmerge(scope: DurationChartScope, scopeKey: string, mergeIndex: number) {
    const current = getPrefs(scope, scopeKey);
    if (mergeIndex < 0 || mergeIndex >= current.merges.length) {
      return current;
    }
    return save(scope, scopeKey, {
      ...current,
      merges: current.merges.filter((_, index) => index !== mergeIndex),
    });
  }

  function clear() {
    byKey.value = {};
  }

  return {
    byKey,
    getPrefs,
    load,
    save,
    hidePlan,
    restorePlan,
    mergePlans,
    unmerge,
    clear,
  };
});
