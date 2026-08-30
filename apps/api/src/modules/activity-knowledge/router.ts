import { Router } from 'express';
import { authMiddleware, type AuthRequest } from '../../middleware/auth';
import { appendActivityDigest, deleteActivitySource } from './service';
import { generateDailyDigest } from './daily';
import { generateWeeklyIntelligence } from './weekly';

export const activityKnowledgeRouter = Router();
activityKnowledgeRouter.use(authMiddleware);
function respond(error: unknown, res: any): void { const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status: number }).status) : 400; res.status(status).json({ error: error instanceof Error ? error.message : 'invalid request' }); }
activityKnowledgeRouter.post('/sources/chatgpt-digest', async (req, res) => { try { res.status(201).json(await appendActivityDigest((req as AuthRequest).user, req.body)); } catch (error) { respond(error, res); } });
activityKnowledgeRouter.delete('/sources/:id', async (req, res) => { try { await deleteActivitySource((req as unknown as AuthRequest).user, req.params); res.status(204).end(); } catch (error) { respond(error, res); } });
activityKnowledgeRouter.post('/daily/generate', async (req, res) => { try { res.json(await generateDailyDigest((req as AuthRequest).user, String(req.body?.dateKey ?? ''))); } catch (error) { respond(error, res); } });
activityKnowledgeRouter.post('/weekly/generate', async (req, res) => { try { res.json(await generateWeeklyIntelligence((req as AuthRequest).user, String(req.body?.weekStart ?? ''))); } catch (error) { respond(error, res); } });
