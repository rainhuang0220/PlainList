import { Router } from 'express';
import { ZodError } from 'zod';
import { logAuthEvent } from '../../shared/auditLog';
import { getClientIp } from '../../shared/clientIp';
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

function loginUsername(body: unknown): string {
  if (typeof body === 'object' && body && 'username' in body) {
    const username = (body as { username?: unknown }).username;
    if (typeof username === 'string' && username.trim()) {
      return username.trim();
    }
  }

  return 'unknown';
}

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  const ip = getClientIp(req);
  const username = loginUsername(req.body);

  try {
    const result = await registerUser(req.body);
    logAuthEvent({ kind: 'register-ok', ip, username: result.username });
    res.json(result);
  } catch (error) {
    respondError(error, res);
  }
});

authRouter.post('/login', async (req, res) => {
  const ip = getClientIp(req);
  const username = loginUsername(req.body);

  try {
    const result = await loginUser(req.body);
    logAuthEvent({ kind: 'login-ok', ip, username: result.username });
    res.json(result);
  } catch (error) {
    const status = typeof error === 'object' && error && 'status' in error
      ? Number((error as { status: number }).status)
      : 500;

    if (status === 401) {
      const reason = error instanceof Error ? error.message : 'unauthorized';
      logAuthEvent({ kind: 'login-fail', ip, username, reason });
    }

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
