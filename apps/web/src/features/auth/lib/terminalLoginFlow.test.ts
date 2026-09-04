import { describe, expect, it } from 'vitest';
import {
  MAX_LOGIN_PASSWORD_ATTEMPTS,
  beginAuthenticating,
  beginLoginPassword,
  createTerminalLoginSession,
  loginPasswordRejected,
  loginSucceeded,
  ownsLoginPassword,
} from './terminalLoginFlow';

describe('terminalLoginFlow', () => {
  it('starts in command mode so input is a command', () => {
    const session = createTerminalLoginSession();
    expect(session.phase).toBe('command');
    expect(ownsLoginPassword(session)).toBe(false);
  });

  it('switches to password routing synchronously on username accept', () => {
    const session = beginLoginPassword('rain');
    expect(session.phase).toBe('password');
    expect(session.username).toBe('rain');
    expect(session.attempts).toBe(0);
    expect(ownsLoginPassword(session)).toBe(true);
  });

  it('keeps password ownership for any string after a wrong attempt', () => {
    let session = beginLoginPassword('rain');
    session = beginAuthenticating(session);
    expect(ownsLoginPassword(session)).toBe(true);

    const rejected = loginPasswordRejected(session);
    expect(rejected.exhausted).toBe(false);
    expect(rejected.remaining).toBe(2);
    expect(rejected.session.phase).toBe('password');
    expect(rejected.session.username).toBe('rain');
    expect(ownsLoginPassword(rejected.session)).toBe(true);

    for (const value of ['123456', 'hello', 'cd', 'ls', 'login', 'foobar']) {
      expect(ownsLoginPassword(rejected.session), value).toBe(true);
    }
  });

  it('returns to command only after three wrong passwords', () => {
    let session = beginLoginPassword('rain');
    for (let i = 1; i < MAX_LOGIN_PASSWORD_ATTEMPTS; i += 1) {
      const result = loginPasswordRejected(beginAuthenticating(session));
      expect(result.exhausted).toBe(false);
      expect(ownsLoginPassword(result.session)).toBe(true);
      session = result.session;
    }

    const last = loginPasswordRejected(beginAuthenticating(session));
    expect(last.exhausted).toBe(true);
    expect(last.session.phase).toBe('command');
    expect(last.session.username).toBeNull();
    expect(ownsLoginPassword(last.session)).toBe(false);
  });

  it('clears login context on success', () => {
    const session = loginSucceeded();
    expect(session.phase).toBe('command');
    expect(ownsLoginPassword(session)).toBe(false);
  });

  it('does not treat authenticating as command routing', () => {
    const session = beginAuthenticating(beginLoginPassword('rain'));
    expect(session.phase).toBe('authenticating');
    expect(ownsLoginPassword(session)).toBe(true);
  });
});
