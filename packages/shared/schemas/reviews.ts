import { z } from 'zod';

const nonEmptyText = z.string().trim().min(1).max(2000);

export const weeklySummaryWeekStartSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const weeklySummaryContentSchema = z.object({
  overall: nonEmptyText,
  summary: z.string().trim().min(1).max(4000),
  comparison: nonEmptyText,
  positive: nonEmptyText,
  concerns: nonEmptyText,
  nextFocus: z.array(z.string().trim().min(1).max(200)).min(1).max(3),
  narrativeMarkdown: z.string().trim().min(1).max(4000).optional(),
});

export type WeeklySummaryWeekStartInput = z.infer<typeof weeklySummaryWeekStartSchema>;
export type WeeklySummaryContentInput = z.infer<typeof weeklySummaryContentSchema>;
