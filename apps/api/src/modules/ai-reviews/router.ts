import { Router } from 'express';
import { ZodError } from 'zod';
import { authMiddleware, type AuthRequest } from '../../middleware/auth';
import { generateAiReview } from './service';

function respondError(error: unknown, res: any): void {
  if (error instanceof ZodError) {
    res.status(400).json({ error: 'invalid request payload' });
    return;
  }

  const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status: number }).status) : 500;
  res.status(status).json({ error: error instanceof Error ? error.message : 'server error' });
}

export const aiReviewsRouter = Router();

aiReviewsRouter.use(authMiddleware);

aiReviewsRouter.post('/', async (req, res) => {
  try {
    res.json(await generateAiReview((req as AuthRequest).user, req.body));
  } catch (error) {
    respondError(error, res);
  }
});
