import {
  DEFAULT_THEME_ID,
  PLUGIN_CATALOG,
  THEME_PLUGIN_ID,
  USER_SETTING_KEYS,
  findPluginManifest,
  findThemeById,
  type InstalledPlugin,
  type PluginManifest,
} from '@plainlist/shared';
import { activeThemeSchema, installPluginSchema } from '@plainlist/shared';
import { pool } from '../../db/pool';

function serviceError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

async function getUserSetting(userId: number, keyName: string): Promise<string | null> {
  const [rows] = await pool.query('SELECT value FROM user_settings WHERE user_id = ? AND key_name = ?', [userId, keyName]);
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  return String((rows[0] as { value: string }).value);
}

async function setUserSetting(userId: number, keyName: string, value: string): Promise<void> {
  await pool.query(
    `INSERT INTO user_settings (user_id, key_name, value) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value)`,
    [userId, keyName, value],
  );
}

export function resolveInstalledPluginManifests(installed: InstalledPlugin[]): PluginManifest[] {
  return installed
    .filter((item) => item.enabled)
    .map((item) => findPluginManifest(item.id))
    .filter(Boolean) as PluginManifest[];
}

export function resolveThemeId(installed: InstalledPlugin[], themeId: string | null): string {
  const enabledIds = new Set(resolveInstalledPluginManifests(installed).map((plugin) => plugin.id));
  if (!enabledIds.has(THEME_PLUGIN_ID)) {
    return DEFAULT_THEME_ID;
  }

  if (!themeId) {
    return DEFAULT_THEME_ID;
  }

  return findThemeById(themeId)?.id ?? DEFAULT_THEME_ID;
}

export async function listAvailablePlugins(): Promise<PluginManifest[]> {
  return PLUGIN_CATALOG;
}

export async function listInstalledPlugins(userId: number): Promise<InstalledPlugin[]> {
  const value = await getUserSetting(userId, USER_SETTING_KEYS.installedPlugins);
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as InstalledPlugin[];
    return Array.isArray(parsed)
      ? parsed.filter((plugin) => Boolean(findPluginManifest(plugin.id)))
      : [];
  } catch {
    return [];
  }
}

export async function installPlugin(userId: number, payload: unknown): Promise<void> {
  const { pluginId } = installPluginSchema.parse(payload);
  if (!findPluginManifest(pluginId)) {
    throw serviceError(404, 'plugin not found');
  }

  const installed = await listInstalledPlugins(userId);
  if (installed.some((plugin) => plugin.id === pluginId)) {
    return;
  }

  installed.push({
    id: pluginId,
    enabled: true,
    installedAt: new Date().toISOString(),
  });

  await setUserSetting(userId, USER_SETTING_KEYS.installedPlugins, JSON.stringify(installed));
}

export async function uninstallPlugin(userId: number, pluginId: string): Promise<void> {
  const installed = await listInstalledPlugins(userId);
  const next = installed.filter((plugin) => plugin.id !== pluginId);
  await setUserSetting(userId, USER_SETTING_KEYS.installedPlugins, JSON.stringify(next));

  if (pluginId === THEME_PLUGIN_ID) {
    await setUserSetting(userId, USER_SETTING_KEYS.activeTheme, DEFAULT_THEME_ID);
  }
}

export async function getActiveTheme(userId: number): Promise<{ themeId: string }> {
  const installed = await listInstalledPlugins(userId);
  const rawThemeId = await getUserSetting(userId, USER_SETTING_KEYS.activeTheme);
  return {
    themeId: resolveThemeId(installed, rawThemeId),
  };
}

export async function setActiveTheme(userId: number, payload: unknown): Promise<void> {
  const { themeId } = activeThemeSchema.parse(payload);
  const installed = await listInstalledPlugins(userId);
  const nextThemeId = resolveThemeId(installed, themeId);

  if (themeId !== DEFAULT_THEME_ID && nextThemeId !== themeId) {
    throw serviceError(400, 'invalid themeId');
  }

  await setUserSetting(userId, USER_SETTING_KEYS.activeTheme, nextThemeId);
}
