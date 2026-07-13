import { describe, expect, it } from 'vitest';
import { DEMO_ACCOUNT, DEMO_THEME_ID } from './showcase';

describe('showcase constants', () => {
  it('exposes the demo account credentials used by the showcase flow', () => {
    expect(DEMO_ACCOUNT).toEqual({
      username: 'admin',
      password: 'admin',
    });
    expect(DEMO_THEME_ID).toBe('nord');
  });
});
