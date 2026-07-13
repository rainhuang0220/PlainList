import { z } from 'zod';

export const planTypeSchema = z.enum(['habit', 'todo']);
export const timeSchema = z.string().regex(/^\d{2}:\d{2}$/);
export const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const createPlanSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
  type: planTypeSchema,
  time: timeSchema,
  scheduledDate: dateKeySchema.optional(),
});

export const updatePlanSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  type: planTypeSchema.optional(),
  time: timeSchema.optional(),
});

export const planIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
