import type { AiConnectionTestResult } from '@plainlist/shared';
import { aiUserSettingsSchema } from '@plainlist/shared';
import { z } from 'zod';
import { chatComplete, stripModelArtifacts } from '../ai-shared/llm';
import {
  assertAiConfigured,
  loadUserAiSettings,
  resolveAiConfig,
  resolveAiConfigForUser,
  resolveIntakeModel,
} from './settings';

const testPayloadSchema = aiUserSettingsSchema.extend({
  testTarget: z.enum(['deep', 'intake']).optional().default('deep'),
});

export async function testAiConnection(userId: number, payload?: unknown): Promise<AiConnectionTestResult> {
  const existing = await loadUserAiSettings(userId);
  let config = await resolveAiConfigForUser(userId);
  let testTarget: 'deep' | 'intake' = 'deep';
  let intakeModelOverride = existing?.intakeModel ?? '';

  if (payload !== undefined && payload !== null && typeof payload === 'object') {
    const incoming = testPayloadSchema.parse(payload);
    testTarget = incoming.testTarget ?? 'deep';
    intakeModelOverride = incoming.intakeModel ?? '';
    let apiKey = incoming.apiKey?.trim() ?? '';
    if (!apiKey && existing?.apiKey) {
      apiKey = existing.apiKey;
    }

    config = resolveAiConfig({
      provider: incoming.provider,
      baseUrl: incoming.baseUrl,
      model: incoming.model,
      intakeModel: incoming.intakeModel,
      apiKey,
      timeoutMs: incoming.timeoutMs,
      anthropicVersion: incoming.anthropicVersion,
    });
  }

  const resolved = assertAiConfigured(config);
  const modelForTest = testTarget === 'intake'
    ? resolveIntakeModel({ intakeModel: intakeModelOverride }, resolved)
    : resolved.model;
  const started = Date.now();
  const result = await chatComplete(
    { ...resolved, model: modelForTest },
    {
      system: 'You are a connectivity probe. Reply with exactly one word: OK',
      user: 'ping',
      temperature: 0,
      maxTokens: 128,
    },
  );

  return {
    ok: true,
    provider: result.provider,
    model: result.model,
    latencyMs: Date.now() - started,
    preview: stripModelArtifacts(result.text).slice(0, 120),
    source: resolved.source === 'server' ? 'server' : 'user',
  };
}
