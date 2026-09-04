import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(resolve(__dirname, 'AuthTerminal.vue'), 'utf8');

describe('AuthTerminal login contract', () => {
  it('flips password routing before any account lookup', () => {
    expect(src).toContain('loginSession.value = beginLoginPassword(arg)');
    expect(src).toContain("startPasswordPrompt('passphrase')");
    expect(src).toContain("print(`  passphrase for ${arg}:`, 'out')");
    expect(src).not.toContain('try again or type cd');
    expect(src).not.toContain('passwordInputLocked');
    expect(src).not.toContain('setTimeout(() => {\n    passwordInputLocked');
  });

  it('keeps password ownership after a failed login', () => {
    expect(src).toContain('loginPasswordRejected');
    expect(src).toContain('authentication failed.');
    expect(src).toContain('try again (${result.remaining} left)');
    expect(src).toContain("if (ownsLoginPassword(loginSession.value) || state.value === 'passphrase')");
  });
});
