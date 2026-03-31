import { z } from 'zod';

export const checksQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const checkUpsertSchema = z.object({
  planId: z.coerce.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  done: z.boolean(),
});

export const batchChecksSchema = z.object({
  checks: z.array(checkUpsertSchema).min(1),
});
