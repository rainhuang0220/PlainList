import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
}));

vi.mock('@/shared/api/useApi', () => ({
  useApi: () => api,
}));

import { useDurationChartPrefsStore } from './useDurationChartPrefsStore';

describe('useDurationChartPrefsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('loads prefs for a scope and defaults to empty', async () => {
    api.get.mockResolvedValueOnce({ hiddenPlanIds: [3], merges: [{ label: 'Study', planIds: [1, 2] }] });

    const store = useDurationChartPrefsStore();
    expect(store.getPrefs('week', '2026-W33')).toEqual({ hiddenPlanIds: [], merges: [] });

    await store.load('week', '2026-W33');

    expect(api.get).toHaveBeenCalledWith('/duration-chart-prefs?scope=week&scopeKey=2026-W33');
    expect(store.getPrefs('week', '2026-W33')).toEqual({
      hiddenPlanIds: [3],
      merges: [{ label: 'Study', planIds: [1, 2] }],
    });
  });

  it('hides, restores, merges, and unmerges with PUT', async () => {
    api.get.mockResolvedValue({ hiddenPlanIds: [], merges: [] });
    api.put.mockImplementation(async (_path: string, body: unknown) => body);

    const store = useDurationChartPrefsStore();
    await store.load('month', '2026-08');

    await store.hidePlan('month', '2026-08', 5);
    expect(store.getPrefs('month', '2026-08').hiddenPlanIds).toEqual([5]);
    expect(api.put).toHaveBeenLastCalledWith(
      '/duration-chart-prefs?scope=month&scopeKey=2026-08',
      { hiddenPlanIds: [5], merges: [] },
    );

    await store.restorePlan('month', '2026-08', 5);
    expect(store.getPrefs('month', '2026-08').hiddenPlanIds).toEqual([]);

    await store.mergePlans('month', '2026-08', 'Focus', [1, 2]);
    expect(store.getPrefs('month', '2026-08').merges).toEqual([{ label: 'Focus', planIds: [1, 2] }]);

    await store.unmerge('month', '2026-08', 0);
    expect(store.getPrefs('month', '2026-08').merges).toEqual([]);
  });
});
