import {
  DEFAULT_LOCALE,
  LOCALE_TRANSLATIONS,
  type AppLocale,
  type PluginManifest,
  type PluginTranslationBundle,
} from '@plainlist/shared';
import { defineStore } from 'pinia';
import { reactive, ref } from 'vue';

export const useI18nStore = defineStore('i18n', () => {
  const messages = reactive<Record<string, string>>({});
  const lists = reactive<Record<string, string[]>>({});
  const locale = ref<AppLocale>(DEFAULT_LOCALE);
  const manifestOverlays = ref<PluginManifest[]>([]);

  function clearRecord(record: Record<string, unknown>) {
    Object.keys(record).forEach((key) => {
      delete record[key];
    });
  }

  function applyTranslationBundle(bundle?: PluginTranslationBundle) {
    if (!bundle) {
      return;
    }

    Object.entries(bundle.messages ?? {}).forEach(([key, value]) => {
      messages[key] = value;
    });

    Object.entries(bundle.lists ?? {}).forEach(([key, value]) => {
      lists[key] = [...value];
    });
  }

  function rebuildTranslations() {
    clearRecord(messages);
    clearRecord(lists);

    applyTranslationBundle(LOCALE_TRANSLATIONS[locale.value]);

    manifestOverlays.value
      .filter((manifest) => manifest.category !== 'language')
      .forEach((manifest) => applyTranslationBundle(manifest.translation));
  }

  function setLocale(nextLocale: AppLocale) {
    locale.value = nextLocale;
    rebuildTranslations();
  }

  function applyManifests(manifests: PluginManifest[]) {
    manifestOverlays.value = [...manifests];
    rebuildTranslations();
  }

  function format(value: string, params?: Record<string, string | number>) {
    if (!params) {
      return value;
    }

    return Object.entries(params).reduce(
      (result, [key, paramValue]) => result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(paramValue)),
      value,
    );
  }

  function t(key: string, fallback?: string, params?: Record<string, string | number>) {
    return format(messages[key] ?? fallback ?? key, params);
  }

  function L(key: string, fallback: string[]) {
    return lists[key] ?? fallback;
  }

  function clear() {
    manifestOverlays.value = [];
    rebuildTranslations();
  }

  rebuildTranslations();

  return {
    messages,
    lists,
    locale,
    setLocale,
    applyManifests,
    t,
    L,
    clear,
  };
});
