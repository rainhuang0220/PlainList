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
