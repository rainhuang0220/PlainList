import { Router } from 'express';
import { ZodError } from 'zod';
import { authMiddleware, type AuthRequest } from '../../middleware/auth';
import { listAccounts, loginUser, registerUser } from './service';

function respondError(error: unknown, res: any): void {
  if (error instanceof ZodError) {
    res.status(400).json({ error: 'invalid request payload' });
    return;
  }

  const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status: number }).status) : 500;
  const message = error instanceof Error ? error.message : 'server error';
  res.status(status).json({ error: message });
}

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  try {
    res.json(await registerUser(req.body));
  } catch (error) {
    respondError(error, res);
  }
});

authRouter.post('/login', async (req, res) => {
  try {
    res.json(await loginUser(req.body));
  } catch (error) {
    respondError(error, res);
  }
});

authRouter.get('/accounts', async (_req, res) => {
  try {
    res.json(await listAccounts());
  } catch (error) {
    respondError(error, res);
  }
});

authRouter.get('/me', authMiddleware, (req, res) => {
  const user = (req as AuthRequest).user;
  res.json({ username: user.username, isAdmin: user.isAdmin });
});
