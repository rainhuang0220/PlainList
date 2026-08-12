import { Router } from 'express';
import { ZodError } from 'zod';
import { authMiddleware, type AuthRequest } from '../../middleware/auth';
import { getDurationChartPrefs, upsertDurationChartPrefs } from './service';

function respondError(error: unknown, res: any): void {
  if (error instanceof ZodError) {
    res.status(400).json({ error: 'invalid request payload' });
    return;
  }

  const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status: number }).status) : 500;
  res.status(status).json({ error: error instanceof Error ? error.message : 'server error' });
}

export const durationPrefsRouter = Router();

durationPrefsRouter.use(authMiddleware);

durationPrefsRouter.get('/', async (req, res) => {
  try {
    res.json(await getDurationChartPrefs((req as AuthRequest).user, req.query));
  } catch (error) {
    respondError(error, res);
  }
});

durationPrefsRouter.put('/', async (req, res) => {
  try {
    res.json(await upsertDurationChartPrefs((req as AuthRequest).user, req.query, req.body));
  } catch (error) {
    respondError(error, res);
  }
});
