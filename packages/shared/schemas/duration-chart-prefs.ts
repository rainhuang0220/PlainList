import { z } from 'zod';

export const durationChartScopeSchema = z.enum(['week', 'month', 'year']);

export const durationChartPrefsQuerySchema = z.object({
  scope: durationChartScopeSchema,
  scopeKey: z.string().trim().min(1).max(32),
});

export const durationChartMergeSchema = z.object({
  label: z.string().trim().min(1).max(100),
  planIds: z.array(z.number().int().positive()).min(1),
});

export const durationChartPrefsSchema = z.object({
  hiddenPlanIds: z.array(z.number().int().positive()),
  merges: z.array(durationChartMergeSchema),
});
