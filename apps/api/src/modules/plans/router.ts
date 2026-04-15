import { Router } from 'express';
import { ZodError } from 'zod';
import { authMiddleware, type AuthRequest } from '../../middleware/auth';
import { createPlan, deletePlan, listPlans } from './service';

function respondError(error: unknown, res: any): void {
  if (error instanceof ZodError) {
    res.status(400).json({ error: 'invalid request payload' });
    return;
  }

  const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status: number }).status) : 500;
  res.status(status).json({ error: error instanceof Error ? error.message : 'server error' });
}

export const plansRouter = Router();

plansRouter.use(authMiddleware);

plansRouter.get('/', async (req, res) => {
  try {
    res.json(await listPlans((req as AuthRequest).user));
  } catch (error) {
    respondError(error, res);
  }
});

plansRouter.post('/', async (req, res) => {
  try {
    res.json(await createPlan((req as AuthRequest).user, req.body));
  } catch (error) {
    respondError(error, res);
  }
});

plansRouter.delete('/:id', async (req, res) => {
  try {
    await deletePlan((req as unknown as AuthRequest).user, req.params);
    res.json({ ok: true });
  } catch (error) {
    respondError(error, res);
  }
});
