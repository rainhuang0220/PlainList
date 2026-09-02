import { Router } from 'express';
import { authMiddleware, type AuthRequest } from '../../middleware/auth';
import { getChatgptActivityConnection, listChatgptDailyJournals, reconcileChatgptActivity } from './service';

export const chatgptActivityRouter = Router();
chatgptActivityRouter.use(authMiddleware);

function respond(error: unknown, res: any) {
  const status = typeof error === 'object' && error && 'status' in error ? Number((error as any).status) : 400;
  res.status(status).json({ error: error instanceof Error ? error.message : 'invalid request' });
}

chatgptActivityRouter.get('/journals', async (req, res) => {
  try { res.json(await listChatgptDailyJournals((req as AuthRequest).user, String(req.query.from ?? ''), String(req.query.to ?? ''))); }
  catch (error) { respond(error, res); }
});
chatgptActivityRouter.get('/connection', async (req, res) => {
  try { res.json(await getChatgptActivityConnection((req as AuthRequest).user)); }
  catch (error) { respond(error, res); }
});
chatgptActivityRouter.post('/reconcile', async (req, res) => {
  try { res.json(await reconcileChatgptActivity((req as AuthRequest).user, req.body)); }
  catch (error) { respond(error, res); }
});
