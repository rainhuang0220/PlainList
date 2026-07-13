import { describe, expect, it } from 'vitest';
import { resolveIntakeModel, resolveIntakeTimeout } from './settings';
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

describe('resolveIntakeModel', () => {
  it('prefers user intake model', () => {
    expect(resolveIntakeModel({ intakeModel: 'fast-model' }, baseConfig)).toBe('fast-model');
  });

  it('falls back to deep model when intake model empty', () => {
    expect(resolveIntakeModel({ intakeModel: '' }, baseConfig)).toBe('deep-model');
    expect(resolveIntakeModel(null, baseConfig)).toBe('deep-model');
  });
});
