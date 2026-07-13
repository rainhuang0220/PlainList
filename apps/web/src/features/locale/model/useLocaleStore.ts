import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { AppLocale } from '@plainlist/shared';
import { DEFAULT_LOCALE } from '@plainlist/shared';

/** Fixed zh-CN for dashboard until language switching is designed (see README TODO). */
export const useLocaleStore = defineStore('locale', () => {
  const locale = ref<AppLocale>(DEFAULT_LOCALE);

  function setLocale(nextLocale: AppLocale) {
    locale.value = nextLocale;
  }

  return {
    locale,
    setLocale,
  };
});
