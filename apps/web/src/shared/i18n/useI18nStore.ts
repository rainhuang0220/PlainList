import type { PluginManifest } from '@plainlist/shared';
import { defineStore } from 'pinia';
import { reactive } from 'vue';

export const useI18nStore = defineStore('i18n', () => {
  const messages = reactive<Record<string, string>>({});
  const lists = reactive<Record<string, string[]>>({});

  function clearRecord(record: Record<string, unknown>) {
    Object.keys(record).forEach((key) => {
      delete record[key];
    });
  }

  function applyManifests(manifests: PluginManifest[]) {
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

  function t(key: string, fallback?: string) {
    return messages[key] ?? fallback ?? key;
  }

  function L(key: string, fallback: string[]) {
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
