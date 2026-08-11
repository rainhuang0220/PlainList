import { describe, expect, it } from 'vitest';
import { advanceRegisterPass } from './terminalRegisterFlow';

describe('advanceRegisterPass', () => {
  it('rejects short new-pass', () => {
    expect(advanceRegisterPass('new-pass', 'ab', null)).toEqual({
      ok: false,
      error: 'too_short',
      next: 'new-pass',
      pendingPass: null,
    });
  });

  it('moves to confirm after valid new-pass', () => {
    expect(advanceRegisterPass('new-pass', 'abc', null)).toEqual({
      ok: true,
      next: 'new-pass-confirm',
      pendingPass: 'abc',
    });
  });

  it('registers when confirm matches', () => {
    expect(advanceRegisterPass('new-pass-confirm', 'abc', 'abc')).toEqual({
      ok: true,
      next: 'register',
      password: 'abc',
    });
  });

  it('returns to new-pass on mismatch', () => {
    expect(advanceRegisterPass('new-pass-confirm', 'abd', 'abc')).toEqual({
      ok: false,
      error: 'mismatch',
      next: 'new-pass',
      pendingPass: null,
    });
  });

  it('never registers from new-pass alone (confirm always required)', () => {
    const first = advanceRegisterPass('new-pass', 'same-pass', null);
    expect(first).toEqual({
      ok: true,
      next: 'new-pass-confirm',
      pendingPass: 'same-pass',
    });
    // Even if a stale pendingPass matches, new-pass still only advances to confirm.
    const again = advanceRegisterPass('new-pass', 'same-pass', 'same-pass');
    expect(again).toEqual({
      ok: true,
      next: 'new-pass-confirm',
      pendingPass: 'same-pass',
    });
  });

  it('second account flow still requires confirm after a completed first pass', () => {
    const a1 = advanceRegisterPass('new-pass', 'alice-secret', null);
    expect(a1.ok && a1.next === 'new-pass-confirm').toBe(true);
    if (!(a1.ok && a1.next === 'new-pass-confirm')) return;
    const a2 = advanceRegisterPass('new-pass-confirm', 'alice-secret', a1.pendingPass);
    expect(a2.ok && a2.next === 'register').toBe(true);

    // Fresh registration for another account — must not skip confirm.
    const b1 = advanceRegisterPass('new-pass', 'bob-secret', null);
    expect(b1).toEqual({
      ok: true,
      next: 'new-pass-confirm',
      pendingPass: 'bob-secret',
    });
  });
});
