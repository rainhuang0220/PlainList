import type {
  MarketplaceSearchParams,
  MarketplaceSearchResult,
  PluginRegistryEntry,
  PluginVersionEntry,
  PluginVersionManifest,
  PublishPluginPayload,
  UserPluginRecord,
} from '@plainlist/shared';
import { pool } from '../../db/pool';
import { installWidget, uninstallWidget } from './widgetRunner';

function serviceError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

// --------------- Registry (public) ---------------

export async function searchPlugins(params: MarketplaceSearchParams): Promise<MarketplaceSearchResult> {
  const {
    q,
    category = 'all',
    tag,
    sortBy = 'downloads',
    page = 1,
    pageSize = 20,
  } = params;

  const conditions: string[] = ['p.is_published = 1'];
  const values: unknown[] = [];

  if (q) {
    conditions.push('(p.name LIKE ? OR p.description LIKE ? OR p.author LIKE ?)');
    const like = `%${q}%`;
    values.push(like, like, like);
  }

  if (category !== 'all') {
    conditions.push('p.category = ?');
    values.push(category);
  }

  if (tag) {
    conditions.push('JSON_CONTAINS(p.tags, ?)');
    values.push(JSON.stringify(tag));
  }

  const orderMap: Record<string, string> = {
    downloads: 'p.download_count DESC',
    newest: 'p.created_at DESC',
    updated: 'p.updated_at DESC',
  };
  const orderClause = orderMap[sortBy] || orderMap.downloads;

  const where = conditions.join(' AND ');
  const offset = (page - 1) * pageSize;

  const [countRows] = await pool.query(
    `SELECT COUNT(*) as total FROM plugins p WHERE ${where}`,
    values,
  );
  const total = (countRows as { total: number }[])[0]?.total ?? 0;

  const [rows] = await pool.query(
    `SELECT p.*, pv.version as latest_version
     FROM plugins p
     LEFT JOIN plugin_versions pv ON pv.plugin_id = p.id AND pv.is_latest = 1
     WHERE ${where}
     ORDER BY ${orderClause}
     LIMIT ? OFFSET ?`,
    [...values, pageSize, offset],
  );

  const plugins = (rows as any[]).map(rowToRegistryEntry);

  return { plugins, total, page, pageSize };
}

export async function getPluginDetail(pluginId: string): Promise<PluginRegistryEntry | null> {
  const [rows] = await pool.query(
    `SELECT p.*, pv.version as latest_version
     FROM plugins p
     LEFT JOIN plugin_versions pv ON pv.plugin_id = p.id AND pv.is_latest = 1
     WHERE p.id = ? AND p.is_published = 1`,
    [pluginId],
  );

  const list = rows as any[];
  if (list.length === 0) return null;
  return rowToRegistryEntry(list[0]);
}

export async function getPluginVersions(pluginId: string): Promise<PluginVersionEntry[]> {
  const [rows] = await pool.query(
    `SELECT * FROM plugin_versions WHERE plugin_id = ? ORDER BY published_at DESC`,
    [pluginId],
  );

  return (rows as any[]).map(rowToVersionEntry);
}

export async function getLatestManifest(pluginId: string): Promise<PluginVersionManifest | null> {
  const [rows] = await pool.query(
    `SELECT manifest FROM plugin_versions WHERE plugin_id = ? AND is_latest = 1`,
    [pluginId],
  );

  const list = rows as any[];
  if (list.length === 0) return null;

  const raw = list[0].manifest;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

// --------------- Publishing (admin) ---------------

export async function publishPlugin(payload: PublishPluginPayload): Promise<void> {
  const {
    id,
    name,
    category,
    author,
    description,
    longDescription,
    iconUrl,
    repoUrl,
    homepageUrl,
    license,
    tags,
    capabilities,
    version,
    changelog,
    manifest,
    archiveUrl,
    archiveSha256,
    minAppVersion,
  } = payload;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `INSERT INTO plugins (id, name, category, author, description, long_description,
        icon_url, repo_url, homepage_url, license, tags, capabilities, is_official)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        category = VALUES(category),
        author = VALUES(author),
        description = VALUES(description),
        long_description = VALUES(long_description),
        icon_url = VALUES(icon_url),
        repo_url = VALUES(repo_url),
        homepage_url = VALUES(homepage_url),
        license = VALUES(license),
        tags = VALUES(tags),
        capabilities = VALUES(capabilities)`,
      [
        id, name, category, author, description, longDescription ?? null,
        iconUrl ?? null, repoUrl ?? null, homepageUrl ?? null,
        license ?? 'MIT',
        JSON.stringify(tags ?? []),
        JSON.stringify(capabilities ?? []),
      ],
    );

    // Mark previous latest as not latest
    await conn.query(
      `UPDATE plugin_versions SET is_latest = 0 WHERE plugin_id = ? AND is_latest = 1`,
      [id],
    );

    await conn.query(
      `INSERT INTO plugin_versions (plugin_id, version, changelog, manifest, archive_url, archive_sha256, min_app_version, is_latest)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
        changelog = VALUES(changelog),
        manifest = VALUES(manifest),
        archive_url = VALUES(archive_url),
        archive_sha256 = VALUES(archive_sha256),
        min_app_version = VALUES(min_app_version),
        is_latest = 1`,
      [id, version, changelog ?? null, JSON.stringify(manifest), archiveUrl ?? null, archiveSha256 ?? null, minAppVersion ?? null],
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function unpublishPlugin(pluginId: string): Promise<void> {
  const [result] = await pool.query(
    `UPDATE plugins SET is_published = 0 WHERE id = ?`,
    [pluginId],
  );

  if ((result as any).affectedRows === 0) {
    throw serviceError(404, 'plugin not found');
  }
}

// --------------- User installs ---------------

export async function getUserPlugins(userId: number): Promise<UserPluginRecord[]> {
  const [rows] = await pool.query(
    `SELECT plugin_id, version, enabled, settings, installed_at
     FROM user_plugins WHERE user_id = ?`,
    [userId],
  );

  return (rows as any[]).map((row) => ({
    pluginId: row.plugin_id,
    version: row.version,
    enabled: Boolean(row.enabled),
    settings: row.settings ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {},
    installedAt: row.installed_at,
  }));
}

export async function installMarketplacePlugin(userId: number, pluginId: string): Promise<void> {
  const detail = await getPluginDetail(pluginId);
  if (!detail) {
    throw serviceError(404, 'plugin not found in marketplace');
  }

  const latestVersion = detail.latestVersion || '1.0.0';

  await pool.query(
    `INSERT INTO user_plugins (user_id, plugin_id, version, enabled, settings)
     VALUES (?, ?, ?, 1, '{}')
     ON DUPLICATE KEY UPDATE enabled = 1, version = VALUES(version)`,
    [userId, pluginId, latestVersion],
  );

  await pool.query(
    `UPDATE plugins SET download_count = download_count + 1 WHERE id = ?`,
    [pluginId],
  );

  // Start widget sidecar if this is a widget plugin with a local source or repo
  if (detail.category === 'widget') {
    const manifest = await getLatestManifest(pluginId);
    if (manifest?.sourcePath || detail.repoUrl) {
      await installWidget(pluginId, { sourcePath: manifest?.sourcePath, repoUrl: detail.repoUrl });
    }
  }
}

export async function uninstallMarketplacePlugin(userId: number, pluginId: string): Promise<void> {
  await pool.query(
    `DELETE FROM user_plugins WHERE user_id = ? AND plugin_id = ?`,
    [userId, pluginId],
  );

  // Stop and remove widget sidecar if applicable
  const detail = await getPluginDetail(pluginId);
  if (detail?.category === 'widget') {
    uninstallWidget(pluginId);
  }
}

export async function togglePluginEnabled(userId: number, pluginId: string, enabled: boolean): Promise<void> {
  const [result] = await pool.query(
    `UPDATE user_plugins SET enabled = ? WHERE user_id = ? AND plugin_id = ?`,
    [enabled ? 1 : 0, userId, pluginId],
  );

  if ((result as any).affectedRows === 0) {
    throw serviceError(404, 'plugin not installed');
  }
}

export async function updatePluginSettings(userId: number, pluginId: string, settings: Record<string, unknown>): Promise<void> {
  const [result] = await pool.query(
    `UPDATE user_plugins SET settings = ? WHERE user_id = ? AND plugin_id = ?`,
    [JSON.stringify(settings), userId, pluginId],
  );

  if ((result as any).affectedRows === 0) {
    throw serviceError(404, 'plugin not installed');
  }
}

// --------------- Theme ---------------

const THEME_SETTING_KEY = 'active_theme';

export async function getActiveTheme(userId: number): Promise<{ themeId: string }> {
  const [rows] = await pool.query(
    'SELECT value FROM user_settings WHERE user_id = ? AND key_name = ?',
    [userId, THEME_SETTING_KEY],
  );

  const list = rows as any[];
  const themeId = list.length > 0 ? String(list[0].value) : 'default';
  return { themeId };
}

export async function setActiveTheme(userId: number, themeId: string): Promise<void> {
  await pool.query(
    `INSERT INTO user_settings (user_id, key_name, value) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value)`,
    [userId, THEME_SETTING_KEY, themeId],
  );
}

// --------------- Helpers ---------------

function rowToRegistryEntry(row: any): PluginRegistryEntry {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    author: row.author,
    description: row.description,
    longDescription: row.long_description ?? undefined,
    iconUrl: row.icon_url ?? undefined,
    repoUrl: row.repo_url ?? undefined,
    homepageUrl: row.homepage_url ?? undefined,
    license: row.license ?? undefined,
    tags: parseJson(row.tags, []),
    capabilities: parseJson(row.capabilities, []),
    isOfficial: Boolean(row.is_official),
    downloadCount: row.download_count ?? 0,
    latestVersion: row.latest_version ?? '0.0.0',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToVersionEntry(row: any): PluginVersionEntry {
  const defaultManifest: PluginVersionManifest = { runtime: 'manifest' };
  return {
    pluginId: row.plugin_id,
    version: row.version,
    changelog: row.changelog ?? undefined,
    manifest: parseJson(row.manifest, defaultManifest),
    archiveUrl: row.archive_url ?? undefined,
    archiveSha256: row.archive_sha256 ?? undefined,
    minAppVersion: row.min_app_version ?? undefined,
    isLatest: Boolean(row.is_latest),
    publishedAt: row.published_at,
  };
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value as T;
  try {
    return JSON.parse(value as string);
  } catch {
    return fallback;
  }
}
