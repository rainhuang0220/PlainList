import { Router } from 'express';
import { ZodError } from 'zod';
import {
  activeThemeSchema,
  marketplaceSearchSchema,
  publishPluginSchema,
  pluginIdSchema,
  updatePluginSettingsSchema,
} from '@plainlist/shared';
import { authMiddleware, type AuthRequest } from '../../middleware/auth';
import {
  getActiveTheme,
  getLatestManifest,
  getPluginDetail,
  getPluginVersions,
  getUserPlugins,
  installMarketplacePlugin,
  publishPlugin,
  searchPlugins,
  setActiveTheme,
  togglePluginEnabled,
  uninstallMarketplacePlugin,
  unpublishPlugin,
  updatePluginSettings,
} from './marketplace.service';

function respondError(error: unknown, res: any): void {
  if (error instanceof ZodError) {
    res.status(400).json({ error: 'invalid request payload', details: error.issues });
    return;
  }

  const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status: number }).status) : 500;
  res.status(status).json({ error: error instanceof Error ? error.message : 'server error' });
}

export const marketplaceRouter = Router();

// --------------- Public browsing ---------------

marketplaceRouter.get('/search', async (req, res) => {
  try {
    const params = marketplaceSearchSchema.parse(req.query);
    res.json(await searchPlugins(params));
  } catch (error) {
    respondError(error, res);
  }
});

marketplaceRouter.get('/detail/:id', async (req, res) => {
  try {
    const pluginId = pluginIdSchema.parse(req.params.id);
    const detail = await getPluginDetail(pluginId);
    if (!detail) {
      res.status(404).json({ error: 'plugin not found' });
      return;
    }
    res.json(detail);
  } catch (error) {
    respondError(error, res);
  }
});

marketplaceRouter.get('/detail/:id/versions', async (req, res) => {
  try {
    const pluginId = pluginIdSchema.parse(req.params.id);
    res.json(await getPluginVersions(pluginId));
  } catch (error) {
    respondError(error, res);
  }
});

marketplaceRouter.get('/detail/:id/manifest', async (req, res) => {
  try {
    const pluginId = pluginIdSchema.parse(req.params.id);
    const manifest = await getLatestManifest(pluginId);
    if (!manifest) {
      res.status(404).json({ error: 'manifest not found' });
      return;
    }
    res.json(manifest);
  } catch (error) {
    respondError(error, res);
  }
});

// --------------- Admin publishing ---------------

marketplaceRouter.post('/publish', authMiddleware, async (req, res) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user.isAdmin) {
      res.status(403).json({ error: 'admin only' });
      return;
    }

    const payload = publishPluginSchema.parse(req.body);
    await publishPlugin(payload);
    res.json({ ok: true });
  } catch (error) {
    respondError(error, res);
  }
});

marketplaceRouter.post('/unpublish/:id', authMiddleware, async (req, res) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user.isAdmin) {
      res.status(403).json({ error: 'admin only' });
      return;
    }

    const pluginId = pluginIdSchema.parse(req.params.id);
    await unpublishPlugin(pluginId);
    res.json({ ok: true });
  } catch (error) {
    respondError(error, res);
  }
});

// --------------- User install management ---------------

marketplaceRouter.get('/my-plugins', authMiddleware, async (req, res) => {
  try {
    res.json(await getUserPlugins((req as AuthRequest).user.id));
  } catch (error) {
    respondError(error, res);
  }
});

marketplaceRouter.post('/my-plugins/install', authMiddleware, async (req, res) => {
  try {
    const { pluginId } = req.body;
    await installMarketplacePlugin((req as AuthRequest).user.id, pluginId);
    res.json({ ok: true });
  } catch (error) {
    respondError(error, res);
  }
});

marketplaceRouter.delete('/my-plugins/:id', authMiddleware, async (req, res) => {
  try {
    const pluginId = pluginIdSchema.parse(req.params.id);
    await uninstallMarketplacePlugin((req as AuthRequest).user.id, pluginId);
    res.json({ ok: true });
  } catch (error) {
    respondError(error, res);
  }
});

marketplaceRouter.post('/my-plugins/:id/toggle', authMiddleware, async (req, res) => {
  try {
    const pluginId = pluginIdSchema.parse(req.params.id);
    const { enabled } = req.body;
    await togglePluginEnabled((req as AuthRequest).user.id, pluginId, Boolean(enabled));
    res.json({ ok: true });
  } catch (error) {
    respondError(error, res);
  }
});

marketplaceRouter.post('/my-plugins/:id/settings', authMiddleware, async (req, res) => {
  try {
    const pluginId = pluginIdSchema.parse(req.params.id);
    const { settings } = updatePluginSettingsSchema.parse({ pluginId, ...req.body });
    await updatePluginSettings((req as AuthRequest).user.id, pluginId, settings);
    res.json({ ok: true });
  } catch (error) {
    respondError(error, res);
  }
});

// --------------- Theme ---------------

marketplaceRouter.get('/active-theme', authMiddleware, async (req, res) => {
  try {
    res.json(await getActiveTheme((req as AuthRequest).user.id));
  } catch (error) {
    respondError(error, res);
  }
});

marketplaceRouter.post('/active-theme', authMiddleware, async (req, res) => {
  try {
    const { themeId } = activeThemeSchema.parse(req.body);
    await setActiveTheme((req as AuthRequest).user.id, themeId);
    res.json({ ok: true });
  } catch (error) {
    respondError(error, res);
  }
});
