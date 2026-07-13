import { Router } from 'express';
import { ZodError } from 'zod';
import { authMiddleware, type AuthRequest } from '../../middleware/auth';
import {
  analyzeUserProfile,
  listTraitEvidence,
  listUserProfile,
  updateUserProfileTrait,
} from './service';

function respondError(error: unknown, res: any): void {
  if (error instanceof ZodError) {
    res.status(400).json({ error: error.issues[0]?.message ?? 'invalid request payload' });
    return;
  }

  const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status: number }).status) : 500;
  res.status(status).json({ error: error instanceof Error ? error.message : 'server error' });
}

export const userProfileRouter = Router();

userProfileRouter.use(authMiddleware);

userProfileRouter.get('/', async (req, res) => {
  try {
    res.json(await listUserProfile((req as AuthRequest).user));
  } catch (error) {
    respondError(error, res);
  }
});

userProfileRouter.post('/analyze', async (req, res) => {
  try {
    res.json(await analyzeUserProfile((req as AuthRequest).user, req.body));
  } catch (error) {
    respondError(error, res);
  }
});

userProfileRouter.patch('/:id', async (req, res) => {
  try {
    res.json(await updateUserProfileTrait((req as unknown as AuthRequest).user, req.params, req.body));
  } catch (error) {
    respondError(error, res);
  }
});

userProfileRouter.get('/:id/evidence', async (req, res) => {
  try {
    res.json(await listTraitEvidence((req as unknown as AuthRequest).user, req.params));
  } catch (error) {
    respondError(error, res);
  }
});
