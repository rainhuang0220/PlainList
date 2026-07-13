<template>
  <div id="marketplace-view" class="open">
    <div class="mp-sidebar">
      <div class="mp-header">
        <span class="mp-title">{{ t('marketplace.title', 'Marketplace') }}</span>
        <button class="mp-close" @click="$emit('close')">×</button>
      </div>

      <input
        v-model="searchQuery"
        class="mp-search"
        :placeholder="t('marketplace.search', 'Search plugins...')"
        autocomplete="off"
        @input="onSearchInput"
      >

      <div class="mp-tabs">
        <button
          v-for="cat in categories"
          :key="cat.key"
          :class="['mp-tab', activeCategory === cat.key ? 'active' : '']"
          @click="onCategoryChange(cat.key)"
        >
          {{ cat.label }}
        </button>
      </div>

      <div class="mp-sort">
        <button
          v-for="s in sortOptions"
          :key="s.key"
          :class="['mp-sort-btn', activeSort === s.key ? 'active' : '']"
          @click="onSortChange(s.key)"
        >
          {{ s.label }}
        </button>
      </div>

      <div class="mp-list">
        <div
          v-for="plugin in marketplace.searchResult.plugins"
          :key="plugin.id"
          :class="['mp-item', selectedId === plugin.id ? 'active' : '']"
          @click="onSelectPlugin(plugin.id)"
        >
          <div class="mp-item-row">
            <div class="mp-item-name">{{ plugin.name }}</div>
            <span v-if="marketplace.isInstalled(plugin.id)" class="mp-badge installed">
              {{ t('marketplace.installed', 'Installed') }}
            </span>
            <span v-if="plugin.isOfficial" class="mp-badge official">
              {{ t('marketplace.official', 'Official') }}
            </span>
          </div>
          <div class="mp-item-meta">
            <span>{{ plugin.author }}</span>
            <span>v{{ plugin.latestVersion }}</span>
            <span>{{ plugin.downloadCount }} {{ t('marketplace.downloads', 'installs') }}</span>
          </div>
          <div class="mp-item-desc">{{ plugin.description }}</div>
          <div v-if="plugin.tags.length" class="mp-item-tags">
            <span v-for="tag in plugin.tags.slice(0, 3)" :key="tag" class="mp-tag">{{ tag }}</span>
          </div>
        </div>

        <div v-if="marketplace.loading" class="mp-loading">
          <div class="mp-spinner" />
        </div>

        <div v-else-if="!marketplace.searchResult.plugins.length" class="mp-empty">
          {{ t('marketplace.empty', 'No plugins found') }}
        </div>
      </div>

      <div v-if="marketplace.searchResult.total > marketplace.searchResult.pageSize" class="mp-pagination">
        <button
          :disabled="marketplace.searchResult.page <= 1"
          class="mp-page-btn"
          @click="changePage(-1)"
        >
          ‹
        </button>
        <span class="mp-page-info">
          {{ marketplace.searchResult.page }} / {{ Math.ceil(marketplace.searchResult.total / marketplace.searchResult.pageSize) }}
        </span>
        <button
          :disabled="marketplace.searchResult.page * marketplace.searchResult.pageSize >= marketplace.searchResult.total"
          class="mp-page-btn"
          @click="changePage(1)"
        >
          ›
        </button>
      </div>
    </div>

    <div class="mp-detail">
      <div v-if="!marketplace.currentDetail" class="mp-detail-empty">
        {{ t('marketplace.select', 'Select a plugin to view details') }}
      </div>

      <template v-else>
        <div class="mp-detail-header">
          <div class="mp-detail-info">
            <div class="mp-detail-name">{{ marketplace.currentDetail.name }}</div>
            <div class="mp-detail-meta">
              <span>{{ marketplace.currentDetail.author }}</span>
              <span>{{ marketplace.currentDetail.category }}</span>
              <span v-if="marketplace.currentDetail.license">{{ marketplace.currentDetail.license }}</span>
              <span>v{{ marketplace.currentDetail.latestVersion }}</span>
            </div>
          </div>
          <div class="mp-detail-actions">
            <template v-if="marketplace.isInstalled(marketplace.currentDetail.id)">
              <button
                v-if="marketplace.isEnabled(marketplace.currentDetail.id)"
                class="mp-btn"
                :disabled="busy"
                @click="onDisable"
              >
                {{ t('marketplace.disable', 'Disable') }}
              </button>
              <button
                v-else
                class="mp-btn primary"
                :disabled="busy"
                @click="onEnable"
              >
                {{ t('marketplace.enable', 'Enable') }}
              </button>
              <button class="mp-btn danger" :disabled="busy" @click="onUninstall">
                {{ t('marketplace.uninstall', 'Uninstall') }}
              </button>
            </template>
            <template v-else>
              <button class="mp-btn primary" :disabled="busy" @click="onInstall">
                {{ t('marketplace.install', 'Install') }}
              </button>
            </template>
          </div>
        </div>

        <div class="mp-detail-body">
          <div class="mp-section">
            <div class="mp-section-label">{{ t('marketplace.description', 'Description') }}</div>
            <div class="mp-detail-desc">
              {{ marketplace.currentDetail.longDescription || marketplace.currentDetail.description }}
            </div>
          </div>

          <div v-if="marketplace.currentDetail.capabilities.length" class="mp-section">
            <div class="mp-section-label">{{ t('marketplace.capabilities', 'Capabilities') }}</div>
            <div class="mp-caps">
              <span v-for="cap in marketplace.currentDetail.capabilities" :key="cap" class="mp-cap">
                {{ cap }}
              </span>
            </div>
          </div>

          <div v-if="marketplace.currentDetail.tags.length" class="mp-section">
            <div class="mp-section-label">{{ t('marketplace.tags', 'Tags') }}</div>
            <div class="mp-tags-row">
              <span v-for="tag in marketplace.currentDetail.tags" :key="tag" class="mp-tag">{{ tag }}</span>
            </div>
          </div>

          <div v-if="marketplace.currentManifest?.themes" class="mp-section">
            <div class="mp-section-label">{{ t('marketplace.themes', 'Themes') }}</div>
            <div class="mp-theme-grid">
              <div
                v-for="theme in marketplace.currentManifest.themes"
                :key="theme.id"
                class="mp-swatch"
              >
                <div class="mp-swatch-colors">
                  <span
                    v-for="key in ['--bg', '--surface', '--dark', '--mid', '--muted']"
                    :key="key"
                    :style="{ background: theme.vars[key] }"
                  />
                </div>
                <div class="mp-swatch-name">{{ theme.name }}</div>
              </div>
            </div>
          </div>

          <div v-if="marketplace.currentVersions.length" class="mp-section">
            <div class="mp-section-label">{{ t('marketplace.versions', 'Version History') }}</div>
            <div class="mp-versions">
              <div
                v-for="ver in marketplace.currentVersions.slice(0, 5)"
                :key="ver.version"
                class="mp-version-item"
              >
                <div class="mp-version-row">
                  <span class="mp-version-num">v{{ ver.version }}</span>
                  <span v-if="ver.isLatest" class="mp-badge official">latest</span>
                  <span class="mp-version-date">{{ formatDate(ver.publishedAt) }}</span>
                </div>
                <div v-if="ver.changelog" class="mp-version-log">{{ ver.changelog }}</div>
              </div>
            </div>
          </div>

          <div v-if="marketplace.currentDetail.repoUrl || marketplace.currentDetail.homepageUrl" class="mp-section">
            <div class="mp-section-label">{{ t('marketplace.links', 'Links') }}</div>
            <div class="mp-links">
              <a v-if="marketplace.currentDetail.repoUrl" :href="marketplace.currentDetail.repoUrl" target="_blank" class="mp-link">
                Repository
              </a>
              <a v-if="marketplace.currentDetail.homepageUrl" :href="marketplace.currentDetail.homepageUrl" target="_blank" class="mp-link">
                Homepage
              </a>
            </div>
          </div>

          <div class="mp-section">
            <div class="mp-section-label">{{ t('marketplace.stats', 'Stats') }}</div>
            <div class="mp-stats">
              <div class="mp-stat">
                <span class="mp-stat-value">{{ marketplace.currentDetail.downloadCount }}</span>
                <span class="mp-stat-label">{{ t('marketplace.total_installs', 'Total Installs') }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PluginCategory } from '@plainlist/shared';
import { computed, onMounted, ref } from 'vue';
import { useMarketplaceStore } from '@/features/plugins/model/useMarketplaceStore';
import { useI18nStore } from '@/shared/i18n/useI18nStore';

defineEmits(['close']);

const marketplace = useMarketplaceStore();
const i18n = useI18nStore();

const searchQuery = ref('');
const activeCategory = ref<PluginCategory | 'all'>('all');
const activeSort = ref<'downloads' | 'newest' | 'updated'>('downloads');
const selectedId = ref<string | null>(null);
const busy = ref(false);

let searchTimer: ReturnType<typeof setTimeout> | null = null;

function t(key: string, fallback: string) {
  return i18n.t(key, fallback);
}

const categories = computed(() => [
  { key: 'all' as const, label: t('marketplace.cat.all', 'All') },
  { key: 'theme' as const, label: t('marketplace.cat.theme', 'Theme') },
  { key: 'widget' as const, label: t('marketplace.cat.widget', 'Widget') },
  { key: 'language' as const, label: t('marketplace.cat.language', 'Language') },
]);

const sortOptions = computed(() => [
  { key: 'downloads' as const, label: t('marketplace.sort.popular', 'Popular') },
  { key: 'newest' as const, label: t('marketplace.sort.newest', 'Newest') },
  { key: 'updated' as const, label: t('marketplace.sort.updated', 'Updated') },
]);

function doSearch() {
  marketplace.search({
    q: searchQuery.value || undefined,
    category: activeCategory.value,
    sortBy: activeSort.value,
  });
}

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(doSearch, 300);
}

function onCategoryChange(cat: PluginCategory | 'all') {
  activeCategory.value = cat;
  doSearch();
}

function onSortChange(sort: 'downloads' | 'newest' | 'updated') {
  activeSort.value = sort;
  doSearch();
}

function onSelectPlugin(id: string) {
  selectedId.value = id;
  marketplace.loadDetail(id);
}

function changePage(delta: number) {
  const nextPage = marketplace.searchResult.page + delta;
  marketplace.search({
    q: searchQuery.value || undefined,
    category: activeCategory.value,
    sortBy: activeSort.value,
    page: nextPage,
  });
}

async function onInstall() {
  if (!marketplace.currentDetail) return;
  busy.value = true;
  try {
    await marketplace.install(marketplace.currentDetail.id);
  } finally {
    busy.value = false;
  }
}

async function onUninstall() {
  if (!marketplace.currentDetail) return;
  busy.value = true;
  try {
    await marketplace.uninstall(marketplace.currentDetail.id);
  } finally {
    busy.value = false;
  }
}

async function onEnable() {
  if (!marketplace.currentDetail) return;
  busy.value = true;
  try {
    await marketplace.toggle(marketplace.currentDetail.id, true);
  } finally {
    busy.value = false;
  }
}

async function onDisable() {
  if (!marketplace.currentDetail) return;
  busy.value = true;
  try {
    await marketplace.toggle(marketplace.currentDetail.id, false);
  } finally {
    busy.value = false;
  }
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString();
  } catch {
    return dateStr;
  }
}

onMounted(async () => {
  await Promise.all([
    marketplace.search(),
    marketplace.loadMyPlugins(),
  ]);
});
</script>

<style scoped>
#marketplace-view {
  position: fixed;
  inset: 0;
  z-index: 8888;
  display: none;
  background: var(--bg);
}

#marketplace-view.open {
  display: flex;
}

.mp-sidebar {
  width: 320px;
  flex-shrink: 0;
  border-right: 1px solid var(--faint);
  display: flex;
  flex-direction: column;
  background: var(--surface);
}

.mp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 14px;
  border-bottom: 1px solid var(--faint);
}

.mp-title {
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--dark);
}

.mp-close {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 20px;
  color: var(--muted);
  padding: 0 2px;
}

.mp-close:hover {
  color: var(--dark);
}

.mp-search {
  margin: 10px 14px 0;
  padding: 7px 12px;
  font-size: 12px;
  font-family: var(--font);
  border: 1px solid var(--faint);
  border-radius: var(--r);
  background: var(--bg);
  color: var(--dark);
  outline: none;
}

.mp-search:focus {
  border-color: var(--mid);
}

.mp-tabs {
  display: flex;
  gap: 4px;
  padding: 8px 14px 4px;
}

.mp-tab {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.04em;
  padding: 3px 8px;
  border-radius: 3px;
  border: 1px solid transparent;
  cursor: pointer;
  background: none;
  color: var(--muted);
}

.mp-tab:hover {
  color: var(--dark);
}

.mp-tab.active {
  border-color: var(--faint);
  color: var(--dark);
  background: var(--faint2);
}

.mp-sort {
  display: flex;
  gap: 2px;
  padding: 4px 14px 8px;
  border-bottom: 1px solid var(--faint2);
}

.mp-sort-btn {
  font-size: 9px;
  font-family: var(--mono);
  letter-spacing: 0.03em;
  padding: 2px 6px;
  border-radius: 2px;
  border: none;
  cursor: pointer;
  background: none;
  color: var(--muted);
}

.mp-sort-btn:hover {
  color: var(--mid);
}

.mp-sort-btn.active {
  color: var(--dark);
  background: var(--faint2);
}

.mp-list {
  overflow-y: auto;
  flex: 1;
}

.mp-item {
  padding: 12px 16px;
  cursor: pointer;
  border-bottom: 1px solid var(--faint2);
  transition: background 0.1s;
}

.mp-item:hover,
.mp-item.active {
  background: var(--faint2);
}

.mp-item-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 3px;
}

.mp-item-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--dark);
}

.mp-badge {
  font-size: 8px;
  font-family: var(--mono);
  letter-spacing: 0.04em;
  padding: 1px 5px;
  border-radius: 2px;
  text-transform: uppercase;
}

.mp-badge.installed {
  background: var(--dark);
  color: var(--surface);
}

.mp-badge.official {
  background: var(--faint);
  color: var(--mid);
}

.mp-item-meta {
  display: flex;
  gap: 8px;
  font-size: 10px;
  color: var(--muted);
  margin-bottom: 4px;
}

.mp-item-desc {
  font-size: 11px;
  color: var(--mid);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.mp-item-tags {
  display: flex;
  gap: 4px;
  margin-top: 6px;
}

.mp-tag {
  font-size: 9px;
  font-family: var(--mono);
  padding: 1px 5px;
  border-radius: 2px;
  background: var(--faint2);
  color: var(--muted);
}

.mp-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}

.mp-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--faint);
  border-top-color: var(--mid);
  border-radius: 50%;
  animation: mp-spin 0.7s linear infinite;
}

@keyframes mp-spin {
  to {
    transform: rotate(360deg);
  }
}

.mp-empty {
  padding: 40px 16px;
  text-align: center;
  font-size: 12px;
  color: var(--muted);
}

.mp-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 10px 14px;
  border-top: 1px solid var(--faint2);
}

.mp-page-btn {
  background: none;
  border: 1px solid var(--faint);
  border-radius: 3px;
  padding: 2px 8px;
  cursor: pointer;
  color: var(--mid);
  font-size: 14px;
}

.mp-page-btn:hover:not(:disabled) {
  border-color: var(--mid);
  color: var(--dark);
}

.mp-page-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.mp-page-info {
  font-size: 10px;
  font-family: var(--mono);
  color: var(--muted);
}

/* Detail panel */
.mp-detail {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.mp-detail-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  font-size: 12px;
}

.mp-detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 28px 36px 20px;
  border-bottom: 1px solid var(--faint2);
}

.mp-detail-name {
  font-size: 20px;
  font-weight: 700;
  color: var(--dark);
  margin-bottom: 6px;
}

.mp-detail-meta {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: var(--muted);
}

.mp-detail-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.mp-btn {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.04em;
  padding: 7px 18px;
  border-radius: 4px;
  border: 1px solid var(--faint);
  cursor: pointer;
  background: none;
  color: var(--mid);
  transition: all 0.15s;
}

.mp-btn:hover {
  border-color: var(--mid);
  color: var(--dark);
}

.mp-btn.primary {
  background: var(--dark);
  color: var(--surface);
  border-color: var(--dark);
}

.mp-btn.primary:hover {
  background: var(--mid);
  border-color: var(--mid);
}

.mp-btn.danger {
  color: #c44;
  border-color: #c44;
}

.mp-btn.danger:hover {
  background: #c44;
  color: #fff;
}

.mp-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.mp-detail-body {
  padding: 24px 36px 40px;
  flex: 1;
}

.mp-section {
  margin-bottom: 24px;
}

.mp-section-label {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 10px;
}

.mp-detail-desc {
  font-size: 13px;
  color: var(--mid);
  line-height: 1.7;
  white-space: pre-wrap;
}

.mp-caps {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.mp-cap {
  font-size: 10px;
  font-family: var(--mono);
  padding: 3px 8px;
  border-radius: 3px;
  background: var(--faint2);
  color: var(--mid);
  border: 1px solid var(--faint);
}

.mp-tags-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.mp-theme-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.mp-swatch {
  border: 2px solid var(--faint);
  border-radius: 6px;
  overflow: hidden;
}

.mp-swatch-colors {
  display: flex;
  height: 32px;
}

.mp-swatch-colors span {
  flex: 1;
}

.mp-swatch-name {
  padding: 5px 6px;
  font-size: 10px;
  color: var(--mid);
  background: var(--surface);
  text-align: center;
}

.mp-versions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mp-version-item {
  padding: 8px 12px;
  border: 1px solid var(--faint2);
  border-radius: 4px;
}

.mp-version-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mp-version-num {
  font-size: 12px;
  font-weight: 600;
  font-family: var(--mono);
  color: var(--dark);
}

.mp-version-date {
  font-size: 10px;
  color: var(--muted);
  margin-left: auto;
}

.mp-version-log {
  font-size: 11px;
  color: var(--mid);
  margin-top: 4px;
  line-height: 1.5;
}

.mp-links {
  display: flex;
  gap: 12px;
}

.mp-link {
  font-size: 11px;
  color: var(--mid);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.mp-link:hover {
  color: var(--dark);
}

.mp-stats {
  display: flex;
  gap: 24px;
}

.mp-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mp-stat-value {
  font-size: 18px;
  font-weight: 700;
  font-family: var(--mono);
  color: var(--dark);
}

.mp-stat-label {
  font-size: 10px;
  color: var(--muted);
}
</style>
