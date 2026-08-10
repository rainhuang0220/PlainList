/**
 * FishTime local foreground-app monitor for Electron (macOS / fallback).
 *
 * Polls the frontmost app (lsappinfo on macOS), accumulates per-day seconds
 * in userData, and serves the existing FishTime UI + compatible /api/* JSON.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const DEFAULT_PORT = 18765;
const TICK_MS = 1000;
const FLUSH_MS = 10_000;

/** Apps we never count (self + system chrome). */
const IGNORE = new Set([
  'PlainList',
  'loginwindow',
  'ScreenSaverEngine',
  'Notification Center',
  'Control Center',
  'SystemUIServer',
  'Window Server',
  'Dock',
  'Spotlight',
]);

function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function weekKeys() {
  const keys = [];
  const d = new Date();
  for (let i = 0; i < 7; i++) {
    const x = new Date(d);
    x.setDate(d.getDate() - i);
    keys.push(todayKey(x));
  }
  return keys;
}

async function getFrontmostAppMac() {
  try {
    const { stdout: front } = await execFileAsync('lsappinfo', ['front'], {
      timeout: 2000,
    });
    const frontId = (front || '').trim();
    if (!frontId) return null;
    const { stdout: info } = await execFileAsync(
      'lsappinfo',
      ['info', '-only', 'name', frontId],
      { timeout: 2000 },
    );
    const m = /"(?:LSDisplay)?Name"\s*=\s*"([^"]+)"/.exec(info || '');
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

async function getFrontmostApp() {
  if (process.platform === 'darwin') return getFrontmostAppMac();
  return null;
}

function loadState(filePath) {
  const empty = {
    days: {},
    whitelist: [],
    limits: {},
    aiConfig: { api_key: '', base_url: 'https://api.openai.com/v1', model: 'gpt-3.5-turbo' },
  };
  try {
    if (!fs.existsSync(filePath)) return empty;
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      days: raw.days && typeof raw.days === 'object' ? raw.days : {},
      whitelist: Array.isArray(raw.whitelist) ? raw.whitelist : [],
      limits: raw.limits && typeof raw.limits === 'object' ? raw.limits : {},
      aiConfig:
        raw.aiConfig && typeof raw.aiConfig === 'object'
          ? { ...empty.aiConfig, ...raw.aiConfig }
          : empty.aiConfig,
    };
  } catch {
    return empty;
  }
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return (
    {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
    }[ext] || 'application/octet-stream'
  );
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

/**
 * @param {{ userDataPath: string, staticDir: string, port?: number }} opts
 */
function startFishTimeLocal(opts) {
  const port = opts.port || DEFAULT_PORT;
  const statePath = path.join(opts.userDataPath, 'fishtime-usage.json');
  const staticDir = opts.staticDir;
  const state = loadState(statePath);

  let currentApp = null;
  let dirty = false;
  let tickTimer = null;
  let flushTimer = null;
  let server = null;

  function ensureDay(day) {
    if (!state.days[day] || typeof state.days[day] !== 'object') {
      state.days[day] = {};
    }
    return state.days[day];
  }

  function flush() {
    if (!dirty) return;
    try {
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
      dirty = false;
    } catch (e) {
      console.error('[fishtime-local] flush failed:', e);
    }
  }

  function addSecond(appName) {
    if (!appName || IGNORE.has(appName)) return;
    if (state.whitelist.includes(appName)) return;
    const day = ensureDay(todayKey());
    day[appName] = (day[appName] || 0) + 1;
    dirty = true;
  }

  async function tick() {
    const name = await getFrontmostApp();
    currentApp = name;
    if (name) addSecond(name);
  }

  function usageList(dayMap) {
    return Object.entries(dayMap || {})
      .map(([name, duration]) => ({ name, duration: Number(duration) || 0 }))
      .filter((x) => x.duration > 0)
      .sort((a, b) => b.duration - a.duration);
  }

  function aggregateDays(keys) {
    const agg = {};
    for (const k of keys) {
      const day = state.days[k] || {};
      for (const [name, secs] of Object.entries(day)) {
        agg[name] = (agg[name] || 0) + (Number(secs) || 0);
      }
    }
    return usageList(agg);
  }

  async function handleApi(req, res, urlPath) {
    const method = req.method || 'GET';

    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    if (urlPath === '/api/status' && method === 'GET') {
      sendJson(res, 200, {
        current_app: [currentApp, null, null],
        configured: true,
      });
      return;
    }

    if (urlPath === '/api/today' && method === 'GET') {
      sendJson(res, 200, usageList(ensureDay(todayKey())));
      return;
    }

    if (urlPath === '/api/week' && method === 'GET') {
      sendJson(res, 200, aggregateDays(weekKeys()));
      return;
    }

    if (urlPath === '/api/processes' && method === 'GET') {
      const names = new Set();
      for (const k of weekKeys()) {
        for (const n of Object.keys(state.days[k] || {})) names.add(n);
      }
      if (currentApp) names.add(currentApp);
      sendJson(res, 200, [...names].sort());
      return;
    }

    if (urlPath.startsWith('/api/icon/') && method === 'GET') {
      const appName = decodeURIComponent(urlPath.slice('/api/icon/'.length));
      sendJson(res, 200, { image: null, name: appName });
      return;
    }

    if (urlPath === '/api/whitelist' && method === 'GET') {
      sendJson(res, 200, state.whitelist);
      return;
    }

    if (urlPath === '/api/whitelist' && method === 'POST') {
      const body = await readBody(req);
      const item = body.item;
      if (item && !state.whitelist.includes(item)) {
        state.whitelist.push(item);
        dirty = true;
        flush();
      }
      sendJson(res, 200, state.whitelist);
      return;
    }

    if (urlPath === '/api/whitelist' && method === 'DELETE') {
      const body = await readBody(req);
      const item = body.item;
      state.whitelist = state.whitelist.filter((x) => x !== item);
      dirty = true;
      flush();
      sendJson(res, 200, state.whitelist);
      return;
    }

    if (urlPath === '/api/limits' && method === 'GET') {
      sendJson(res, 200, state.limits);
      return;
    }

    if (urlPath === '/api/limits' && method === 'POST') {
      const body = await readBody(req);
      state.limits = body && typeof body === 'object' ? body : {};
      dirty = true;
      flush();
      sendJson(res, 200, state.limits);
      return;
    }

    if (urlPath === '/api/ai-config' && method === 'GET') {
      sendJson(res, 200, state.aiConfig);
      return;
    }

    if (urlPath === '/api/ai-config' && method === 'POST') {
      const body = await readBody(req);
      state.aiConfig = { ...state.aiConfig, ...body };
      dirty = true;
      flush();
      sendJson(res, 200, state.aiConfig);
      return;
    }

    if (urlPath === '/api/report/ai' && method === 'POST') {
      sendJson(res, 200, {
        error: '本机监测模式暂不支持 AI 锐评（无需 WakaTime）。',
      });
      return;
    }

    sendJson(res, 404, { error: 'not found' });
  }

  function serveStatic(req, res, urlPath) {
    let rel = urlPath === '/' ? '/index.html' : urlPath;
    // strip query
    rel = rel.split('?')[0];
    const filePath = path.normalize(path.join(staticDir, rel));
    if (!filePath.startsWith(staticDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      // SPA fallback
      const indexHtml = path.join(staticDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(indexHtml).pipe(res);
        return;
      }
      res.writeHead(404);
      res.end('FishTime UI missing');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType(filePath) });
    fs.createReadStream(filePath).pipe(res);
  }

  server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url || '/', `http://127.0.0.1:${port}`);
      if (u.pathname.startsWith('/api/')) {
        await handleApi(req, res, u.pathname);
        return;
      }
      serveStatic(req, res, u.pathname);
    } catch (e) {
      console.error('[fishtime-local] request error:', e);
      sendJson(res, 500, { error: String(e && e.message ? e.message : e) });
    }
  });

  const baseUrl = `http://127.0.0.1:${port}/`;

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      tickTimer = setInterval(() => {
        tick().catch((e) => console.error('[fishtime-local] tick:', e));
      }, TICK_MS);
      flushTimer = setInterval(flush, FLUSH_MS);
      // prime immediately
      tick().catch(() => {});
      console.log(`[fishtime-local] listening on ${baseUrl}`);
      resolve({
        port,
        baseUrl,
        stop() {
          flush();
          if (tickTimer) clearInterval(tickTimer);
          if (flushTimer) clearInterval(flushTimer);
          return new Promise((resStop) => {
            if (!server) return resStop();
            server.close(() => resStop());
          });
        },
      });
    });
  });
}

module.exports = { startFishTimeLocal, DEFAULT_PORT };
