import { z } from 'zod';
import { dateKeySchema } from './plans';

export const chatgptActivityReconcileSchema = z.object({
  affectedDates: z.array(dateKeySchema),
  finalizeThrough: dateKeySchema.optional(),
  checked: z.number().int().nonnegative(),
  changed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  processed: z.number().int().nonnegative().optional(),
  historicalBootstrap: z.boolean().optional(),
  bootstrapComplete: z.boolean().optional(),
  dateFrom: dateKeySchema.optional().nullable(),
  dateTo: dateKeySchema.optional().nullable(),
}).strict();

export const chatgptActivityProgressSchema = z.object({
  checked: z.number().int().nonnegative(),
  changed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  processed: z.number().int().nonnegative().optional(),
  historicalBootstrap: z.boolean().optional(),
  bootstrapComplete: z.boolean().optional(),
  dateFrom: dateKeySchema.optional().nullable(),
  dateTo: dateKeySchema.optional().nullable(),
}).strict();

export type ChatgptActivityReconcileInput = z.infer<typeof chatgptActivityReconcileSchema>;
export type ChatgptActivityProgressInput = z.infer<typeof chatgptActivityProgressSchema>;
