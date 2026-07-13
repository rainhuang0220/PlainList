import { z } from 'zod';

export const pluginIdSchema = z.string().regex(/^[a-z0-9-]+$/).min(2).max(64);

export const installPluginSchema = z.object({
  pluginId: pluginIdSchema,
});

export const activeThemeSchema = z.object({
  themeId: pluginIdSchema,
});

// --------------- Marketplace Schemas ---------------

export const pluginCategorySchema = z.enum(['language', 'theme', 'widget']);

export const pluginVersionManifestSchema = z.object({
  runtime: z.enum(['manifest', 'iframe', 'webcomponent']),
  entrypoint: z.string().optional(),
  themes: z.array(z.object({
    id: z.string(),
    name: z.string(),
    vars: z.record(z.string(), z.string()),
  })).optional(),
  translation: z.object({
    messages: z.record(z.string(), z.string()).optional(),
    lists: z.record(z.string(), z.array(z.string())).optional(),
  }).optional(),
  widgetUrl: z.string().url().optional(),
  // Local directory (relative to the app root) to copy the widget from instead of git-cloning repoUrl
  sourcePath: z.string().max(200).optional(),
  permissions: z.array(z.string()).optional(),
  configSchema: z.record(z.string(), z.object({
    type: z.enum(['string', 'number', 'boolean', 'select']),
    label: z.string(),
    default: z.union([z.string(), z.number(), z.boolean()]).optional(),
    options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  })).optional(),
});

export const publishPluginSchema = z.object({
  id: pluginIdSchema,
  name: z.string().min(1).max(100),
  category: pluginCategorySchema,
  author: z.string().min(1).max(100),
  description: z.string().max(500),
  longDescription: z.string().max(5000).optional(),
  iconUrl: z.string().url().optional(),
  repoUrl: z.string().url().optional(),
  homepageUrl: z.string().url().optional(),
  license: z.string().max(50).optional(),
  tags: z.array(z.string().max(32)).max(10).optional(),
  capabilities: z.array(z.string().max(32)).max(20).optional(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  changelog: z.string().max(5000).optional(),
  manifest: pluginVersionManifestSchema,
  archiveUrl: z.string().url().optional(),
  archiveSha256: z.string().length(64).optional(),
  minAppVersion: z.string().optional(),
});

export const marketplaceSearchSchema = z.object({
  q: z.string().max(100).optional(),
  category: z.enum(['all', 'language', 'theme', 'widget']).optional(),
  tag: z.string().max(32).optional(),
  sortBy: z.enum(['downloads', 'newest', 'updated']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).optional(),
});

export const updatePluginSettingsSchema = z.object({
  pluginId: pluginIdSchema,
  settings: z.record(z.string(), z.unknown()),
});
