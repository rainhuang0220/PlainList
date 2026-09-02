import { describe, expect, it } from 'vitest';
import { ZH_CN_TRANSLATION_BUNDLE } from './locales';

describe('weekly page labels', () => {
  it('calls the previous closed week 上周回顾 and the in-progress week 本周进展', () => {
    const messages = ZH_CN_TRANSLATION_BUNDLE.messages;
    expect(messages['week.page.previous']).toBe('上周回顾');
    expect(messages['week.page.current']).toBe('本周进展');
    expect(messages['week.page.previous']).not.toBe('本周回顾');
    expect(messages['week.summary.title']).toBe('周进展回顾');
    expect(messages['profile.analyze']).toBe('更新用户画像');
    expect(messages['profile.analyze']).not.toContain('60');
  });
});
