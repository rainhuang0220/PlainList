import { z } from 'zod';
export const pluginIdSchema = z.string().regex(/^[a-z0-9-]+$/);
export const installPluginSchema = z.object({
    pluginId: pluginIdSchema,
});
export const activeThemeSchema = z.object({
    themeId: pluginIdSchema,
});
