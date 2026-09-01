import { beforeEach, describe, expect, it, vi } from 'vitest';

const listen = vi.hoisted(() => vi.fn((_port: number, callback: () => void) => {
  callback();
  return { close: vi.fn() };
}));
const startReviewScheduler = vi.hoisted(() => vi.fn(() => vi.fn()));
const startActivityScheduler = vi.hoisted(() => vi.fn(() => vi.fn()));

vi.mock('./app', () => ({ createApp: () => ({ listen }) }));
vi.mock('./config/env', () => ({ env: { PORT: 3999, BACKGROUND_JOBS_ENABLED: false } }));
vi.mock('./modules/plugins/widgetRunner', () => ({ startInstalledWidgets: vi.fn(), stopWidget: vi.fn() }));
vi.mock('./modules/reviews/weeklyReviewSnapshot', () => ({ createWeeklyReviewSnapshotScheduler: startReviewScheduler }));
vi.mock('./modules/activity-knowledge/scheduler', () => ({ createActivityIntelligenceScheduler: startActivityScheduler }));

describe('API background jobs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not start schedulers when an isolated smoke process disables background jobs', async () => {
    await import('./server');

    expect(listen).toHaveBeenCalledWith(3999, expect.any(Function));
    expect(startReviewScheduler).not.toHaveBeenCalled();
    expect(startActivityScheduler).not.toHaveBeenCalled();
  });
});
