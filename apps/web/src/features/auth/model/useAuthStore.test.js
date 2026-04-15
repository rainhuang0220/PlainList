import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from './useAuthStore';
function createSessionStorageMock() {
    let state = {};
    return {
        getItem: vi.fn((key) => state[key] ?? null),
        setItem: vi.fn((key, value) => {
            state[key] = value;
        }),
        removeItem: vi.fn((key) => {
            delete state[key];
        }),
        clear: vi.fn(() => {
            state = {};
        }),
    };
}
const sessionStorageMock = createSessionStorageMock();
Object.defineProperty(globalThis, 'sessionStorage', {
    value: sessionStorageMock,
    configurable: true,
});
describe('useAuthStore', () => {
    beforeEach(() => {
        sessionStorageMock.clear();
        vi.clearAllMocks();
        setActivePinia(createPinia());
    });
    it('persists login state and clears it on logout', () => {
        const auth = useAuthStore();
        auth.setAuth('token-123', 'alice', true);
        expect(auth.token).toBe('token-123');
        expect(auth.currentUser).toBe('alice');
        expect(auth.isAdmin).toBe(true);
        expect(auth.isLoggedIn).toBe(true);
        expect(sessionStorageMock.setItem).toHaveBeenCalledWith('pl_token', 'token-123');
        auth.logout();
        expect(auth.token).toBeNull();
        expect(auth.currentUser).toBeNull();
        expect(auth.isAdmin).toBe(false);
        expect(auth.isLoggedIn).toBe(false);
        expect(sessionStorageMock.removeItem).toHaveBeenCalledWith('pl_token');
    });
    it('restores token from session storage before user hydration', () => {
        sessionStorageMock.setItem('pl_token', 'demo-token');
        const auth = useAuthStore();
        expect(auth.token).toBe('demo-token');
        expect(auth.currentUser).toBeNull();
        expect(auth.isLoggedIn).toBe(false);
    });
});
