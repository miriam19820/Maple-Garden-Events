import { z } from 'zod';

const ratingSchema = z.coerce.number().int().min(1).max(5).optional();

export const feedbackTokenParamSchema = z.object({
  params: z.object({
    token: z.string().uuid(),
  }),
});

export const submitFeedbackSchema = z.object({
  params: z.object({
    token: z.string().uuid(),
  }),
  body: z
    .object({
      foodRating: ratingSchema,
      serviceRating: ratingSchema,
      venueRating: ratingSchema,
      comments: z.string().max(2000).optional(),
    })
    .strict(),
});
