import { z } from 'zod';

export const aiProviderSchema = z.enum(['openai', 'anthropic']);

export const aiUserSettingsSchema = z.object({
  provider: aiProviderSchema,
  baseUrl: z.string().url().max(500),
  /** Deep / default model for non-intake AI features and fallback. */
  model: z.string().min(1).max(200),
  /** Faster model for AI intake; empty = use `model`. */
  intakeModel: z.string().max(200).optional().default(''),
  apiKey: z.string().max(500).optional().default(''),
  timeoutMs: z.coerce.number().int().min(3000).max(300000).default(30000),
  anthropicVersion: z.string().min(1).max(50).optional(),
});
