import { z } from 'zod';

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-zA-Z0-9_.-]{2,20}$/);

export const passwordSchema = z.string().min(3);

export const registerSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

export const loginSchema = registerSchema;
