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
});
