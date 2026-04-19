import { execSync, spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { findPluginManifest, PLUGIN_CATALOG, USER_SETTING_KEYS } from '@plainlist/shared';
import { pool } from '../../db/pool';

const WIDGETS_DIR = path.join(process.cwd(), 'data', 'widgets');

const running = new Map<string, ChildProcess>();

function widgetDir(pluginId: string) {
  return path.join(WIDGETS_DIR, pluginId);
}

export async function installWidget(pluginId: string, repoUrl: string): Promise<void> {
  fs.mkdirSync(WIDGETS_DIR, { recursive: true });
  const dir = widgetDir(pluginId);

  if (fs.existsSync(dir)) {
    execSync('git pull', { cwd: dir, stdio: 'inherit' });
  } else {
    execSync(`git clone ${repoUrl} ${dir}`, { stdio: 'inherit' });
  }

  startWidget(pluginId);
}

export function startWidget(pluginId: string): void {
  if (running.has(pluginId)) return;

  const dir = widgetDir(pluginId);
  const script = path.join(dir, 'start.sh');

  if (!fs.existsSync(script)) {
    console.warn(`[widget:${pluginId}] start.sh not found in ${dir}, skipping`);
    return;
  }

  execSync(`chmod +x "${script}"`);
  console.log(`[widget:${pluginId}] starting...`);

  const proc = spawn('bash', [script], {
    cwd: dir,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  proc.stdout?.on('data', (d: Buffer) => process.stdout.write(`[widget:${pluginId}] ${d}`));
  proc.stderr?.on('data', (d: Buffer) => process.stderr.write(`[widget:${pluginId}] ${d}`));
  proc.on('exit', (code) => {
    console.log(`[widget:${pluginId}] exited with code ${code}`);
    running.delete(pluginId);
  });

  running.set(pluginId, proc);
  console.log(`[widget:${pluginId}] process started (pid ${proc.pid})`);
}

export function stopWidget(pluginId: string): void {
  const proc = running.get(pluginId);
  if (proc?.pid) {
    try {
      process.kill(-proc.pid, 'SIGTERM');
    } catch {
      // process may have already exited
    }
  }
  running.delete(pluginId);

  // Also kill any orphaned processes from the widget's start.sh
  // (handles cases where the server restarted and lost track of the child)
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
    const [rows] = await pool.query(
      'SELECT value FROM user_settings WHERE key_name = ?',
      [USER_SETTING_KEYS.installedPlugins],
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
      const manifest = findPluginManifest(pluginId);
      if (manifest?.category === 'widget') {
        startWidget(pluginId);
      }
    }
  } catch {
    // DB may not be ready yet on first boot
  }
}
