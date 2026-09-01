import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const appPath = process.env.PLAINLIST_DESKTOP_APP;
const playwrightModule = process.env.PLAYWRIGHT_CORE_MODULE;

if (!appPath || !playwrightModule) {
  throw new Error('Set PLAINLIST_DESKTOP_APP and PLAYWRIGHT_CORE_MODULE before running this smoke test.');
}

const executable = join(appPath, 'Contents', 'MacOS', 'PlainList');
await access(executable);

const { chromium } = await import(playwrightModule);
const debugPort = Number(process.env.PLAINLIST_DEBUG_PORT || 9227);
const profilePath = await mkdtemp(join(tmpdir(), 'plainlist-desktop-smoke-profile-'));
const app = spawn(executable, [
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profilePath}`,
], { stdio: 'ignore' });

const result = {
  transport: 'renderer -> preload IPC -> Electron main net.fetch',
  accounts: {
    method: null,
    url: null,
    status: null,
    rendererCommandPassed: false,
  },
  login: {
    command: 'demo',
    dashboardReady: false,
  },
  authenticated: {
    method: null,
    url: null,
    status: null,
    storageBacked: false,
  },
};

async function waitForDebugger() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (response.ok) return;
    } catch {
      // Electron has not started its debugging endpoint yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for the packaged Electron app to start.');
}

try {
  await waitForDebugger();
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
  const page = browser.contexts().flatMap((context) => context.pages())
    .find((candidate) => candidate.url().startsWith('file:'));
  if (!page) throw new Error('Could not find the packaged renderer page.');

  const response = await page.evaluate(async () => {
    const result = await window.plainlistDesktop.api.request({ method: 'GET', path: '/auth/accounts' });
    return { status: result.status, statusText: result.statusText };
  });
  result.accounts.method = 'GET';
  result.accounts.url = 'https://plainlist.space/api/auth/accounts';
  result.accounts.status = response.status;

  const input = page.locator('#auth-terminal input');
  await input.waitFor({ state: 'visible', timeout: 20_000 });
  await input.fill('ls');
  await input.press('Enter');
  await page.waitForFunction(() => document.querySelector('#term-body')?.textContent?.includes('accounts:'), undefined, { timeout: 20_000 });
  result.accounts.rendererCommandPassed = true;

  if (result.accounts.status !== 200) {
    throw new Error(`Accounts request did not succeed: ${JSON.stringify(result.accounts)}`);
  }

  await input.fill('demo');
  await input.press('Enter');
  await page.waitForFunction(
    () => document.querySelector('#app-root')?.classList.contains('dashboard-ready')
      && Boolean(document.querySelector('.app-nav')),
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForFunction(
    () => Boolean(sessionStorage.getItem('pl_token')),
    undefined,
    { timeout: 10_000 },
  );
  result.login.dashboardReady = true;

  const me = await page.evaluate(async () => {
    const token = sessionStorage.getItem('pl_token');
    if (!token) {
      return { status: 0, statusText: 'missing-storage-token', storageBacked: false };
    }
    const response = await window.plainlistDesktop.api.request({
      method: 'GET',
      path: '/auth/me',
      authorization: `Bearer ${token}`,
    });
    return {
      status: response.status,
      statusText: response.statusText,
      storageBacked: true,
    };
  });
  result.authenticated.method = 'GET';
  result.authenticated.url = 'https://plainlist.space/api/auth/me';
  result.authenticated.status = me.status;
  result.authenticated.storageBacked = me.storageBacked === true;

  if (result.authenticated.status !== 200 || !result.authenticated.storageBacked) {
    throw new Error(`Authenticated request did not succeed: ${JSON.stringify(result.authenticated)}`);
  }

  console.log(JSON.stringify(result));
  await browser.close();
} finally {
  app.kill('SIGTERM');
  await Promise.race([once(app, 'exit'), new Promise((resolve) => setTimeout(resolve, 2_000))]);
  await rm(profilePath, { recursive: true, force: true });
}
