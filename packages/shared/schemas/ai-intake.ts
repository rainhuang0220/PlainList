import { z } from 'zod';
import { planTypeSchema, timeSchema } from './plans';

export const aiIntakeRequestSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const aiIntakePrioritySchema = z.enum(['high', 'normal', 'low']);

export const aiIntakeItemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: planTypeSchema,
  time: timeSchema,
  priority: aiIntakePrioritySchema.optional(),
  order: z.number().int().min(0).max(99).optional(),
  why: z.string().trim().max(280).optional(),
  note: z.string().trim().max(200).optional(),
});

export const aiIntakeDiscardedSchema = z.object({
  text: z.string().trim().min(1).max(400),
  reason: z.string().trim().min(1).max(280),
});

export const aiIntakeDirectivesSchema = z.object({
  clearTodayTodos: z.boolean().optional(),
  clearReason: z.string().trim().max(280).optional(),
  matchedText: z.string().trim().max(400).optional(),
});

export const aiIntakeResponseSchema = z.object({
  items: z.array(aiIntakeItemSchema),
  discarded: z.array(aiIntakeDiscardedSchema).optional(),
  directives: aiIntakeDirectivesSchema.optional(),
  summary: z.string().trim().max(600).optional(),
  advice: z.string().trim().max(600).optional(),
  source: z.enum(['ai', 'fallback']),
  model: z.string(),
  generatedAt: z.string(),
  notes: z.string().optional(),
});

export type AiIntakeItemInput = z.infer<typeof aiIntakeItemSchema>;
export type AiIntakeDiscardedInput = z.infer<typeof aiIntakeDiscardedSchema>;
export type AiIntakeDirectivesInput = z.infer<typeof aiIntakeDirectivesSchema>;
export type AiIntakeResponseInput = z.infer<typeof aiIntakeResponseSchema>;
