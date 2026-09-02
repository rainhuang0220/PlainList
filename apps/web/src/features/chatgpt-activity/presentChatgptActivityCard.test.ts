import { describe, expect, it } from 'vitest';
import { presentChatgptActivityCard } from './presentChatgptActivityCard';

describe('presentChatgptActivityCard', () => {
  it('does not show a four-row technical ledger when desktop is disconnected', () => {
    const card = presentChatgptActivityCard({
      isDesktop: true,
      localStatus: 'disabled',
      rootName: null,
      connection: { viaDesktop: false, lastSyncedAt: null },
      lastResult: null,
    });
    expect(card.variant).toBe('desktop-disconnected');
    expect(card.connected).toBe(false);
    expect(card.body).toContain('完整对话保留在本机');
  });

  it('shows a living connected state on desktop instead of unused status rows', () => {
    const card = presentChatgptActivityCard({
      isDesktop: true,
      localStatus: 'enabled',
      rootName: 'chatgpt-local-sync',
      connection: { viaDesktop: true, lastSyncedAt: '2026-09-02T15:41:00.000Z' },
      lastResult: { changed: 6, activities: 4 },
    });
    expect(card.variant).toBe('desktop-connected');
    expect(card.headline).toBe('自动记录中');
    expect(card.todayLine).toContain('6 个对话');
    expect(card.todayLine).toContain('4 条活动记录');
  });

  it('explains that web cannot pick a local archive when disconnected', () => {
    const card = presentChatgptActivityCard({
      isDesktop: false,
      localStatus: 'disabled',
      rootName: null,
      connection: { viaDesktop: false, lastSyncedAt: null },
      lastResult: null,
    });
    expect(card.variant).toBe('web-disconnected');
    expect(card.body).toContain('PlainList Desktop');
    expect(card.body).not.toContain('资料库');
  });

  it('shows derived desktop connection on web and mobile', () => {
    const card = presentChatgptActivityCard({
      isDesktop: false,
      localStatus: 'disabled',
      rootName: null,
      connection: { viaDesktop: true, lastSyncedAt: '2026-09-02T15:41:00.000Z' },
      lastResult: { changed: 3, activities: 2 },
    });
    expect(card.variant).toBe('web-connected');
    expect(card.headline).toContain('Desktop');
  });
});
