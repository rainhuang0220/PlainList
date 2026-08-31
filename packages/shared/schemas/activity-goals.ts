import { z } from 'zod';

export const activityGoalPrioritySchema = z.number().int().min(0).max(9999);
export const activityGoalTimeHorizonSchema = z.enum(['near_term', 'medium_term', 'long_term']);
export const activityGoalStatusSchema = z.enum(['active', 'paused', 'achieved', 'archived']);

const goalText = z.string().trim().min(1).max(160);
const goalList = z.array(z.string().trim().min(1).max(240)).max(12).default([]);

export const createActivityGoalSchema = z.object({
  title: goalText,
  description: z.string().trim().max(4000).nullable().optional(),
  priorityRank: activityGoalPrioritySchema,
  timeHorizon: activityGoalTimeHorizonSchema,
  status: activityGoalStatusSchema.default('active'),
  domain: z.string().trim().max(80).nullable().optional(),
  successSignals: goalList,
  antiGoals: goalList,
}).strict();

export const updateActivityGoalSchema = createActivityGoalSchema.partial().omit({ status: true }).extend({
  status: activityGoalStatusSchema.optional(),
}).strict();

export const activityGoalIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

export type CreateActivityGoalInput = z.infer<typeof createActivityGoalSchema>;
export type UpdateActivityGoalInput = z.infer<typeof updateActivityGoalSchema>;
