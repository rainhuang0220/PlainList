import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}));

vi.mock('@/shared/api/useApi', () => ({
  useApi: () => api,
}));

vi.mock('@/shared/notifications', () => ({
  getNotificationScheduler: () => ({
    syncFromPlans: vi.fn().mockResolvedValue(undefined),
  }),
}));

import { usePlansStore } from '@/features/plans/model/usePlansStore';
import { useChecksStore } from './useChecksStore';

describe('useChecksStore setCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('applies returned CheckDayState after successful PUT', async () => {
    api.put.mockResolvedValueOnce({ done: true, actualMinutes: 30 });

    const plans = usePlansStore();
    plans.plans = [
      {
        id: 7,
        type: 'todo',
        name: 'Task',
        time: '09:00',
        sortOrder: 0,
        durationMinutes: 30,
        scheduledDate: '2026-08-12',
      },
    ];

    const store = useChecksStore();
    await store.setCheck(7, '2026-08-12', { done: true });

    expect(api.put).toHaveBeenCalledWith('/checks', {
      planId: 7,
      date: '2026-08-12',
      done: true,
    });
    expect(store.checks['7']['2026-08-12']).toEqual({ done: true, actualMinutes: 30 });
  });

  it('optimistically uses plan duration when become-done omits actualMinutes', async () => {
    let resolvePut!: (value: { done: boolean; actualMinutes: number | null }) => void;
    api.put.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePut = resolve;
        }),
    );

    const plans = usePlansStore();
    plans.plans = [
      {
        id: 7,
        type: 'todo',
        name: 'Task',
        time: '09:00',
        sortOrder: 0,
        durationMinutes: 40,
        scheduledDate: '2026-08-12',
      },
    ];

    const store = useChecksStore();
    const pending = store.setCheck(7, '2026-08-12', { done: true });

    expect(store.checks['7']['2026-08-12']).toEqual({ done: true, actualMinutes: 40 });

    resolvePut({ done: true, actualMinutes: 40 });
    await pending;
    expect(store.checks['7']['2026-08-12']).toEqual({ done: true, actualMinutes: 40 });
  });

  it('clears actualMinutes when undone using returned cell', async () => {
    const store = useChecksStore();
    store.checks = {
      '7': { '2026-08-12': { done: true, actualMinutes: 45 } },
    };
    api.put.mockResolvedValueOnce({ done: false, actualMinutes: null });

    await store.setCheck(7, '2026-08-12', { done: false });

    expect(store.checks['7']['2026-08-12']).toEqual({ done: false, actualMinutes: null });
  });
});
