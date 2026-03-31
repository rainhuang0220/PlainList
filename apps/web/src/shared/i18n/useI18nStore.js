import { defineStore } from 'pinia';
import { reactive } from 'vue';
export const useI18nStore = defineStore('i18n', () => {
    const messages = reactive({});
    const lists = reactive({});
    function clearRecord(record) {
        Object.keys(record).forEach((key) => {
            delete record[key];
        });
    }
    function applyManifests(manifests) {
        clearRecord(messages);
        clearRecord(lists);
        manifests.forEach((manifest) => {
            const translation = manifest.translation;
            if (!translation) {
                return;
            }
            Object.entries(translation.messages ?? {}).forEach(([key, value]) => {
                messages[key] = value;
            });
            Object.entries(translation.lists ?? {}).forEach(([key, value]) => {
                lists[key] = [...value];
            });
        });
    }
    function t(key, fallback) {
        return messages[key] ?? fallback ?? key;
    }
    function L(key, fallback) {
        return lists[key] ?? fallback;
    }
    function clear() {
        clearRecord(messages);
        clearRecord(lists);
    }
    return {
        messages,
        lists,
        applyManifests,
        t,
        L,
        clear,
    };
});
