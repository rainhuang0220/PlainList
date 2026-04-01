import {
  DEFAULT_THEME_VARS,
  THEME_PLUGIN_ID,
  type InstalledPlugin,
  type PluginManifest,
  type ThemeDefinition,
  type ThemeVars,
} from '@plainlist/shared';
import { defineStore } from 'pinia';
import { reactive, ref } from 'vue';
import { useApi } from '@/shared/api/useApi';
import { useI18nStore } from '@/shared/i18n/useI18nStore';

export const usePluginsStore = defineStore('plugins', () => {
  const { del, get, post } = useApi();
  const i18n = useI18nStore();

  const installed = ref<InstalledPlugin[]>([]);
  const installedIds = ref(new Set<string>());
  const available = ref<PluginManifest[]>([]);
  const themeVars = reactive<ThemeVars>({ ...DEFAULT_THEME_VARS });
  const previewing = ref(false);

  let savedVars: ThemeVars | null = null;

  function getInstalledManifests() {
    return available.value.filter((plugin) => installedIds.value.has(plugin.id));
  }

  function getThemeDefinition(themeId?: string | null): ThemeDefinition | undefined {
    const themePlugin = available.value.find((plugin) => plugin.id === THEME_PLUGIN_ID);
    return themePlugin?.themes?.find((theme) => theme.id === themeId);
  }

  function syncManifestEffects() {
    i18n.applyManifests(getInstalledManifests());
  }

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

  async function loadAvailable() {
    available.value = await get<PluginManifest[]>('/plugins/available');
    syncManifestEffects();
  }

  async function loadInstalled() {
    installed.value = await get<InstalledPlugin[]>('/plugins/installed');
    installedIds.value = new Set(installed.value.filter((plugin) => plugin.enabled).map((plugin) => plugin.id));
    syncManifestEffects();
  }

  async function loadActiveTheme() {
    const { themeId } = await get<{ themeId: string }>('/plugins/active-theme');
    const theme = getThemeDefinition(themeId);
    applyVars(theme?.vars ?? DEFAULT_THEME_VARS);
  }

  async function getActiveThemeId() {
    return get<{ themeId: string }>('/plugins/active-theme');
  }

  async function saveTheme(themeId: string) {
    await post<{ ok: true }>('/plugins/active-theme', { themeId });
    const theme = getThemeDefinition(themeId);
    applyVars(theme?.vars ?? DEFAULT_THEME_VARS);
    savedVars = null;
    previewing.value = false;
  }

  async function install(pluginId: string) {
    await post<{ ok: true }>('/plugins/install', { pluginId });
    await loadInstalled();
    await loadActiveTheme();
  }

  async function uninstall(pluginId: string) {
    await del<{ ok: true }>(`/plugins/uninstall/${pluginId}`);
    savedVars = null;
    previewing.value = false;
    await loadInstalled();
    await loadActiveTheme();
  }

  function clear() {
    installed.value = [];
    installedIds.value = new Set<string>();
    available.value = [];
    savedVars = null;
    previewing.value = false;
    i18n.clear();
    applyVars(DEFAULT_THEME_VARS);
  }

  return {
    installed,
    installedIds,
    available,
    themeVars,
    previewing,
    applyVars,
    previewTheme,
    revertTheme,
    loadAvailable,
    loadInstalled,
    loadActiveTheme,
    getActiveThemeId,
    saveTheme,
    install,
    uninstall,
    clear,
  };
});
