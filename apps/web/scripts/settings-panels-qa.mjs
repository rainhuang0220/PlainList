#!/usr/bin/env node
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '..');
const outDir = '/tmp/plainlist-settings-qa';
mkdirSync(outDir, { recursive: true });

async function loadPlaywright() {
  if (process.env.PLAYWRIGHT_MODULE) {
    return import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
  }
  try {
    return await import('playwright');
  } catch {
    return import(pathToFileURL('/Users/rainhuang/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs').href);
  }
}
const { chromium } = await loadPlaywright();

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>settings qa</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/scripts/settings-qa-app.ts"></script>
</body>
</html>`;

const server = await createServer({
  configFile: resolve(webRoot, 'vite.config.ts'),
  root: webRoot,
  server: { port: 4179, strictPort: true, host: '127.0.0.1' },
  plugins: [{
    name: 'settings-qa-page',
    configureServer(viteServer) {
      viteServer.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0];
        if (url === '/__qa/settings') {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(html);
          return;
        }
        next();
      });
    },
  }],
});
await server.listen();

const origin = 'http://127.0.0.1:4179';
const browser = await chromium.launch();
const fail = [];
const report = { SCROLL_RESET: 'FAIL', REAL_BROWSER_QA: 'FAIL', PIXEL_ALIGNMENT: 'FAIL', OUTER_SETTINGS_CHANGED: 'UNKNOWN', scenes: {} };

function box(rect) {
  if (!rect) return null;
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    w: Math.round(rect.width),
    h: Math.round(rect.height),
    right: Math.round(rect.x + rect.width),
    bottom: Math.round(rect.y + rect.height),
  };
}

async function measure(page) {
  return page.evaluate(() => {
    const rect = (sel) => document.querySelector(sel)?.getBoundingClientRect()?.toJSON() ?? null;
    const cs = (sel) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el) : null;
    };
    const body = document.querySelector('.us-main-body');
    const title = document.querySelector('.us-main-title');
    const head = document.querySelector('.us-main-head');
    const padLeft = body ? Number.parseFloat(getComputedStyle(body).paddingLeft) : 0;
    const padRight = body ? Number.parseFloat(getComputedStyle(body).paddingRight) : 0;
    const headPadLeft = head ? Number.parseFloat(getComputedStyle(head).paddingLeft) : 0;
    const headPadRight = head ? Number.parseFloat(getComputedStyle(head).paddingRight) : 0;
    const bodyBox = body?.getBoundingClientRect();
    const headBox = head?.getBoundingClientRect();
    const contentLeft = bodyBox ? bodyBox.left + padLeft : null;
    const contentRight = bodyBox ? bodyBox.right - padRight : null;
    const titleRightAvailable = headBox ? headBox.right - headPadRight : null;
    const titleBox = title?.getBoundingClientRect();
    const weeks = document.querySelector('.us-modal .weeks')?.getBoundingClientRect();
    const reader = document.querySelector('.us-modal .article')?.getBoundingClientRect();
    const source = document.querySelector('.us-modal .chatgpt-source');
    const status = document.querySelector('.chatgpt-source .status')?.getBoundingClientRect();
    const metaNodes = [...document.querySelectorAll('.chatgpt-source .copy, .chatgpt-source .meta, .chatgpt-source .status, .chatgpt-source .actions')];
    let maxGap = 0;
    for (let i = 1; i < metaNodes.length; i += 1) {
      const prev = metaNodes[i - 1].getBoundingClientRect();
      const next = metaNodes[i].getBoundingClientRect();
      const gap = next.top - prev.bottom;
      if (gap > maxGap) maxGap = gap;
    }
    const actions = document.querySelector('.chatgpt-source .actions')?.getBoundingClientRect();
    const lastAction = document.querySelector('.chatgpt-source .actions > :last-child')?.getBoundingClientRect();
    return {
      modal: rect('.us-modal'),
      side: rect('.us-side'),
      body: rect('.us-main-body'),
      title: rect('.us-main-title'),
      close: rect('.us-main-x'),
      frame: rect('.us-modal .frame'),
      weeks: rect('.us-modal .weeks'),
      reader: rect('.us-modal .article'),
      source: rect('.us-modal .chatgpt-source'),
      status,
      actions,
      lastAction,
      padLeft,
      padRight,
      headPadLeft,
      headPadRight,
      contentLeft,
      contentRight,
      titleX: titleBox?.left ?? null,
      titleRightAvailable,
      weekRailX: weeks?.left ?? null,
      weekRailWidth: weeks?.width ?? null,
      readerX: reader?.left ?? null,
      readerRight: reader ? reader.left + reader.width : null,
      readerWidth: reader?.width ?? null,
      titleAlignmentDelta: weeks && titleBox ? weeks.left - titleBox.left : null,
      rightEdgeDelta: reader && contentRight != null ? contentRight - (reader.left + reader.width) : null,
      maxInternalGap: maxGap,
      sourceTop: source?.getBoundingClientRect().top ?? null,
      sourceBottom: source?.getBoundingClientRect().bottom ?? null,
    };
  });
}

async function openScene(page, query) {
  await page.goto(`${origin}/__qa/settings?${query}`);
  await page.waitForSelector('.us-modal');
  await page.waitForTimeout(80);
}

try {
  for (const vp of [
    { name: '1440x900', width: 1440, height: 900 },
    { name: '1280x800', width: 1280, height: 800 },
  ]) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    const scenes = {
      account: 'section=account',
      activityDisconnected: 'section=chatgpt-local-sync&activity=disconnected',
      activityConnected: 'section=chatgpt-local-sync&activity=connected',
      journal: 'section=ai-journal',
    };
    for (const [name, query] of Object.entries(scenes)) {
      await openScene(page, query);
      const m = await measure(page);
      await page.screenshot({ path: `${outDir}/${vp.name}-${name}.png` });
      report.scenes[`${vp.name}-${name}`] = {
        modal: box(m.modal),
        side: box(m.side),
        title: box(m.title),
        body: box(m.body),
        frame: box(m.frame),
        weeks: box(m.weeks),
        reader: box(m.reader),
        source: box(m.source),
        contentLeft: m.contentLeft != null ? Math.round(m.contentLeft) : null,
        contentRight: m.contentRight != null ? Math.round(m.contentRight) : null,
        titleX: m.titleX != null ? Math.round(m.titleX) : null,
        titleRightAvailable: m.titleRightAvailable != null ? Math.round(m.titleRightAvailable) : null,
        weekRailX: m.weekRailX != null ? Math.round(m.weekRailX) : null,
        weekRailWidth: m.weekRailWidth != null ? Math.round(m.weekRailWidth) : null,
        readerX: m.readerX != null ? Math.round(m.readerX) : null,
        readerRight: m.readerRight != null ? Math.round(m.readerRight) : null,
        readerWidth: m.readerWidth != null ? Math.round(m.readerWidth) : null,
        titleAlignmentDelta: m.titleAlignmentDelta != null ? Number(m.titleAlignmentDelta.toFixed(2)) : null,
        rightEdgeDelta: m.rightEdgeDelta != null ? Number(m.rightEdgeDelta.toFixed(2)) : null,
        maxInternalGap: Number(m.maxInternalGap.toFixed(2)),
        sourceTop: m.sourceTop != null ? Math.round(m.sourceTop) : null,
        sourceBottom: m.sourceBottom != null ? Math.round(m.sourceBottom) : null,
      };
      if (Math.round(m.modal.width) !== 860 || Math.round(m.modal.height) !== 640) {
        fail.push(`${vp.name}/${name} outer modal ${Math.round(m.modal.width)}x${Math.round(m.modal.height)}`);
      }
      if (name.startsWith('activity') && m.maxInternalGap > 24) {
        fail.push(`${vp.name}/${name} internal gap ${m.maxInternalGap}`);
      }
      if (name === 'journal') {
        if (Math.abs(m.titleAlignmentDelta) > 2) fail.push(`${vp.name}/journal title delta ${m.titleAlignmentDelta}`);
        if (Math.abs(m.rightEdgeDelta) > 2) fail.push(`${vp.name}/journal right delta ${m.rightEdgeDelta}`);
      }
    }

    await openScene(page, 'section=ai-journal');
    await page.waitForSelector('.us-modal .article .prose');
    const reader = page.locator('.us-modal .article');
    const scrolled = await reader.evaluate((el) => {
      el.scrollTop = Math.min(240, el.scrollHeight / 2);
      return el.scrollTop;
    });
    if (scrolled < 40) fail.push(`${vp.name} could not scroll reader (scrollTop=${scrolled})`);
    await page.screenshot({ path: `${outDir}/${vp.name}-journal-scrolled.png` });
    await page.locator('.us-modal .weeks button', { hasText: '8 月 18 日–8 月 24 日' }).click();
    await page.waitForTimeout(50);
    const afterB = await reader.evaluate((el) => el.scrollTop);
    if (afterB !== 0) fail.push(`${vp.name} week B inherited scroll ${afterB}`);
    await page.screenshot({ path: `${outDir}/${vp.name}-journal-week-b.png` });
    await reader.evaluate((el) => { el.scrollTop = 180; });
    await page.locator('.us-modal .weeks button', { hasText: '8 月 25 日–8 月 31 日' }).click();
    await page.waitForTimeout(50);
    const afterA = await reader.evaluate((el) => el.scrollTop);
    if (afterA !== 0) fail.push(`${vp.name} week A inherited scroll ${afterA}`);
    await page.close();
  }

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await openScene(mobile, 'section=ai-journal');
  await mobile.waitForSelector('.article .prose');
  await mobile.screenshot({ path: `${outDir}/390x844-journal.png` });
  await openScene(mobile, 'section=chatgpt-local-sync&activity=disconnected');
  await mobile.screenshot({ path: `${outDir}/390x844-activity-disconnected.png` });
  await openScene(mobile, 'section=chatgpt-local-sync&activity=connected');
  await mobile.screenshot({ path: `${outDir}/390x844-activity-connected.png` });
  const mobileJournal = await measure(mobile);
  report.scenes['390x844-last'] = { modal: box(mobileJournal.modal) };
  await mobile.close();

  if (!fail.some((item) => item.includes('inherited scroll'))) report.SCROLL_RESET = 'PASS';
  if (!fail.some((item) => item.includes('delta'))) report.PIXEL_ALIGNMENT = 'PASS';
  if (!fail.length) report.REAL_BROWSER_QA = 'PASS';
  report.OUTER_SETTINGS_CHANGED = fail.some((item) => item.includes('outer modal')) ? 'YES' : 'NO';
  report.fail = fail;
} finally {
  await browser.close();
  await server.close();
}

writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (fail.length) {
  console.error('QA FAIL', fail);
  process.exit(1);
}
console.log('SETTINGS QA PASS');
