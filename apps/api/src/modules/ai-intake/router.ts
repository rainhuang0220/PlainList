import { Router } from 'express';
import { ZodError } from 'zod';
import { authMiddleware, type AuthRequest } from '../../middleware/auth';
import {
  applyDefaultAiSettings,
  clearUserAiSettings,
  getAiSettingsView,
  saveAiSettings,
} from './settings';
import { generateAiIntake } from './service';
import { testAiConnection } from './testConnection';

function normalizeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'server error';
  }

  const { message, name } = error;
  if (name === 'AbortError' || /aborted/i.test(message)) {
    return '大模型请求超时或被中断。MiniMax-M3 建议将超时调至 180000ms 以上并保存后重试。';
  }

  return message;
}

function formatZodError(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) {
    return 'invalid request payload';
  }

  const field = issue.path.join('.');
  if (field === 'timeoutMs') {
    return '超时须在 3000–300000ms 之间。保存 180000 是合法的；若仍报 400，请重启 npm run dev 并确认已拉取最新代码。';
  }

  return issue.message || 'invalid request payload';
}

function respondError(error: unknown, res: any): void {
  if (error instanceof ZodError) {
    res.status(400).json({ error: formatZodError(error) });
    return;
  }

  if (error instanceof Error) {
    console.error('[ai-intake] request failed:', error.message);
  } else {
    console.error('[ai-intake] request failed:', error);
  }

  const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status: number }).status) : 500;
  res.status(status).json({ error: normalizeErrorMessage(error) });
}

export const aiIntakeRouter = Router();

aiIntakeRouter.use(authMiddleware);

aiIntakeRouter.post('/', async (req, res) => {
  try {
    res.json(await generateAiIntake((req as AuthRequest).user, req.body));
  } catch (error) {
    respondError(error, res);
  }
});

aiIntakeRouter.get('/settings', async (req, res) => {
  try {
    res.json(await getAiSettingsView((req as AuthRequest).user.id));
  } catch (error) {
    respondError(error, res);
  }
});

aiIntakeRouter.put('/settings', async (req, res) => {
  try {
    res.json(await saveAiSettings((req as AuthRequest).user.id, req.body));
  } catch (error) {
    respondError(error, res);
  }
});

aiIntakeRouter.delete('/settings', async (req, res) => {
  try {
    res.json(await clearUserAiSettings((req as AuthRequest).user.id));
  } catch (error) {
    respondError(error, res);
  }
});

aiIntakeRouter.post('/settings/apply-default', async (req, res) => {
  try {
    const result = await applyDefaultAiSettings((req as AuthRequest).user.id);
    if (!result) {
      res.status(503).json({
        error: '服务端未配置 AI_USER_DEFAULT_API_KEY，请联系管理员在 apps/api/.env 中配置。',
      });
      return;
    }
    res.json(result);
  } catch (error) {
    respondError(error, res);
  }
});

aiIntakeRouter.post('/settings/test', async (req, res) => {
  try {
    res.json(await testAiConnection((req as AuthRequest).user.id, req.body));
  } catch (error) {
    respondError(error, res);
  }
});
