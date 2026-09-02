import { z } from 'zod';
import { dateKeySchema } from './plans';

export const chatgptActivityReconcileSchema = z.object({
  affectedDates: z.array(dateKeySchema),
  finalizeThrough: dateKeySchema.optional(),
  checked: z.number().int().nonnegative(),
  changed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  historicalBootstrap: z.boolean().optional(),
}).strict();

export type ChatgptActivityReconcileInput = z.infer<typeof chatgptActivityReconcileSchema>;
