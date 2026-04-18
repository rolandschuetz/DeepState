import { z } from "zod";

const ISO_UTC_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export const timestampSchema = z
  .iso.datetime({ offset: false, local: false })
  .refine((value) => ISO_UTC_TIMESTAMP_PATTERN.test(value), {
    message:
      "Timestamp must be an ISO 8601 UTC string with whole-second or millisecond precision.",
  });

export const confidenceSchema = z.number().min(0).max(1);

export const healthStatusSchema = z.enum(["ok", "degraded", "down"]);

export type Timestamp = z.infer<typeof timestampSchema>;
export type Confidence = z.infer<typeof confidenceSchema>;
export type HealthStatus = z.infer<typeof healthStatusSchema>;
