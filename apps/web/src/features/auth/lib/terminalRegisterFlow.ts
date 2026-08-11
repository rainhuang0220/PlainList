import { isPassphraseLongEnough } from './passwordConfirm';

export type TerminalRegisterPhase = 'new-pass' | 'new-pass-confirm';

export type TerminalRegisterResult =
  | { ok: true; next: 'new-pass-confirm'; pendingPass: string }
  | { ok: true; next: 'register'; password: string }
  | {
      ok: false;
      error: 'too_short' | 'mismatch';
      next: 'new-pass';
      pendingPass: null;
    };

export function advanceRegisterPass(
  phase: TerminalRegisterPhase,
  value: string,
  pendingPass: string | null,
): TerminalRegisterResult {
  if (phase === 'new-pass') {
    if (!isPassphraseLongEnough(value)) {
      return {
        ok: false,
        error: 'too_short',
        next: 'new-pass',
        pendingPass: null,
      };
    }

    return {
      ok: true,
      next: 'new-pass-confirm',
      pendingPass: value,
    };
  }

  if (pendingPass === null || value !== pendingPass) {
    return {
      ok: false,
      error: 'mismatch',
      next: 'new-pass',
      pendingPass: null,
    };
  }

  return {
    ok: true,
    next: 'register',
    password: value,
  };
}
