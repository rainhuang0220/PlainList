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
  const loadedKeys = ref<Record<string, true>>({});
  const inflightLoads = new Map<string, Promise<DurationChartPrefs>>();

  function getPrefs(scope: DurationChartScope, scopeKey: string): DurationChartPrefs {
    return byKey.value[prefsCacheKey(scope, scopeKey)] ?? clonePrefs(EMPTY_PREFS);
  }

  function isLoaded(scope: DurationChartScope, scopeKey: string): boolean {
    return Boolean(loadedKeys.value[prefsCacheKey(scope, scopeKey)]);
  }

  async function load(scope: DurationChartScope, scopeKey: string): Promise<DurationChartPrefs> {
    const key = prefsCacheKey(scope, scopeKey);
    const existing = inflightLoads.get(key);
    if (existing) {
      return existing;
    }

    const promise = (async () => {
      const prefs = await get<DurationChartPrefs>(
        `/duration-chart-prefs?scope=${encodeURIComponent(scope)}&scopeKey=${encodeURIComponent(scopeKey)}`,
      );
      const next = clonePrefs(prefs ?? EMPTY_PREFS);
      byKey.value = { ...byKey.value, [key]: next };
      loadedKeys.value = { ...loadedKeys.value, [key]: true };
      return next;
    })();

    inflightLoads.set(key, promise);
    try {
      return await promise;
    } finally {
      inflightLoads.delete(key);
    }
  }

  async function ensureLoaded(scope: DurationChartScope, scopeKey: string): Promise<DurationChartPrefs> {
    const key = prefsCacheKey(scope, scopeKey);
    if (loadedKeys.value[key] && byKey.value[key]) {
      return byKey.value[key];
    }
    return load(scope, scopeKey);
  }

  async function save(
    scope: DurationChartScope,
    scopeKey: string,
    prefs: DurationChartPrefs,
  ): Promise<DurationChartPrefs> {
    await ensureLoaded(scope, scopeKey);
    const body = clonePrefs(prefs);
    const saved = await put<DurationChartPrefs>(
      `/duration-chart-prefs?scope=${encodeURIComponent(scope)}&scopeKey=${encodeURIComponent(scopeKey)}`,
      body,
    );
    const key = prefsCacheKey(scope, scopeKey);
    const next = clonePrefs(saved ?? body);
    byKey.value = { ...byKey.value, [key]: next };
    loadedKeys.value = { ...loadedKeys.value, [key]: true };
    return next;
  }

  async function hidePlan(scope: DurationChartScope, scopeKey: string, planId: number) {
    const current = await ensureLoaded(scope, scopeKey);
    if (current.hiddenPlanIds.includes(planId)) {
      return current;
    }
    return save(scope, scopeKey, {
      ...current,
      hiddenPlanIds: [...current.hiddenPlanIds, planId],
    });
  }

  async function restorePlan(scope: DurationChartScope, scopeKey: string, planId: number) {
    const current = await ensureLoaded(scope, scopeKey);
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
    const current = await ensureLoaded(scope, scopeKey);
    if (!trimmed || planIds.length < 2) {
      return current;
    }
    const merge: DurationChartMerge = { label: trimmed, planIds: [...planIds] };
    return save(scope, scopeKey, {
      ...current,
      merges: [...current.merges, merge],
    });
  }

  async function unmerge(scope: DurationChartScope, scopeKey: string, mergeIndex: number) {
    const current = await ensureLoaded(scope, scopeKey);
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
    loadedKeys.value = {};
    inflightLoads.clear();
  }

  return {
    byKey,
    getPrefs,
    isLoaded,
    load,
    ensureLoaded,
    save,
    hidePlan,
    restorePlan,
    mergePlans,
    unmerge,
    clear,
  };
});
