import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'UserProfileSettings.vue'), 'utf8');

describe('UserProfileSettings copy', () => {
  it('no longer describes a 60-day analysis window', () => {
    expect(source).toContain('更新用户画像');
    expect(source).toContain('结合全部可用历史，并提高近期活动的权重。');
    expect(source).not.toContain('分析最近 60 天');
    expect(source).not.toContain('analyze(60)');
  });
});
