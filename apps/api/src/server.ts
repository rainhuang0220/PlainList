import { createApp } from './app';
import { env } from './config/env';
import { startInstalledWidgets, stopWidget } from './modules/plugins/widgetRunner';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`PlainList API listening on http://localhost:${env.PORT}`);
  void startInstalledWidgets();
});

// Graceful shutdown: clean up detached widget processes on Ctrl+C
function gracefulShutdown(signal: string) {
  console.log(`\n[${signal}] Shutting down gracefully...`);

  // Stop all running widgets
  try {
    const { execSync } = require('child_process');
    console.log('[shutdown] Stopping widget processes...');
    execSync('pkill -f "data/widgets" 2>/dev/null || true');
    execSync('pkill -f "uvicorn.*8000" 2>/dev/null || true');
    execSync('pkill -f "vite.*5174" 2>/dev/null || true');
  } catch (e) {
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
