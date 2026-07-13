import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env';

const LOG_TAG = 'plainlist-auth';

let logPath: string | null = null;

function resolveLogPath(): string | null {
  if (!env.AUDIT_LOG_ENABLED) {
    return null;
  }

  if (logPath) {
    return logPath;
  }

  const target = env.AUDIT_LOG_PATH
    ? path.resolve(env.AUDIT_LOG_PATH)
    : path.resolve(__dirname, '../../../logs/auth-audit.log');

  fs.mkdirSync(path.dirname(target), { recursive: true });
  logPath = target;
  return logPath;
}

function writeLine(line: string): void {
  const target = resolveLogPath();
  if (!target) {
    return;
  }

  fs.appendFile(target, `${line}\n`, (error) => {
    if (error) {
      console.error('[audit] failed to write auth audit log:', error.message);
    }
  });
}

function sanitizeField(value: string, max = 64): string {
  return value.replace(/[\s\r\n]+/g, '_').slice(0, max);
}

export type AuthAuditEvent =
  | { kind: 'login-fail'; ip: string; username: string; reason: string }
  | { kind: 'login-ok'; ip: string; username: string }
  | { kind: 'register-ok'; ip: string; username: string };

/** One line per event — parsed by deploy/fail2ban/filter.d/plainlist-auth.conf */
export function logAuthEvent(event: AuthAuditEvent): void {
  const timestamp = new Date().toISOString();
  const ip = sanitizeField(event.ip, 45);
  const username = sanitizeField(event.username, 32);

  if (event.kind === 'login-fail') {
    const reason = sanitizeField(event.reason, 48);
    writeLine(`${timestamp} ${LOG_TAG} login-fail ip=${ip} user=${username} reason=${reason}`);
    return;
  }

  if (event.kind === 'login-ok') {
    writeLine(`${timestamp} ${LOG_TAG} login-ok ip=${ip} user=${username}`);
    return;
  }

  writeLine(`${timestamp} ${LOG_TAG} register-ok ip=${ip} user=${username}`);
}
