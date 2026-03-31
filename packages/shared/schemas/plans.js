import { z } from 'zod';
export const planTypeSchema = z.enum(['habit', 'todo']);
export const timeSchema = z.string().regex(/^\d{2}:\d{2}$/);
export const createPlanSchema = z.object({
    name: z.string().trim().min(1).max(200),
    type: planTypeSchema,
    time: timeSchema,
});
export const planIdParamSchema = z.object({
    id: z.coerce.number().int().positive(),
});
