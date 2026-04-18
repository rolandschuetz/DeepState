import { z } from "zod";

import { confidenceSchema } from "./primitives.js";

export const modeSchema = z.enum([
  "booting",
  "no_plan",
  "running",
  "paused",
  "degraded_screenpipe",
  "logic_error",
]);

export const runtimeStateSchema = z.enum([
  "aligned",
  "uncertain",
  "soft_drift",
  "hard_drift",
  "paused",
]);

export const classificationSummarySchema = z
  .object({
    runtime_state: runtimeStateSchema,
    confidence: confidenceSchema,
    is_support: z.boolean(),
  })
  .refine(
    (value) => !value.is_support || value.runtime_state === "aligned",
    {
      message: "Support work is only valid while the runtime state is aligned.",
      path: ["is_support"],
    },
  );

export type Mode = z.infer<typeof modeSchema>;
export type RuntimeState = z.infer<typeof runtimeStateSchema>;
export type ClassificationSummary = z.infer<typeof classificationSummarySchema>;
