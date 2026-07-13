import { z } from 'zod';

export const userProfileTraitIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const userProfilePatchSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  userSummary: z.string().trim().max(2000).nullable().optional(),
  impactRatio: z.number().min(0).max(1).optional(),
  enabled: z.boolean().optional(),
});

export const userProfileAnalyzeSchema = z.object({
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  days: z.number().int().min(1).max(180).optional(),
});

export type UserProfilePatchInput = z.infer<typeof userProfilePatchSchema>;
export type UserProfileAnalyzeInput = z.infer<typeof userProfileAnalyzeSchema>;
