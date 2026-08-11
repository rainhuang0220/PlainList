import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { clearToken, getToken, setToken } from '@/shared/auth/tokenStorage';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(null);
  const currentUser = ref<string | null>(null);
  const isAdmin = ref(false);

  const isLoggedIn = computed(() => Boolean(token.value && currentUser.value));

  async function hydrateFromStorage() {
    token.value = await getToken();
  }

  async function setAuth(nextToken: string, user: string, admin: boolean) {
    // Set session state first so App can react (load dashboard) in the same turn.
    // Persisting the token must not gate UI: awaiting storage yields a microtask,
    // Vue unmounts the auth screen, and a late @login emit is dropped → blank UI.
    token.value = nextToken;
    currentUser.value = user;
    isAdmin.value = admin;
    await setToken(nextToken);
  }

  async function logout() {
    token.value = null;
    currentUser.value = null;
    isAdmin.value = false;
    await clearToken();
  }

  return {
    token,
    currentUser,
    isAdmin,
    isLoggedIn,
    hydrateFromStorage,
    setAuth,
    logout,
  };
});
