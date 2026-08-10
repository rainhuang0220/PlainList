import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const memory = new Map<string, string>();

vi.mock('@/shared/auth/tokenStorage', () => ({
  TOKEN_KEY: 'pl_token',
  getToken: vi.fn(async () => memory.get('pl_token') ?? null),
  setToken: vi.fn(async (token: string) => {
    memory.set('pl_token', token);
  }),
  clearToken: vi.fn(async () => {
    memory.delete('pl_token');
  }),
}));

import { clearToken, getToken, setToken } from '@/shared/auth/tokenStorage';
import { useAuthStore } from './useAuthStore';

describe('useAuthStore', () => {
  beforeEach(() => {
    memory.clear();
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('persists login state and clears it on logout', async () => {
    const auth = useAuthStore();
    await auth.setAuth('token-123', 'alice', true);

    expect(auth.token).toBe('token-123');
    expect(auth.currentUser).toBe('alice');
    expect(auth.isAdmin).toBe(true);
    expect(auth.isLoggedIn).toBe(true);
    expect(setToken).toHaveBeenCalledWith('token-123');

    await auth.logout();

    expect(auth.token).toBeNull();
    expect(auth.currentUser).toBeNull();
    expect(auth.isAdmin).toBe(false);
    expect(auth.isLoggedIn).toBe(false);
    expect(clearToken).toHaveBeenCalled();
  });

  it('hydrates token from storage before user hydration', async () => {
    memory.set('pl_token', 'demo-token');
    const auth = useAuthStore();
    await auth.hydrateFromStorage();

    expect(getToken).toHaveBeenCalled();
    expect(auth.token).toBe('demo-token');
    expect(auth.currentUser).toBeNull();
    expect(auth.isLoggedIn).toBe(false);
  });
});
