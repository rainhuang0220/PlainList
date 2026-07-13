import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('auth audit log format', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plainlist-audit-'));

  afterEach(() => {
    vi.resetModules();
  });

  it('writes login-fail lines that fail2ban can match', async () => {
    const logFile = path.join(tempDir, 'auth-audit.log');
    process.env.AUDIT_LOG_ENABLED = 'true';
    process.env.AUDIT_LOG_PATH = logFile;

    const { logAuthEvent } = await import('./auditLog');
    logAuthEvent({
      kind: 'login-fail',
      ip: '203.0.113.5',
      username: 'admin',
      reason: 'incorrect passphrase',
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    const content = fs.readFileSync(logFile, 'utf8').trim();
    expect(content).toMatch(/^[\d-]+T[\d:.]+Z plainlist-auth login-fail ip=203\.0\.113\.5 user=admin reason=incorrect_passphrase$/);

    const fail2banLine = fs.readFileSync(
      path.resolve(__dirname, '../../../../deploy/fail2ban/filter.d/plainlist-auth.conf'),
      'utf8',
    );
    const match = content.match(/login-fail ip=(\S+) user=/);
    expect(match?.[1]).toBe('203.0.113.5');
    expect(fail2banLine).toContain('login-fail ip=<HOST> user=');
  });
});
