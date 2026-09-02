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
    expect(card.body).toContain('本机');
  });

  it('shows a compact connected state with conversation counts', () => {
    const card = presentChatgptActivityCard({
      isDesktop: true,
      localStatus: 'enabled',
      rootName: 'chatgpt-local-sync',
      connection: { viaDesktop: true, lastSyncedAt: '2026-09-02T15:41:00.000Z', checked: 105, processed: 76 },
      lastResult: { changed: 0, activities: 0, checked: 105, processed: 76 },
    });
    expect(card.variant).toBe('desktop-connected');
    expect(card.headline).toBe('自动记录中');
    expect(card.countLine).toContain('105 个对话');
    expect(card.countLine).toContain('已处理 76');
    expect(card.todayLine).toBeNull();
  });

  it('explains that web cannot pick a local archive when disconnected', () => {
    const card = presentChatgptActivityCard({
      isDesktop: false,
      localStatus: 'disabled',
      rootName: null,
      connection: { viaDesktop: false, lastSyncedAt: null, displayState: 'not_connected' },
      lastResult: null,
    });
    expect(card.variant).toBe('web-disconnected');
    expect(card.headline).toBe('尚未连接桌面资料库');
    expect(card.body).toContain('PlainList Desktop');
    expect(card.showDesktopDownload).toBe(true);
  });

  it('shows bootstrap progress instead of a generic empty journal copy', () => {
    const card = presentChatgptActivityCard({
      isDesktop: false,
      localStatus: 'disabled',
      rootName: null,
      connection: {
        viaDesktop: true,
        lastSyncedAt: '2026-09-02T15:41:00.000Z',
        displayState: 'bootstrapping',
        checked: 40,
        processed: 12,
      },
      lastResult: null,
    });
    expect(card.variant).toBe('web-bootstrapping');
    expect(card.headline).toBe('正在建立历史活动记录');
    expect(card.progressLine).toContain('12 / 40');
  });

  it('shows derived desktop connection on web and mobile', () => {
    const card = presentChatgptActivityCard({
      isDesktop: false,
      localStatus: 'disabled',
      rootName: null,
      connection: { viaDesktop: true, lastSyncedAt: '2026-09-02T15:41:00.000Z', checked: 105, processed: 76 },
      lastResult: { changed: 3, activities: 2, checked: 105, processed: 76 },
    });
    expect(card.variant).toBe('web-connected');
    expect(card.headline).toBe('自动记录中');
    expect(card.countLine).toContain('105 个对话');
  });
});
