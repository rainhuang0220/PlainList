import { z } from 'zod';

export const progressStateSchema = z.enum(['advanced', 'maintained', 'blocked', 'not_observed', 'unknown']);
export const alignmentStateSchema = z.enum(['aligned', 'supporting', 'conflicted', 'neutral', 'unknown']);
export const outputStateSchema = z.enum(['produced', 'partial', 'not_applicable', 'unknown']);
export const explorationStateSchema = z.enum(['explored', 'not_applicable', 'unknown']);
export const opportunityCostStateSchema = z.enum(['evidenced', 'not_observed', 'unknown']);

export const weeklyIntelligenceContentSchema = z.object({
  progress: progressStateSchema,
  alignment: alignmentStateSchema,
  output: outputStateSchema,
  exploration: explorationStateSchema,
  opportunityCost: opportunityCostStateSchema,
  summary: z.string().trim().min(1).max(2400),
  outputs: z.array(z.string().trim().min(1).max(600)).max(12),
  openLoops: z.array(z.string().trim().min(1).max(600)).max(12),
  suggestedNextFocus: z.array(z.string().trim().min(1).max(600)).max(5),
  evidenceFactIds: z.array(z.number().int().positive()).max(30),
  unknowns: z.array(z.string().trim().min(1).max(300)).max(12),
}).strict();

export type WeeklyIntelligenceContent = z.infer<typeof weeklyIntelligenceContentSchema>;
