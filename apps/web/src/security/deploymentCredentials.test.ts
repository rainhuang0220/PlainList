import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const deploymentScripts = [
  fileURLToPath(new URL('../../scripts/patch-nginx.sh', import.meta.url)),
  fileURLToPath(new URL('../../scripts/deploy-dmg.sh', import.meta.url)),
  fileURLToPath(new URL('../../scripts/deploy-android.sh', import.meta.url)),
];
const downloadPage = fileURLToPath(new URL('../../public/download/index.html', import.meta.url));

describe('production deployment credentials', () => {
  it.each(deploymentScripts)('%s uses key-only SSH without embedded passwords', (scriptPath) => {
    const script = readFileSync(scriptPath, 'utf8');

    expect(script).toContain('BatchMode=yes');
    expect(script).toContain('PreferredAuthentications=publickey');
    expect(script).toContain('PasswordAuthentication=no');
    expect(script).toContain('sudo -n');
    expect(script).not.toMatch(/\bsshpass\b|SSHPASS|sudo\s+-S/);

    const syntaxCheck = spawnSync('bash', ['-n', scriptPath], { encoding: 'utf8' });
    expect(syntaxCheck.stderr).toBe('');
    expect(syntaxCheck.status).toBe(0);
  });

  it('publishes a public download page that consumes the release manifest', () => {
    const page = readFileSync(downloadPage, 'utf8');

    expect(page).toContain('下载 PlainList');
    expect(page).toContain('/releases/latest.json');
    expect(page).not.toContain('175.24.134.228');
    expect(page).not.toContain('PlainList-2.4.0');
    expect(page).not.toContain('客户端下载中心');
  });
});
