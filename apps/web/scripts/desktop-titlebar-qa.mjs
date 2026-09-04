#!/usr/bin/env node
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, '../src/shared/styles/main.css'), 'utf8');
const outDir = '/tmp/plainlist-titlebar-qa';
mkdirSync(outDir, { recursive: true });

const html = `<!doctype html>
<html class="pl-desktop pl-desktop-darwin" lang="zh-CN">
<head>
  <meta charset="utf-8">
  <style>${css}</style>
  <style>#app-root.dashboard-ready .app-nav { animation: none !important; opacity: 1 !important; transform: none !important; }</style>
</head>
<body>
  <div id="app-root" class="dashboard-ready">
    <nav class="app-nav">
      <div class="nav-logo">PL/</div>
      <div class="nav-links">
        <a href="#s1" class="active">当下</a>
        <a href="#s2">今日</a>
        <a href="#s3">周</a>
        <a href="#s4">月</a>
        <a href="#s5">年</a>
      </div>
      <div class="nav-right">
        <button type="button" class="nav-widget-btn">FishTime</button>
        <button type="button" id="nav-marketplace">⊞</button>
        <button type="button" class="user-menu-trigger">U ▾</button>
      </div>
    </nav>
  </div>
</body>
</html>`;

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

const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});
await new Promise((resolveListen) => server.listen(4181, '127.0.0.1', resolveListen));

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
await page.goto('http://127.0.0.1:4181/titlebar', { waitUntil: 'networkidle' });
const metrics = await page.evaluate(() => {
  const box = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      right: Math.round(r.right),
      cy: Math.round(r.y + r.height / 2),
      cx: Math.round(r.x + r.width / 2),
    };
  };
  const logo = box('.nav-logo');
  const links = box('.nav-links');
  const right = box('.nav-right');
  const logoRange = document.createRange();
  logoRange.selectNodeContents(document.querySelector('.nav-logo'));
  const logoText = logoRange.getBoundingClientRect();
  const lastRight = document.querySelector('.nav-right').lastElementChild.getBoundingClientRect();
  const overlap = !(logo.right <= links.x || links.right <= logo.x)
    || !(links.right <= right.x || right.right <= links.x)
    || !(logo.right <= right.x || right.right <= logo.x);
  return {
    viewport: 1280,
    logo,
    logoTextX: Math.round(logoText.x),
    links,
    right,
    rightContentRight: Math.round(lastRight.right),
    overlap,
    logoClearsTrafficLights: logoText.x >= 68,
    centerDelta: Math.abs(links.cx - 640),
    rightInset: 1280 - Math.round(lastRight.right),
    verticalSpread: Math.max(logo.cy, links.cy, right.cy) - Math.min(logo.cy, links.cy, right.cy),
  };
});
await page.screenshot({ path: `${outDir}/1280.png` });
await browser.close();
server.close();

const fail = [];
if (metrics.overlap) fail.push('overlap');
if (!metrics.logoClearsTrafficLights) fail.push(`logo-x:${metrics.logo.x}`);
if (metrics.centerDelta > 8) fail.push(`center:${metrics.centerDelta}`);
if (metrics.rightInset < 50 || metrics.rightInset > 90) fail.push(`right-inset:${metrics.rightInset}`);
if (metrics.verticalSpread > 4) fail.push(`vertical:${metrics.verticalSpread}`);
const report = { TITLEBAR_QA: fail.length ? 'FAIL' : 'PASS', fail, metrics };
writeFileSync(`${outDir}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (fail.length) process.exit(1);
