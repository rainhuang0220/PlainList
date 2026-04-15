import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { DEFAULT_LOCALE, type AppLocale } from '@plainlist/shared';

const LOCALE_STORAGE_KEY = 'pl_locale';

export const useLocaleStore = defineStore('locale', () => {
  const locale = ref<AppLocale>((localStorage.getItem(LOCALE_STORAGE_KEY) as AppLocale) || DEFAULT_LOCALE);

  const switchLabel = computed(() => (locale.value === 'en' ? '中文' : 'EN'));

  function setLocale(nextLocale: AppLocale) {
    locale.value = nextLocale;
    localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
  }

  function toggleLocale() {
    setLocale(locale.value === 'en' ? 'zh-CN' : 'en');
  }

  return {
    locale,
    switchLabel,
    setLocale,
    toggleLocale,
  };
});
