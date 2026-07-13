import type {
  MarketplaceSearchResult,
  PluginCategory,
  PluginRegistryEntry,
  PluginVersionEntry,
  PluginVersionManifest,
  ThemeDefinition,
  ThemeVars,
  UserPluginRecord,
} from '@plainlist/shared';
import { DEFAULT_THEME_VARS } from '@plainlist/shared';
import { defineStore } from 'pinia';
import { computed, reactive, ref } from 'vue';
import { useApi } from '@/shared/api/useApi';

export const useMarketplaceStore = defineStore('marketplace', () => {
  const { get, post, del } = useApi();

  // --- Marketplace browsing state ---
  const searchResult = ref<MarketplaceSearchResult>({ plugins: [], total: 0, page: 1, pageSize: 20 });
  const currentDetail = ref<PluginRegistryEntry | null>(null);
  const currentVersions = ref<PluginVersionEntry[]>([]);
  const currentManifest = ref<PluginVersionManifest | null>(null);
  const myPlugins = ref<UserPluginRecord[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // --- Theme state (migrated from old usePluginsStore) ---
  const themeVars = reactive<ThemeVars>({ ...DEFAULT_THEME_VARS });
  const previewing = ref(false);
  let savedVars: ThemeVars | null = null;

  // --- Widget state ---
  const availableManifests = ref<Array<{ id: string; name: string; category: string; widgetUrl?: string }>>([]);

  // --- Computed ---
  const installedIds = computed(() => new Set(myPlugins.value.map((p) => p.pluginId)));
  const enabledIds = computed(() => new Set(myPlugins.value.filter((p) => p.enabled).map((p) => p.pluginId)));

  const installedWidgets = computed(() =>
    availableManifests.value.filter(
      (p) => p.category === 'widget' && enabledIds.value.has(p.id),
    ),
  );

  function isInstalled(pluginId: string): boolean {
    return installedIds.value.has(pluginId);
  }

  function isEnabled(pluginId: string): boolean {
    return enabledIds.value.has(pluginId);
  }

  // --- Theme methods ---
  function emitThemeChanged() {
    requestAnimationFrame(() => {
      document.dispatchEvent(new CustomEvent('theme:changed'));
    });
  }

  function applyVars(vars: ThemeVars) {
    const nextVars = { ...DEFAULT_THEME_VARS, ...vars };
    Object.assign(themeVars, nextVars);
    Object.entries(nextVars).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value);
    });
    emitThemeChanged();
  }

  function previewTheme(vars: ThemeVars) {
    if (!previewing.value) {
      savedVars = { ...themeVars };
    }
    previewing.value = true;
    applyVars(vars);
  }

  function revertTheme() {
    if (savedVars) {
      applyVars(savedVars);
    }
    savedVars = null;
    previewing.value = false;
  }

  async function loadActiveTheme() {
    try {
      const { themeId } = await get<{ themeId: string }>('/marketplace/active-theme');
      const manifest = await get<PluginVersionManifest>('/marketplace/detail/theme-pack/manifest').catch(() => null);
      const theme = manifest?.themes?.find((t: ThemeDefinition) => t.id === themeId);
      applyVars(theme?.vars ?? DEFAULT_THEME_VARS);
    } catch {
      applyVars(DEFAULT_THEME_VARS);
    }
  }

  async function saveTheme(themeId: string) {
    await post<{ ok: true }>('/marketplace/active-theme', { themeId });
    const manifest = await get<PluginVersionManifest>('/marketplace/detail/theme-pack/manifest').catch(() => null);
    const theme = manifest?.themes?.find((t: ThemeDefinition) => t.id === themeId);
    applyVars(theme?.vars ?? DEFAULT_THEME_VARS);
    savedVars = null;
    previewing.value = false;
  }

  // --- Marketplace search/browse ---
  async function search(params: {
    q?: string;
    category?: PluginCategory | 'all';
    sortBy?: 'downloads' | 'newest' | 'updated';
    page?: number;
  } = {}) {
    loading.value = true;
    error.value = null;
    try {
      const query = new URLSearchParams();
      if (params.q) query.set('q', params.q);
      if (params.category && params.category !== 'all') query.set('category', params.category);
      if (params.sortBy) query.set('sortBy', params.sortBy);
      if (params.page) query.set('page', String(params.page));

      const qs = query.toString();
      searchResult.value = await get<MarketplaceSearchResult>(`/marketplace/search${qs ? `?${qs}` : ''}`);
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'search failed';
    } finally {
      loading.value = false;
    }
  }

  async function loadDetail(pluginId: string) {
    loading.value = true;
    error.value = null;
    try {
      const [detail, versions, manifest] = await Promise.all([
        get<PluginRegistryEntry>(`/marketplace/detail/${pluginId}`),
        get<PluginVersionEntry[]>(`/marketplace/detail/${pluginId}/versions`),
        get<PluginVersionManifest>(`/marketplace/detail/${pluginId}/manifest`),
      ]);
      currentDetail.value = detail;
      currentVersions.value = versions;
      currentManifest.value = manifest;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'load failed';
    } finally {
      loading.value = false;
    }
  }

  async function loadMyPlugins() {
    try {
      myPlugins.value = await get<UserPluginRecord[]>('/marketplace/my-plugins');
    } catch {
      myPlugins.value = [];
    }
  }

  async function loadAvailableManifests() {
    try {
      const result = await get<MarketplaceSearchResult>('/marketplace/search?pageSize=50');
      availableManifests.value = result.plugins.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
      }));

      // Load widget URLs for widget plugins. The backend manifest stores the
      // widget's *local* listen URL (e.g. http://127.0.0.1:5174). In production
      // we run the widget behind a reverse proxy at /widget/<id>/, so we
      // rewrite the URL to the proxy path the current page is served from.
      for (const p of result.plugins.filter((pl) => pl.category === 'widget')) {
        try {
          const m = await get<PluginVersionManifest>(`/marketplace/detail/${p.id}/manifest`);
          const entry = availableManifests.value.find((e) => e.id === p.id);
          if (entry && m.widgetUrl) {
            entry.widgetUrl = `${window.location.origin}/widget/${p.id}/`;
          }
        } catch {
          // skip
        }
      }
    } catch {
      availableManifests.value = [];
    }
  }

  async function install(pluginId: string) {
    await post('/marketplace/my-plugins/install', { pluginId });
    await Promise.all([loadMyPlugins(), loadAvailableManifests()]);
  }

  async function uninstall(pluginId: string) {
    await del(`/marketplace/my-plugins/${pluginId}`);
    await loadMyPlugins();
  }

  async function toggle(pluginId: string, enabled: boolean) {
    await post(`/marketplace/my-plugins/${pluginId}/toggle`, { enabled });
    await Promise.all([loadMyPlugins(), loadAvailableManifests()]);
  }

  async function updateSettings(pluginId: string, settings: Record<string, unknown>) {
    await post(`/marketplace/my-plugins/${pluginId}/settings`, { settings });
    await loadMyPlugins();
  }

  function clear() {
    searchResult.value = { plugins: [], total: 0, page: 1, pageSize: 20 };
    currentDetail.value = null;
    currentVersions.value = [];
    currentManifest.value = null;
    myPlugins.value = [];
    availableManifests.value = [];
    error.value = null;
    savedVars = null;
    previewing.value = false;
    applyVars(DEFAULT_THEME_VARS);
  }

  return {
    // Marketplace browsing
    searchResult,
    currentDetail,
    currentVersions,
    currentManifest,
    myPlugins,
    loading,
    error,
    installedIds,
    enabledIds,
    isInstalled,
    isEnabled,
    search,
    loadDetail,
    loadMyPlugins,
    loadAvailableManifests,
    install,
    uninstall,
    toggle,
    updateSettings,
    clear,
    // Theme
    themeVars,
    previewing,
    applyVars,
    previewTheme,
    revertTheme,
    loadActiveTheme,
    saveTheme,
    // Widgets
    availableManifests,
    installedWidgets,
  };
});
