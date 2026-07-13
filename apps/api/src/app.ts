import cors from 'cors';
import express from 'express';
import { env } from './config/env';
import { authRouter } from './modules/auth/router';
import { plansRouter } from './modules/plans/router';
import { checksRouter } from './modules/checks/router';
import { reviewsRouter } from './modules/reviews/router';
import { marketplaceRouter } from './modules/plugins/marketplace.router';
import { aiIntakeRouter } from './modules/ai-intake/router';
import { userProfileRouter } from './modules/user-profile/router';

export function createApp() {
  const app = express();

  if (env.TRUST_PROXY) {
    app.set('trust proxy', 1);
  }

  app.use(cors({
    origin: [
      /^https?:\/\/localhost(:\d+)?$/,
      /^capacitor:\/\/localhost$/,
      /^https?:\/\/localhost$/,
      ...(env.CORS_ORIGINS ? env.CORS_ORIGINS.split(',').map((o: string) => o.trim()) : []),
    ],
    credentials: true,
  }));
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/plans', plansRouter);
  app.use('/api/checks', checksRouter);
  app.use('/api/reviews', reviewsRouter);
  app.use('/api/marketplace', marketplaceRouter);
  app.use('/api/ai-intake', aiIntakeRouter);
  app.use('/api/user-profile', userProfileRouter);

  return app;
}
