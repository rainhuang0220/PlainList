import { describe, expect, it } from 'vitest';
import {
  MIN_PASSPHRASE_LENGTH,
  isPassphraseLongEnough,
  passwordsMatch,
} from './passwordConfirm';

describe('passwordConfirm', () => {
  it('exposes min length 3', () => {
    expect(MIN_PASSPHRASE_LENGTH).toBe(3);
  });

  it('rejects short passphrases', () => {
    expect(isPassphraseLongEnough('')).toBe(false);
    expect(isPassphraseLongEnough('ab')).toBe(false);
    expect(isPassphraseLongEnough('abc')).toBe(true);
  });

  it('requires exact match including whitespace', () => {
    expect(passwordsMatch('secret', 'secret')).toBe(true);
    expect(passwordsMatch('secret', 'Secret')).toBe(false);
    expect(passwordsMatch('secret', 'secret ')).toBe(false);
  });
});
