import { z } from 'zod';

export const aiReviewPeriodSchema = z.enum(['day', 'week', 'month', 'year']);

export const aiReviewRequestSchema = z.object({
  period: aiReviewPeriodSchema,
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
