import { Router } from 'express';
import { ZodError } from 'zod';
import { authMiddleware, type AuthRequest } from '../../middleware/auth';
import { listChecks, upsertCheck, upsertChecksBatch } from './service';

function respondError(error: unknown, res: any): void {
  if (error instanceof ZodError) {
    res.status(400).json({ error: 'invalid request payload' });
    return;
  }

  const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status: number }).status) : 500;
  res.status(status).json({ error: error instanceof Error ? error.message : 'server error' });
}

export const checksRouter = Router();

checksRouter.use(authMiddleware);

checksRouter.get('/', async (req, res) => {
  try {
    res.json(await listChecks((req as AuthRequest).user, req.query));
  } catch (error) {
    respondError(error, res);
  }
});

checksRouter.put('/', async (req, res) => {
  try {
    await upsertCheck((req as AuthRequest).user, req.body);
    res.json({ ok: true });
  } catch (error) {
    respondError(error, res);
  }
});

checksRouter.put('/batch', async (req, res) => {
  try {
    const count = await upsertChecksBatch((req as AuthRequest).user, req.body);
    res.json({ ok: true, count });
  } catch (error) {
    respondError(error, res);
  }
});
