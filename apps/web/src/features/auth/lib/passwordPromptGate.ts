/**
 * Guards password-step Enter submits against password-manager autofill
 * that fills the field and synthesizes Enter without a real keystroke.
 *
 * Arm whenever a new password prompt is shown (login passphrase, set, confirm).
 * Mark touched on real typing / paste. Reject Enter until touched.
 */

export type PasswordPromptGate = {
  arm: (now?: number) => void;
  markTouched: () => void;
  /** True only after arm() and at least one real edit in this generation. */
  canSubmit: (now?: number) => boolean;
  reset: () => void;
};

export type PasswordPromptGateOptions = {
  /** Ignore Enter this many ms after arm (covers instant autofill+submit). */
  minArmMs?: number;
};

export function createPasswordPromptGate(
  options: PasswordPromptGateOptions = {},
): PasswordPromptGate {
  // minArmMs retained for API compatibility; submit gating is touch-based.
  void options.minArmMs;
  let generation = 0;
  let touchedInGeneration = false;

  return {
    arm(_now = Date.now()) {
      generation += 1;
      touchedInGeneration = false;
    },
    markTouched() {
      if (generation === 0) return;
      touchedInGeneration = true;
    },
    canSubmit(_now = Date.now()) {
      if (generation === 0) return false;
      return touchedInGeneration;
    },
    reset() {
      generation = 0;
      touchedInGeneration = false;
    },
  };
}

/** Keydowns that count as a human edit of the passphrase field. */
export function isPasswordEditKey(event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey'>): boolean {
  if (event.altKey) return false;
  if (event.key === 'Backspace' || event.key === 'Delete') return true;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') return true;
  if (event.metaKey || event.ctrlKey) return false;
  return event.key.length === 1;
}
