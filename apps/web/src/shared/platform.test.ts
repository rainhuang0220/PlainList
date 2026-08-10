import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
    getPlatform: vi.fn(),
  },
}));

import { Capacitor } from '@capacitor/core';
import { isAndroid, isNativePlatform } from './platform';

describe('platform', () => {
  beforeEach(() => {
    vi.mocked(Capacitor.isNativePlatform).mockReset();
    vi.mocked(Capacitor.getPlatform).mockReset();
  });

  it('mirrors Capacitor.isNativePlatform', () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    expect(isNativePlatform()).toBe(true);
  });

  it('detects android only when native + platform android', () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
    expect(isAndroid()).toBe(true);

    vi.mocked(Capacitor.getPlatform).mockReturnValue('ios');
    expect(isAndroid()).toBe(false);
  });
});
