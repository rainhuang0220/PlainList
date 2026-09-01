import { execSync } from 'node:child_process';
import { createApp } from './app';
import { env } from './config/env';
import { startInstalledWidgets } from './modules/plugins/widgetRunner';
import { createActivityIntelligenceScheduler } from './modules/activity-knowledge/scheduler';
import { createWeeklyReviewSnapshotScheduler } from './modules/reviews/weeklyReviewSnapshot';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`PlainList API listening on http://localhost:${env.PORT}`);
  void startInstalledWidgets();
});
const stopWeeklyReviewScheduler = env.BACKGROUND_JOBS_ENABLED
  ? createWeeklyReviewSnapshotScheduler()
  : () => {};
const stopActivityIntelligenceScheduler = env.BACKGROUND_JOBS_ENABLED
  ? createActivityIntelligenceScheduler()
  : () => {};

// Graceful shutdown: clean up detached widget processes on Ctrl+C
function gracefulShutdown(signal: string) {
  console.log(`\n[${signal}] Shutting down gracefully...`);

  // Stop all running widgets
  stopWeeklyReviewScheduler();
  stopActivityIntelligenceScheduler();
  try {
    console.log('[shutdown] Stopping widget processes...');
    execSync('pkill -f "data/widgets" 2>/dev/null || true');
    execSync('pkill -f "uvicorn.*8000" 2>/dev/null || true');
    execSync('pkill -f "vite.*5174" 2>/dev/null || true');
  } catch {
    // ignore
  }

  server.close(() => {
    console.log('[shutdown] HTTP server closed');
    process.exit(0);
  });

  // Force exit after 5 seconds if graceful shutdown fails
  setTimeout(() => {
    console.error('[shutdown] Forced exit after timeout');
    process.exit(1);
  }, 5000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
