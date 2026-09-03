#!/usr/bin/env node
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '..');
const page = readFileSync(resolve(webRoot, 'public/download/index.html'), 'utf8');
const outDir = '/tmp/plainlist-download-qa';
mkdirSync(outDir, { recursive: true });

const manifest = {
  version: '2.5.0',
  commit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  publishedAt: '2026-09-03T00:00:00.000Z',
  githubRelease: 'https://github.com/rainhuang0220/PlainList/releases/tag/v2.5.0',
  artifacts: [
    {
      platform: 'macos',
      arch: 'arm64',
      filename: 'PlainList-2.5.0-macos-arm64.dmg',
      url: 'https://github.com/rainhuang0220/PlainList/releases/download/v2.5.0/PlainList-2.5.0-macos-arm64.dmg',
      mirrorUrl: '/downloads/PlainList-2.5.0-macos-arm64.dmg',
      sha256: 'a'.repeat(64),
      size: 1,
    },
    {
      platform: 'macos',
      arch: 'x64',
      filename: 'PlainList-2.5.0-macos-x64.dmg',
      url: 'https://github.com/rainhuang0220/PlainList/releases/download/v2.5.0/PlainList-2.5.0-macos-x64.dmg',
      mirrorUrl: '/downloads/PlainList-2.5.0-macos-x64.dmg',
      sha256: 'b'.repeat(64),
      size: 1,
    },
    {
      platform: 'android',
      arch: 'universal',
      filename: 'PlainList-2.5.0-android.apk',
      url: 'https://github.com/rainhuang0220/PlainList/releases/download/v2.5.0/PlainList-2.5.0-android.apk',
      mirrorUrl: '/downloads/PlainList-2.5.0-android.apk',
      sha256: 'c'.repeat(64),
      size: 1,
    },
  ],
};

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
  const url = req.url?.split('?')[0];
  if (url === '/download' || url === '/download/' || url === '/download/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(page);
    return;
  }
  if (url === '/releases/latest.json') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=60, must-revalidate' });
    res.end(JSON.stringify(manifest));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

await new Promise((resolveListen) => server.listen(4180, '127.0.0.1', resolveListen));
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const fail = [];
const report = { DOWNLOAD_PAGE_QA: 'FAIL', scenes: {} };

const viewports = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '390x844', width: 390, height: 844 },
];
const agents = [
  { name: 'macos', ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15', expectHero: 'macOS' },
  { name: 'android', ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36', expectHero: 'Android' },
  { name: 'unknown', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36', expectHero: '打开 Web 版' },
];

try {
  for (const viewport of viewports) {
    for (const agent of agents) {
      const key = `${viewport.name}-${agent.name}`;
      const pageHandle = await browser.newPage({
        viewport,
        userAgent: agent.ua,
      });
      await pageHandle.goto('http://127.0.0.1:4180/download', { waitUntil: 'networkidle' });
      const snapshot = await pageHandle.evaluate((expectedHero) => {
        const hero = document.querySelector('#hero')?.innerText || '';
        const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
        return {
          title: document.title,
          h1: document.querySelector('h1')?.textContent || '',
          lede: document.querySelector('.lede')?.textContent || '',
          hero,
          hasExpectedHero: hero.includes(expectedHero),
          hasWindowsNote: document.body.innerText.includes('Windows — 暂未提供'),
          hasChecksums: Boolean(document.querySelector('details.checksums')),
          version: document.querySelector('#meta')?.innerText || '',
          overflow,
          gridColumns: getComputedStyle(document.querySelector('#grid')).gridTemplateColumns.split(' ').length,
        };
      }, agent.expectHero);
      await pageHandle.screenshot({ path: `${outDir}/${key}.png`, fullPage: true });
      await pageHandle.close();
      const sceneFail = [];
      if (snapshot.title !== '下载 PlainList') sceneFail.push('title');
      if (snapshot.h1 !== '下载 PlainList') sceneFail.push('h1');
      if (!snapshot.lede.includes('在你常用的设备上继续使用 PlainList')) sceneFail.push('lede');
      if (!snapshot.hasExpectedHero) sceneFail.push(`hero:${snapshot.hero}`);
      if (!snapshot.hasWindowsNote) sceneFail.push('windows');
      if (!snapshot.hasChecksums) sceneFail.push('checksums');
      if (!snapshot.version.includes('v2.5.0')) sceneFail.push('version');
      if (snapshot.overflow) sceneFail.push('overflow');
      if (viewport.width <= 390 && snapshot.gridColumns !== 1) sceneFail.push(`grid:${snapshot.gridColumns}`);
      if (viewport.width >= 1280 && snapshot.gridColumns !== 2) sceneFail.push(`grid:${snapshot.gridColumns}`);
      report.scenes[key] = sceneFail.length ? { status: 'FAIL', sceneFail, snapshot } : { status: 'PASS', snapshot };
      if (sceneFail.length) fail.push(key);
    }
  }

  const installed = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await installed.goto('http://127.0.0.1:4180/download?client=desktop', { waitUntil: 'networkidle' });
  const installedText = await installed.evaluate(() => document.querySelector('#installed')?.textContent || '');
  await installed.screenshot({ path: `${outDir}/installed-desktop.png`, fullPage: true });
  await installed.close();
  report.scenes['installed-desktop'] = installedText.includes('你正在使用 PlainList Desktop')
    ? { status: 'PASS', installedText }
    : { status: 'FAIL', installedText };
  if (!installedText.includes('你正在使用 PlainList Desktop')) fail.push('installed-desktop');

  report.DOWNLOAD_PAGE_QA = fail.length ? 'FAIL' : 'PASS';
  writeFileSync(`${outDir}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (fail.length) process.exit(1);
} finally {
  await browser.close();
  server.close();
}
