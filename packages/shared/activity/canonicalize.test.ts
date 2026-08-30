import { describe, expect, it } from 'vitest';
import { canonicalHash, canonicalize } from './canonicalize';

describe('activity canonicalization', () => {
  it('keeps object hashes stable across key ordering while preserving array meaning', () => {
    const first = { title: '  PlainList\r\n发布  ', items: ['first', 'second'], optional: null };
    const reordered = { optional: null, items: ['first', 'second'], title: 'PlainList\n发布' };

    expect(canonicalize(first)).toBe('{"items":["first","second"],"optional":null,"title":"PlainList\\n发布"}');
    expect(canonicalHash(first)).toBe(canonicalHash(reordered));
    expect(canonicalHash(first)).not.toBe(canonicalHash({ ...reordered, items: ['second', 'first'] }));
  });
});
