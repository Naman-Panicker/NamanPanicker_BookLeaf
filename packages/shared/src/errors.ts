import { z } from 'zod';

// Every API error has this shape. `details` is null unless the code says otherwise.
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

// The `details` of a VALIDATION_FAILED error. Query and route parameter fields
// are prefixed ("query.status"), and body fields aren't, so forms can match on them directly.
export const validationDetailsSchema = z.object({
  fields: z.array(z.object({ field: z.string(), message: z.string() })),
});
export type ValidationDetails = z.infer<typeof validationDetailsSchema>;
