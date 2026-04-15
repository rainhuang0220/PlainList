import cors from 'cors';
import express from 'express';
import { authRouter } from './modules/auth/router';
import { plansRouter } from './modules/plans/router';
import { checksRouter } from './modules/checks/router';
import { pluginsRouter } from './modules/plugins/router';
import { aiReviewsRouter } from './modules/ai-reviews/router';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/plans', plansRouter);
  app.use('/api/checks', checksRouter);
  app.use('/api/plugins', pluginsRouter);
  app.use('/api/ai-reviews', aiReviewsRouter);

  return app;
}
