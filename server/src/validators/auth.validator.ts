import { z } from 'zod';

export const addAuthorizedUserSchema = z.object({
  body: z.object({
    email: z.string().trim().email('כתובת אימייל לא תקינה'),
  }),
});

export const deleteAuthorizedUserSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

export const loginSchema = z.object({
  body: z.object({
    token: z.string().min(1),
  }),
});
