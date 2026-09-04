#!/usr/bin/env node
/**
 * Packaged-app login QA against a real PlainList.app (from a DMG, not /Applications).
 *
 * Required env:
 *   PLAINLIST_DESKTOP_APP     path to PlainList.app
 *   PLAYWRIGHT_CORE_MODULE    playwright-core module path (optional if resolvable)
 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const appPath = process.env.PLAINLIST_DESKTOP_APP;
if (!appPath) {
  throw new Error('Set PLAINLIST_DESKTOP_APP to the packaged PlainList.app');
}

const executable = join(appPath, 'Contents', 'MacOS', 'PlainList');
await access(executable);

async function loadPlaywright() {
  if (process.env.PLAYWRIGHT_CORE_MODULE) {
    return import(process.env.PLAYWRIGHT_CORE_MODULE);
  }
  try {
    return await import('playwright-core');
  } catch {
    try {
      return await import('playwright');
    } catch {
      return import(pathToFileURL('/Users/rainhuang/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs').href);
    }
  }
}

const { chromium } = await loadPlaywright();

const USER = process.env.PLAINLIST_QA_USER || 'admin';
const PASS = process.env.PLAINLIST_QA_PASS || 'admin';
const WRONG = 'not-the-passphrase-123';

function termText(page) {
  return page.evaluate(() => document.querySelector('#term-body')?.textContent || '');
}

async function waitForDebugger(port) {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for Electron debugger on ${port}`);
}

async function withPackagedApp(port, fn) {
  const profilePath = await mkdtemp(join(tmpdir(), 'plainlist-login-qa-'));
  const app = spawn(executable, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profilePath}`,
  ], {
    stdio: 'ignore',
    cwd: dirname(executable),
  });
  try {
    await waitForDebugger(port);
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const page = browser.contexts().flatMap((context) => context.pages())
      .find((candidate) => candidate.url().startsWith('file:'));
    if (!page) throw new Error('Could not find the packaged renderer page.');
    const input = page.locator('#auth-terminal input');
    await input.waitFor({ state: 'visible', timeout: 20_000 });
    const result = await fn(page, input);
    await browser.close();
    return result;
  } finally {
    app.kill('SIGTERM');
    await Promise.race([once(app, 'exit'), new Promise((resolve) => setTimeout(resolve, 2_000))]);
    await rm(profilePath, { recursive: true, force: true });
  }
}

async function submitCommand(input, value) {
  await input.fill(value);
  await input.press('Enter');
}

/** Real keystrokes so the anti-autofill gate counts this as a human edit. */
async function submitPassword(input, value) {
  await input.click();
  await input.fill('');
  await input.type(value, { delay: 0 });
  await input.press('Enter');
}

async function waitDashboard(page) {
  await page.waitForFunction(
    () => document.querySelector('#app-root')?.classList.contains('dashboard-ready')
      && Boolean(document.querySelector('.app-nav')),
    undefined,
    { timeout: 30_000 },
  );
}

function assertNoCommandParse(text, password) {
  if (text.includes(`unknown command: ${password}`) || text.includes('unknown command:')) {
    const hit = text.split('\n').filter((line) => line.includes('unknown command')).join(' | ');
    throw new Error(`password parsed as command: ${hit}`);
  }
}

const report = {
  fastInputZeroWait: 'FAIL',
  wrongThenCorrect: 'FAIL',
  twoWrongThenCorrect: 'FAIL',
  threeWrong: 'FAIL',
  passwordParsedAsCommand: false,
};

try {
  await withPackagedApp(9241, async (page, input) => {
    await submitCommand(input, `cd ${USER}`);
    await input.type(PASS, { delay: 0 });
    await input.press('Enter');
    const text = await termText(page);
    assertNoCommandParse(text, PASS);
    await waitDashboard(page);
    report.fastInputZeroWait = 'PASS';
  });

  await withPackagedApp(9242, async (page, input) => {
    await submitCommand(input, `cd ${USER}`);
    await page.waitForFunction(
      () => (document.querySelector('#term-body')?.textContent || '').includes('passphrase for'),
      undefined,
      { timeout: 8_000 },
    );
    await submitPassword(input, WRONG);
    await page.waitForFunction(
      () => (document.querySelector('#term-body')?.textContent || '').includes('try again'),
      undefined,
      { timeout: 15_000 },
    );
    let text = await termText(page);
    assertNoCommandParse(text, WRONG);
    await submitPassword(input, PASS);
    text = await termText(page);
    assertNoCommandParse(text, PASS);
    await waitDashboard(page);
    report.wrongThenCorrect = 'PASS';
  });

  await withPackagedApp(9243, async (page, input) => {
    await submitCommand(input, `cd ${USER}`);
    await page.waitForFunction(
      () => (document.querySelector('#term-body')?.textContent || '').includes('passphrase for'),
      undefined,
      { timeout: 8_000 },
    );
    await submitPassword(input, `${WRONG}-1`);
    await page.waitForFunction(
      () => (document.querySelector('#term-body')?.textContent || '').includes('try again'),
      undefined,
      { timeout: 15_000 },
    );
    await submitPassword(input, `${WRONG}-2`);
    await page.waitForFunction(
      () => (document.querySelector('#term-body')?.textContent || '').includes('1 left'),
      undefined,
      { timeout: 15_000 },
    );
    let text = await termText(page);
    assertNoCommandParse(text, `${WRONG}-2`);
    await submitPassword(input, PASS);
    text = await termText(page);
    assertNoCommandParse(text, PASS);
    await waitDashboard(page);
    report.twoWrongThenCorrect = 'PASS';
  });

  await withPackagedApp(9244, async (page, input) => {
    await submitCommand(input, `cd ${USER}`);
    await page.waitForFunction(
      () => (document.querySelector('#term-body')?.textContent || '').includes('passphrase for'),
      undefined,
      { timeout: 8_000 },
    );
    await submitPassword(input, `${WRONG}-a`);
    await page.waitForFunction(
      () => (document.querySelector('#term-body')?.textContent || '').includes('try again'),
      undefined,
      { timeout: 15_000 },
    );
    await submitPassword(input, `${WRONG}-b`);
    await page.waitForFunction(
      () => (document.querySelector('#term-body')?.textContent || '').includes('1 left'),
      undefined,
      { timeout: 15_000 },
    );
    await submitPassword(input, `${WRONG}-c`);
    await page.waitForFunction(
      () => (document.querySelector('#term-body')?.textContent || '').includes('authentication failed'),
      undefined,
      { timeout: 15_000 },
    );
    let text = await termText(page);
    assertNoCommandParse(text, `${WRONG}-c`);
    await submitCommand(input, 'ls');
    await page.waitForFunction(
      () => {
        const body = document.querySelector('#term-body')?.textContent || '';
        return body.includes('accounts:') || body.includes('no accounts yet.');
      },
      undefined,
      { timeout: 15_000 },
    );
    text = await termText(page);
    if (text.includes('unknown command: ls')) {
      throw new Error('after three wrong passwords, ls should be a command again');
    }
    report.threeWrong = 'PASS';
  });
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  const text = report.error || '';
  report.passwordParsedAsCommand = text.includes('password parsed as command');
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));
