import { Router } from 'express';
import { ZodError } from 'zod';
import { authMiddleware, type AuthRequest } from '../../middleware/auth';
import {
  getActiveTheme,
  installPlugin,
  listAvailablePlugins,
  listInstalledPlugins,
  setActiveTheme,
  uninstallPlugin,
} from './service';

function respondError(error: unknown, res: any): void {
  if (error instanceof ZodError) {
    res.status(400).json({ error: 'invalid request payload' });
    return;
  }

  const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status: number }).status) : 500;
  res.status(status).json({ error: error instanceof Error ? error.message : 'server error' });
}

export const pluginsRouter = Router();

pluginsRouter.get('/available', async (_req, res) => {
  try {
    res.json(await listAvailablePlugins());
  } catch (error) {
    respondError(error, res);
  }
});

pluginsRouter.get('/installed', authMiddleware, async (req, res) => {
  try {
    res.json(await listInstalledPlugins((req as AuthRequest).user.id));
  } catch (error) {
    respondError(error, res);
  }
});

pluginsRouter.post('/install', authMiddleware, async (req, res) => {
  try {
    await installPlugin((req as AuthRequest).user.id, req.body);
    res.json({ ok: true });
  } catch (error) {
    respondError(error, res);
  }
});

pluginsRouter.delete('/uninstall/:id', authMiddleware, async (req, res) => {
  try {
    const pluginId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await uninstallPlugin((req as AuthRequest).user.id, pluginId);
    res.json({ ok: true });
  } catch (error) {
    respondError(error, res);
  }
});

pluginsRouter.get('/active-theme', authMiddleware, async (req, res) => {
  try {
    res.json(await getActiveTheme((req as AuthRequest).user.id));
  } catch (error) {
    respondError(error, res);
  }
});

pluginsRouter.post('/active-theme', authMiddleware, async (req, res) => {
  try {
    await setActiveTheme((req as AuthRequest).user.id, req.body);
    res.json({ ok: true });
  } catch (error) {
    respondError(error, res);
  }
});
