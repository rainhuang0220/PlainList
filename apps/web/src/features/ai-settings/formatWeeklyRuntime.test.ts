import { describe, expect, it } from 'vitest';
import { formatWeeklyRuntimeLabel } from './formatWeeklyRuntime';

describe('formatWeeklyRuntimeLabel', () => {
  it('shows the resolved runtime, not the stored form defaults', () => {
    expect(formatWeeklyRuntimeLabel({
      effectiveSource: 'user',
      effectiveProvider: 'openai',
      effectiveModel: 'qwen3.7-plus',
      effectiveHost: 'dashscope.aliyuncs.com',
      lastSuccessfulProvider: null,
      lastSuccessfulModel: null,
    })).toBe('openai · qwen3.7-plus · dashscope.aliyuncs.com · 个人配置');
  });

  it('does not treat an unsaved or empty key as the next weekly call', () => {
    expect(formatWeeklyRuntimeLabel({
      effectiveSource: 'server',
      effectiveProvider: 'openai',
      effectiveModel: 'deepseek-ai/DeepSeek-V3.1-Terminus',
      effectiveHost: 'api.siliconflow.cn',
      lastSuccessfulProvider: null,
      lastSuccessfulModel: null,
    })).toBe('openai · deepseek-ai/DeepSeek-V3.1-Terminus · api.siliconflow.cn · 服务器默认');
  });
});
