import { describe, expect, it } from 'vitest';
import { resolveAiConfig, resolveIntakeModel, resolveIntakeTimeout } from './settings';
import type { ResolvedAiConfig } from './settings';

const baseConfig: ResolvedAiConfig = {
  provider: 'openai',
  baseUrl: 'https://api.example.com/v1',
  model: 'deep-model',
  apiKey: 'sk-test',
  timeoutMs: 30_000,
  anthropicVersion: '2023-06-01',
  source: 'user',
};

describe('resolveIntakeTimeout', () => {
  it('uses configured timeout when above intake minimum', () => {
    expect(resolveIntakeTimeout(240_000)).toBe(240_000);
  });

  it('bumps short timeouts to intake minimum', () => {
    expect(resolveIntakeTimeout(30_000)).toBe(180_000);
    expect(resolveIntakeTimeout(90_000)).toBe(180_000);
  });
});

describe('resolveAiConfig effective weekly runtime', () => {
  it('uses the user BYOK model rather than the server default when a user key is present', () => {
    const effective = resolveAiConfig({
      provider: 'openai',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: 'qwen3.7-plus',
      apiKey: 'sk-user-not-a-real-secret',
      timeoutMs: 60_000,
    });
    expect(effective).toMatchObject({
      source: 'user',
      provider: 'openai',
      model: 'qwen3.7-plus',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });
  });

  it('does not treat stored qwen fields as the next weekly call when the user key is empty', () => {
    const effective = resolveAiConfig({
      provider: 'openai',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: 'qwen3.7-plus',
      apiKey: '',
      timeoutMs: 60_000,
    });
    expect(effective?.source).not.toBe('user');
    if (effective) {
      expect(effective.model).not.toBe('qwen3.7-plus');
    }
  });
});

describe('resolveIntakeModel', () => {
  it('prefers user intake model', () => {
    expect(resolveIntakeModel({ intakeModel: 'fast-model' }, baseConfig)).toBe('fast-model');
  });

  it('falls back to deep model when intake model empty', () => {
    expect(resolveIntakeModel({ intakeModel: '' }, baseConfig)).toBe('deep-model');
    expect(resolveIntakeModel(null, baseConfig)).toBe('deep-model');
  });
});
