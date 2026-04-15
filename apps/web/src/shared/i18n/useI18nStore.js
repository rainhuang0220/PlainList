import { DEFAULT_LOCALE, LOCALE_TRANSLATIONS, } from '@plainlist/shared';
import { defineStore } from 'pinia';
import { reactive, ref } from 'vue';
export const useI18nStore = defineStore('i18n', () => {
    const messages = reactive({});
    const lists = reactive({});
    const locale = ref(DEFAULT_LOCALE);
    const manifestOverlays = ref([]);
    function clearRecord(record) {
        Object.keys(record).forEach((key) => {
            delete record[key];
        });
    }
    function applyTranslationBundle(bundle) {
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
    function setLocale(nextLocale) {
        locale.value = nextLocale;
        rebuildTranslations();
    }
    function applyManifests(manifests) {
        manifestOverlays.value = [...manifests];
        rebuildTranslations();
    }
    function format(value, params) {
        if (!params) {
            return value;
        }
        return Object.entries(params).reduce((result, [key, paramValue]) => result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(paramValue)), value);
    }
    function t(key, fallback, params) {
        return format(messages[key] ?? fallback ?? key, params);
    }
    function L(key, fallback) {
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
