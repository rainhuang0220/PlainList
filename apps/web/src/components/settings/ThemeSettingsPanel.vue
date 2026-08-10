<template>
  <div class="theme-settings">
    <p class="theme-hint">{{ t('settings.theme_hint', '选择一套主题色，立即应用到界面。') }}</p>
    <div v-if="loading" class="theme-loading">{{ t('settings.theme_loading', '加载主题…') }}</div>
    <div v-else class="theme-grid">
      <button
        v-for="theme in themes"
        :key="theme.id"
        type="button"
        class="theme-card"
        :class="{ active: marketplace.activeThemeId === theme.id }"
        @click="onSelect(theme.id)"
      >
        <div class="theme-swatches">
          <span
            v-for="key in swatchKeys"
            :key="key"
            class="swatch"
            :style="{ background: theme.vars[key] }"
          />
        </div>
        <div class="theme-name">{{ theme.name }}</div>
      </button>
    </div>
    <p v-if="error" class="theme-error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import type { ThemeDefinition } from '@plainlist/shared';
import { onMounted, ref } from 'vue';
import { useMarketplaceStore } from '@/features/plugins/model/useMarketplaceStore';
import { useI18nStore } from '@/shared/i18n/useI18nStore';

const marketplace = useMarketplaceStore();
const i18n = useI18nStore();
const themes = ref<ThemeDefinition[]>([]);
const loading = ref(true);
const error = ref('');
const swatchKeys = ['--bg', '--surface', '--dark', '--mid', '--muted'] as const;

function t(key: string, fallback: string) {
  return i18n.t(key, fallback);
}

async function onSelect(themeId: string) {
  error.value = '';
  try {
    await marketplace.saveTheme(themeId);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'save failed';
  }
}

onMounted(async () => {
  loading.value = true;
  try {
    await marketplace.ensureThemePack();
    themes.value = await marketplace.listThemePackThemes();
    await marketplace.loadActiveTheme();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'load failed';
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.theme-hint { font-size: 13px; color: var(--muted, #5a5a60); margin: 0 0 16px; }
.theme-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
.theme-card {
  border: 1px solid rgba(28,28,32,0.12);
  background: var(--surface, #fff);
  border-radius: 12px;
  padding: 12px;
  text-align: left;
  cursor: pointer;
}
.theme-card.active { outline: 2px solid var(--dark, #1c1c20); }
.theme-swatches { display: flex; gap: 4px; margin-bottom: 8px; }
.swatch { width: 16px; height: 16px; border-radius: 4px; border: 1px solid rgba(0,0,0,0.08); }
.theme-name { font-size: 13px; font-weight: 500; }
.theme-error { color: #b42318; font-size: 13px; }
.theme-loading { font-size: 13px; color: var(--muted, #5a5a60); }
</style>
