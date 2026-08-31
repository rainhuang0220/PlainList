import { Router } from 'express';
import { ZodError } from 'zod';
import { authMiddleware, type AuthRequest } from '../../middleware/auth';
import { archiveActivityGoal, createActivityGoal, listActivityGoals, updateActivityGoal } from './service';

export const activityGoalsRouter = Router();
activityGoalsRouter.use(authMiddleware);

function respond(error: unknown, res: any): void {
  const status = error instanceof ZodError ? 400 : typeof error === 'object' && error && 'status' in error ? Number((error as { status: number }).status) : 500;
  res.status(status).json({ error: error instanceof Error ? error.message : 'server error' });
}

activityGoalsRouter.get('/', async (req, res) => { try { res.json(await listActivityGoals((req as AuthRequest).user, req.query.includeInactive !== 'false')); } catch (error) { respond(error, res); } });
activityGoalsRouter.post('/', async (req, res) => { try { res.status(201).json(await createActivityGoal((req as AuthRequest).user, req.body)); } catch (error) { respond(error, res); } });
activityGoalsRouter.patch('/:id', async (req, res) => { try { res.json(await updateActivityGoal((req as unknown as AuthRequest).user, req.params, req.body)); } catch (error) { respond(error, res); } });
activityGoalsRouter.post('/:id/archive', async (req, res) => { try { res.json(await archiveActivityGoal((req as unknown as AuthRequest).user, req.params)); } catch (error) { respond(error, res); } });
