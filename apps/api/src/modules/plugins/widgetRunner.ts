import { execSync, spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { pool } from '../../db/pool';

// The API may run with cwd = repo root or apps/<name>; anchor paths at the
// monorepo root (the directory that contains the top-level plugins/ sources).
function findAppRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'plugins'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const APP_ROOT = findAppRoot();
const WIDGETS_DIR = path.join(APP_ROOT, 'data', 'widgets');

const COPY_SKIP = new Set(['.git', '.venv', 'node_modules', '__pycache__']);

const running = new Map<string, ChildProcess>();
const stopping = new Set<string>();
const restartAttempts = new Map<string, number>();
const MAX_RESTART_ATTEMPTS = 5;
const RESTART_DELAYS_MS = [1000, 2000, 5000, 10000, 30000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseWidgetPort(widgetUrl?: string): number | null {
  if (!widgetUrl) return null;
  try {
    const url = new URL(widgetUrl);
    const port = parseInt(url.port, 10);
    return Number.isNaN(port) ? null : port;
  } catch {
    return null;
  }
}

async function waitForWidgetPort(port: number, timeoutMs = 120000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  let lastLog = 0;
  while (Date.now() < deadline) {
    if (await isPortInUse(port)) return true;
    const now = Date.now();
    if (now - lastLog > 5000) {
      console.log(`[widget:health] waiting for port ${port}...`);
      lastLog = now;
    }
    await sleep(500);
  }
  return false;
}

interface WidgetInfo {
  id: string;
  category: string;
  widgetUrl?: string;
  repoUrl?: string;
  sourcePath?: string;
}

async function getWidgetInfo(pluginId: string): Promise<WidgetInfo | null> {
  try {
    const [rows] = await pool.query(
      `SELECT p.id, p.category, p.repo_url, pv.manifest
       FROM plugins p
       LEFT JOIN plugin_versions pv ON pv.plugin_id = p.id AND pv.is_latest = 1
       WHERE p.id = ?`,
      [pluginId],
    );

    const list = rows as any[];
    if (list.length === 0) return null;

    const row = list[0];
    const manifest = row.manifest
      ? (typeof row.manifest === 'string' ? JSON.parse(row.manifest) : row.manifest)
      : {};

    return {
      id: row.id,
      category: row.category,
      widgetUrl: manifest.widgetUrl ?? undefined,
      repoUrl: row.repo_url ?? undefined,
      sourcePath: manifest.sourcePath ?? undefined,
    };
  } catch {
    return null;
  }
}

function widgetDir(pluginId: string) {
  return path.join(WIDGETS_DIR, pluginId);
}

function widgetReady(pluginId: string): boolean {
  const dir = widgetDir(pluginId);
  return fs.existsSync(path.join(dir, 'start.sh'));
}

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}`, () => {
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function copyLocalSource(pluginId: string, sourcePath: string): void {
  const src = path.resolve(APP_ROOT, sourcePath);
  if (!src.startsWith(APP_ROOT + path.sep)) {
    throw new Error(`sourcePath escapes app root: ${sourcePath}`);
  }
  if (!fs.existsSync(path.join(src, 'start.sh'))) {
    throw new Error(`local widget source missing start.sh: ${src}`);
  }
  const dir = widgetDir(pluginId);
  console.log(`[widget:${pluginId}] copying local source ${src} ...`);
  fs.cpSync(src, dir, {
    recursive: true,
    filter: (from) => !COPY_SKIP.has(path.basename(from)),
  });
}

/**
 * Ensure widget files exist locally.
 * - manifest.sourcePath: copy from a directory bundled with the app (no network)
 * - repoUrl: git clone once into data/widgets/<id>
 * - Re-install / server restart: reuse cached directory
 * - Set WIDGET_UPDATE=1 to refresh (git pull / re-copy) before start
 */
export async function installWidget(
  pluginId: string,
  source: { repoUrl?: string; sourcePath?: string },
): Promise<void> {
  fs.mkdirSync(WIDGETS_DIR, { recursive: true });
  const dir = widgetDir(pluginId);
  const forceUpdate = process.env.WIDGET_UPDATE === '1';

  if (widgetReady(pluginId) && !forceUpdate) {
    console.log(`[widget:${pluginId}] using cached install at ${dir}`);
  } else if (source.sourcePath) {
    copyLocalSource(pluginId, source.sourcePath);
  } else if (source.repoUrl) {
    if (widgetReady(pluginId)) {
      console.log(`[widget:${pluginId}] cached install found, pulling updates (WIDGET_UPDATE=1)...`);
      execSync('git pull', { cwd: dir, stdio: 'inherit' });
    } else {
      console.log(`[widget:${pluginId}] cloning ${source.repoUrl} ...`);
      execSync(`git clone ${source.repoUrl} "${dir}"`, { stdio: 'inherit' });
    }
  } else {
    console.warn(`[widget:${pluginId}] no sourcePath or repoUrl, nothing to install`);
    return;
  }

  await startWidget(pluginId);
}

export async function startWidget(pluginId: string): Promise<void> {
  if (running.has(pluginId)) return;

  // We may be re-entering here after an unexpected exit or a failed health
  // check. Clear the "stopping" flag so the new spawn is not treated as a
  // deliberate shutdown.
  stopping.delete(pluginId);

  const attempts = restartAttempts.get(pluginId) || 0;
  if (attempts >= MAX_RESTART_ATTEMPTS) {
    console.error(
      `[widget:${pluginId}] reached max restart attempts (${MAX_RESTART_ATTEMPTS}), giving up`,
    );
    return;
  }

  // Stop any stale child process from a previous API restart (tsx watch).
  // The `running` Map is per-process — a restart creates a new process that
  // loses the old Map, but the old detached children are still alive and
  // holding ports. The start.sh scripts also self-clean, but this is a
  // belt-and-suspenders measure.
  stopWidget(pluginId);

  const info = await getWidgetInfo(pluginId);
  const widgetPort = parseWidgetPort(info?.widgetUrl);

  const dir = widgetDir(pluginId);
  const script = path.join(dir, 'start.sh');

  if (!fs.existsSync(script)) {
    console.warn(`[widget:${pluginId}] start.sh not found in ${dir}, skipping`);
    return;
  }

  try {
    execSync(`chmod +x "${script}"`);
  } catch {
    // chmod may fail on some filesystems, proceed anyway
  }

  console.log(`[widget:${pluginId}] starting...`);

  const proc = spawn('bash', [script], {
    cwd: dir,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  proc.stdout?.on('data', (d: Buffer) => process.stdout.write(`[widget:${pluginId}] ${d}`));
  proc.stderr?.on('data', (d: Buffer) => process.stderr.write(`[widget:${pluginId}] ${d}`));
  proc.on('exit', (code, signal) => {
    console.log(`[widget:${pluginId}] exited with code ${code}, signal ${signal}`);
    running.delete(pluginId);

    // If this was a deliberate stop we do not auto-restart.
    if (stopping.has(pluginId)) {
      stopping.delete(pluginId);
      restartAttempts.delete(pluginId);
      return;
    }

    // Unexpected exit: schedule a restart with exponential backoff.
    const nextAttempt = (restartAttempts.get(pluginId) || 0) + 1;
    if (nextAttempt <= MAX_RESTART_ATTEMPTS) {
      const delay = RESTART_DELAYS_MS[Math.min(nextAttempt - 1, RESTART_DELAYS_MS.length - 1)];
      restartAttempts.set(pluginId, nextAttempt);
      console.log(
        `[widget:${pluginId}] unexpected exit, restarting in ${delay}ms (attempt ${nextAttempt}/${MAX_RESTART_ATTEMPTS})`,
      );
      setTimeout(() => startWidget(pluginId), delay);
    } else {
      console.error(`[widget:${pluginId}] exceeded max restart attempts, giving up`);
    }
  });

  running.set(pluginId, proc);
  console.log(`[widget:${pluginId}] process started (pid ${proc.pid})`);

  // Health check: wait for the widget's advertised port to become reachable.
  // This catches startup failures (missing deps, port conflicts, crashes during
  // model load) immediately instead of leaving a dead widget registered.
  if (widgetPort && proc.pid) {
    const healthy = await waitForWidgetPort(widgetPort);
    if (!healthy) {
      console.error(
        `[widget:${pluginId}] health check failed on port ${widgetPort}, killing and retrying`,
      );
      try {
        process.kill(-proc.pid, 'SIGTERM');
      } catch {
        // process may have already exited
      }
      // The exit handler will see stopping=false and schedule a restart,
      // but we also mark stopping here so it does not race with a double
      // restart. Our own re-entry below will clear the flag.
      stopping.add(pluginId);
      restartAttempts.set(pluginId, attempts + 1);
      const delay = RESTART_DELAYS_MS[Math.min(attempts, RESTART_DELAYS_MS.length - 1)];
      setTimeout(() => startWidget(pluginId), delay);
      return;
    }
    console.log(`[widget:${pluginId}] health check passed on port ${widgetPort}`);
    restartAttempts.delete(pluginId);
  }
}

export function stopWidget(pluginId: string): void {
  stopping.add(pluginId);

  const proc = running.get(pluginId);
  if (proc?.pid) {
    try {
      process.kill(-proc.pid, 'SIGTERM');
    } catch {
      // process may have already exited
    }
  }
  running.delete(pluginId);

  const dir = widgetDir(pluginId);
  try {
    execSync(`pkill -f "${dir}" 2>/dev/null || true`);
  } catch {
    // ignore
  }
}

export function uninstallWidget(pluginId: string): void {
  stopWidget(pluginId);
  const dir = widgetDir(pluginId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export async function startInstalledWidgets(): Promise<void> {
  try {
    // Query user_plugins table for enabled widgets
    const [rows] = await pool.query(
      `SELECT DISTINCT up.plugin_id
       FROM user_plugins up
       JOIN plugins p ON p.id = up.plugin_id
       WHERE up.enabled = 1 AND p.category = 'widget'`,
    );

    for (const row of rows as { plugin_id: string }[]) {
      if (widgetReady(row.plugin_id)) {
        await startWidget(row.plugin_id);
      }
    }
  } catch {
    // DB may not be ready yet on first boot, or tables not migrated yet
    // Fall back to checking user_settings (legacy)
    try {
      const [rows] = await pool.query(
        'SELECT value FROM user_settings WHERE key_name = ?',
        ['installed_plugins'],
      );

      const installedIds = new Set<string>();
      for (const row of rows as { value: string }[]) {
        try {
          const list = JSON.parse(row.value) as { id: string; enabled: boolean }[];
          list.filter((p) => p.enabled).forEach((p) => installedIds.add(p.id));
        } catch {
          // malformed row, skip
        }
      }

      for (const pluginId of installedIds) {
        if (widgetReady(pluginId)) {
          await startWidget(pluginId);
        }
      }
    } catch {
      // truly not ready
    }
  }
}
