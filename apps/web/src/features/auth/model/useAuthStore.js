import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
const TOKEN_KEY = 'pl_token';
export const useAuthStore = defineStore('auth', () => {
    const token = ref(sessionStorage.getItem(TOKEN_KEY));
    const currentUser = ref(null);
    const isAdmin = ref(false);
    const isLoggedIn = computed(() => Boolean(token.value && currentUser.value));
    function setAuth(nextToken, user, admin) {
        token.value = nextToken;
        currentUser.value = user;
        isAdmin.value = admin;
        sessionStorage.setItem(TOKEN_KEY, nextToken);
    }
    function logout() {
        token.value = null;
        currentUser.value = null;
        isAdmin.value = false;
        sessionStorage.removeItem(TOKEN_KEY);
    }
    return {
        token,
        currentUser,
        isAdmin,
        isLoggedIn,
        setAuth,
        logout,
    };
});
