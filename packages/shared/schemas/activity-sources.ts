import { z } from 'zod';
import { dateKeySchema } from './plans';

const compactText = z.string().trim().min(1).max(1200);
const compactList = z.array(compactText).max(20).default([]);

export const activitySourceTypeSchema = z.enum(['plainlist-records', 'chatgpt-explicit-digest', 'chatgpt-local-sync', 'manual']);
export const activitySourceEnvelopeSchema = z.object({
  sourceType: activitySourceTypeSchema,
  externalId: z.string().trim().min(1).max(255).optional(),
  idempotencyKey: z.string().trim().min(8).max(128),
  dateStart: dateKeySchema,
  dateEnd: dateKeySchema,
  schemaVersion: z.string().trim().min(1).max(40),
  compactPayload: z.record(z.string(), z.unknown()),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  metadata: z.record(z.string().max(80), z.union([z.string().max(240), z.number().finite(), z.boolean()])).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.dateStart > value.dateEnd) ctx.addIssue({ code: 'custom', path: ['dateEnd'], message: 'dateEnd must not precede dateStart' });
});

export const appendActivityDigestSchema = z.object({
  sourceType: z.enum(['chatgpt-explicit-digest', 'chatgpt-local-sync']).optional(),
  sourceExternalId: z.string().trim().min(1).max(255),
  idempotencyKey: z.string().trim().min(8).max(128),
  dateKey: dateKeySchema,
  occurredAt: z.string().datetime({ offset: true }).optional(),
  conversationTitle: z.string().trim().max(200).optional(),
  topic: z.string().trim().max(240).optional(),
  intent: z.string().trim().max(400).optional(),
  summary: z.string().trim().min(1).max(4000),
  activities: compactList,
  outputs: compactList,
  learnings: compactList,
  decisions: compactList,
  unresolved: compactList,
  localFacts: z.array(z.object({
    dateKey: dateKeySchema,
    category: z.enum(['engineering', 'research', 'learning', 'planning']),
    title: z.string().trim().min(1).max(240),
    completed: z.boolean(),
  }).strict()).max(20).optional(),
  candidateGoalRelations: z.array(z.object({ goalId: z.number().int().positive(), relation: z.enum(['primary', 'supporting', 'exploration', 'neutral']) })).max(8).default([]),
}).strict();

export type ActivitySourceEnvelope = z.infer<typeof activitySourceEnvelopeSchema>;
export type AppendActivityDigestInput = z.infer<typeof appendActivityDigestSchema>;
