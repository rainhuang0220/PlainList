<template>
  <div id="plugin-view" class="open">
    <div class="pv-sidebar">
      <div class="pv-header">
        <span class="pv-title">{{ t('plugins.title', 'Plugins') }}</span>
        <button id="pv-close" @click="$emit('close')">x</button>
      </div>
      <input
        id="pv-search"
        v-model="filterQ"
        :placeholder="t('plugins.search', 'Search plugins')"
        autocomplete="off"
      >
      <div id="pv-tabs">
        <button
          v-for="category in categories"
          :key="category.key"
          :class="['pv-tab', filterCat === category.key ? 'active' : '']"
          @click="filterCat = category.key"
        >
          {{ category.label }}
        </button>
      </div>
      <div id="pv-list">
        <div
          v-for="plugin in filtered"
          :key="plugin.id"
          :class="['pv-item', activeId === plugin.id ? 'active' : '']"
          @click="activeId = plugin.id"
        >
          <div class="pv-item-name">{{ plugin.name }}</div>
          <div class="pv-item-desc">{{ plugin.description }}</div>
          <span v-if="plugins.installedIds.has(plugin.id)" class="pv-item-badge">
            {{ t('plugins.installed', 'Installed') }}
          </span>
        </div>
        <div v-if="!filtered.length" style="padding:20px 16px;font-size:12px;color:var(--muted)">
          {{ t('plugins.empty', 'No plugins found') }}
        </div>
      </div>
    </div>

    <div class="pv-detail">
      <div v-if="!activePlugin" class="pv-detail-empty">
        {{ t('plugins.select', 'Select a plugin') }}
      </div>
      <template v-else>
        <div class="pv-detail-name">{{ activePlugin.name }}</div>
        <div class="pv-detail-meta">
          <span>v{{ activePlugin.version }}</span>
          <span>{{ activePlugin.author }}</span>
          <span>{{ activePlugin.category }}</span>
        </div>
        <div class="pv-detail-desc">{{ activePlugin.longDescription || activePlugin.description }}</div>

        <template v-if="activePlugin.category === 'theme' && activePlugin.themes">
          <div class="pv-section-label">{{ t('plugins.themes', 'Themes') }}</div>
          <div class="pv-theme-grid">
            <div
              v-for="theme in activePlugin.themes"
              :key="theme.id"
              :class="['pv-swatch', selectedThemeId === theme.id ? 'active' : '']"
              @click="onSwatchClick(theme)"
            >
              <div class="pv-swatch-colors">
                <span
                  v-for="colorKey in ['--bg', '--surface', '--dark', '--mid', '--muted']"
                  :key="colorKey"
                  :style="{ background: theme.vars[colorKey] }"
                />
              </div>
              <div class="pv-swatch-name">{{ theme.name }}</div>
            </div>
          </div>
          <div class="pv-preview-area">
            <div v-if="previewTheme" class="pv-preview-cards">
              <div class="pv-card" :style="cardStyle(previewTheme.vars)">
                <div class="pv-card-title" :style="{ color: previewTheme.vars['--dark'] }">
                  {{ t('plugins.preview', 'Preview') }}
                </div>
                <div class="pv-card-body" :style="{ color: previewTheme.vars['--mid'] }">
                  {{ t('plugins.preview_text', 'Sample text in this theme') }}
                </div>
                <div class="pv-card-muted" :style="{ color: previewTheme.vars['--muted'] }">
                  {{ t('plugins.preview_muted', 'Muted text') }}
                </div>
                <div class="pv-card-tag" :style="{ background: previewTheme.vars['--faint'], color: previewTheme.vars['--muted'] }">
                  {{ t('plugins.preview_tag', 'tag') }}
                </div>
              </div>
            </div>
          </div>
        </template>

        <div class="pv-actions">
          <template v-if="plugins.installedIds.has(activePlugin.id)">
            <button
              v-if="activePlugin.category === 'theme'"
              class="pv-btn"
              :disabled="saving"
              @click="applyTheme"
            >
              {{ t('plugins.apply', 'Apply') }}
            </button>
            <button class="pv-btn" :disabled="saving" @click="uninstall">
              {{ t('plugins.uninstall', 'Uninstall') }}
            </button>
          </template>
          <template v-else>
            <button class="pv-btn primary" :disabled="saving" @click="install">
              {{ t('plugins.install', 'Install') }}
            </button>
          </template>
        </div>
        <div class="pv-hint">
          {{ t('plugins.restart_hint', 'Changes take effect after re-login') }}
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PluginManifest, ThemeDefinition, ThemeVars } from '@plainlist/shared';
import type { CSSProperties } from 'vue';
import { computed, onMounted, ref, watch } from 'vue';
import { usePluginsStore } from '@/features/plugins/model/usePluginsStore';
import { useI18nStore } from '@/shared/i18n/useI18nStore';

defineEmits(['close']);

const plugins = usePluginsStore();
const i18n = useI18nStore();

const filterQ = ref('');
const filterCat = ref<'all' | 'theme'>('all');
const activeId = ref<string | null>(null);
const selectedThemeId = ref<string | null>(null);
const previewTheme = ref<ThemeDefinition | null>(null);
const saving = ref(false);

function t(key: string, fallback: string) {
  return i18n.t(key, fallback);
}

const categories = computed<Array<{ key: 'all' | 'theme'; label: string }>>(() => {
  const base: Array<{ key: 'all' | 'theme'; label: string }> = [
    { key: 'all', label: t('plugins.tab.all', 'All') },
  ];
  if (plugins.available.some((plugin) => plugin.category === 'theme')) {
    base.push({ key: 'theme', label: t('plugins.tab.theme', 'Theme') });
  }
  return base;
});

const filtered = computed(() => (
  plugins.available.filter((plugin) => {
    const matchesCategory = filterCat.value === 'all' || plugin.category === filterCat.value;
    const keyword = filterQ.value.toLowerCase();
    const matchesQuery = !keyword
      || plugin.name.toLowerCase().includes(keyword)
      || (plugin.description || '').toLowerCase().includes(keyword);
    return matchesCategory && matchesQuery;
  })
));

const activePlugin = computed<PluginManifest | null>(
  () => plugins.available.find((plugin) => plugin.id === activeId.value) || null,
);

watch(activePlugin, async (plugin) => {
  if (!plugin || plugin.category !== 'theme' || !plugin.themes) {
    previewTheme.value = null;
    return;
  }

  try {
    const { themeId } = await plugins.getActiveThemeId();
    selectedThemeId.value = themeId || plugin.themes[0]?.id || null;
  } catch {
    selectedThemeId.value = plugin.themes[0]?.id || null;
  }

  previewTheme.value = plugin.themes.find((theme) => theme.id === selectedThemeId.value) || plugin.themes[0] || null;
});

function onSwatchClick(theme: ThemeDefinition) {
  selectedThemeId.value = theme.id;
  previewTheme.value = theme;
  plugins.previewTheme(theme.vars);
}

function cardStyle(vars: ThemeVars): CSSProperties {
  return {
    background: vars['--surface'],
    border: `1px solid ${vars['--faint']}`,
    borderRadius: '6px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxWidth: '280px',
  };
}

async function install() {
  if (!activeId.value) {
    return;
  }

  saving.value = true;
  try {
    await plugins.install(activeId.value);
  } finally {
    saving.value = false;
  }
}

async function uninstall() {
  if (!activeId.value) {
    return;
  }

  saving.value = true;
  try {
    await plugins.uninstall(activeId.value);
  } finally {
    saving.value = false;
  }
}

async function applyTheme() {
  if (!selectedThemeId.value) {
    return;
  }

  saving.value = true;
  try {
    await plugins.saveTheme(selectedThemeId.value);
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await Promise.all([plugins.loadAvailable(), plugins.loadInstalled()]);
});
</script>
