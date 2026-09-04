/**
 * Product terminal login session — the authority for input routing.
 * UI visibility of the password prompt is not the owner of keystrokes.
 */

export const MAX_LOGIN_PASSWORD_ATTEMPTS = 3;

export type TerminalLoginPhase = 'command' | 'password' | 'authenticating';

export type TerminalLoginSession = {
  phase: TerminalLoginPhase;
  username: string | null;
  attempts: number;
};

export function createTerminalLoginSession(): TerminalLoginSession {
  return { phase: 'command', username: null, attempts: 0 };
}

/** Any non-command phase owns the input as a password buffer. */
export function ownsLoginPassword(session: TerminalLoginSession): boolean {
  return session.phase === 'password' || session.phase === 'authenticating';
}

export function beginLoginPassword(username: string): TerminalLoginSession {
  return { phase: 'password', username, attempts: 0 };
}

export function beginAuthenticating(session: TerminalLoginSession): TerminalLoginSession {
  if (!ownsLoginPassword(session) || !session.username) {
    return session;
  }
  return { ...session, phase: 'authenticating' };
}

export function loginPasswordRejected(session: TerminalLoginSession): {
  session: TerminalLoginSession;
  exhausted: boolean;
  remaining: number;
} {
  const attempts = session.attempts + 1;
  if (attempts >= MAX_LOGIN_PASSWORD_ATTEMPTS) {
    return {
      session: createTerminalLoginSession(),
      exhausted: true,
      remaining: 0,
    };
  }
  return {
    session: {
      phase: 'password',
      username: session.username,
      attempts,
    },
    exhausted: false,
    remaining: MAX_LOGIN_PASSWORD_ATTEMPTS - attempts,
  };
}

export function loginSucceeded(): TerminalLoginSession {
  return createTerminalLoginSession();
}
