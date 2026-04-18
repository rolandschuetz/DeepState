import { z } from "zod";

import {
  durationSecondsSchema,
  localDateSchema,
  progressKindSchema,
  schemaVersionSchema,
} from "../domain/scalars.js";

const morningPlanTaskSchema = z.object({
  title: z.string().min(1),
  success_definition: z.string().min(1),
  total_remaining_effort_seconds: durationSecondsSchema.nullable(),
  intended_work_seconds_today: durationSecondsSchema,
  progress_kind: progressKindSchema,
  allowed_support_work: z.array(z.string()),
  likely_detours_that_still_count: z.array(z.string()),
});

export const morningPlanExchangeSchema = z
  .object({
    schema_version: schemaVersionSchema,
    exchange_type: z.literal("morning_plan"),
    local_date: localDateSchema,
    total_intended_work_seconds: durationSecondsSchema,
    notes_for_tracker: z.string().nullable(),
    tasks: z.array(morningPlanTaskSchema).min(1).max(3),
  })
  .superRefine((value, ctx) => {
    if (value.total_intended_work_seconds === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["total_intended_work_seconds"],
        message: "total_intended_work_seconds must be greater than zero.",
      });
    }

    const sumOfTaskSeconds = value.tasks.reduce(
      (total, task) => total + task.intended_work_seconds_today,
      0,
    );

    if (sumOfTaskSeconds > value.total_intended_work_seconds) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tasks"],
        message:
          "The sum of task intended_work_seconds_today must not exceed total_intended_work_seconds.",
      });
    }
  });

const eveningTaskOutcomeSchema = z.object({
  task_title: z.string().min(1),
  did_progress_occur: z.enum(["yes", "no", "partial"]),
  what_counted_as_real_progress: z.string().nullable(),
  what_was_support_work: z.string().nullable(),
  what_was_misclassified_or_ambiguous: z.string().nullable(),
});

export const eveningDebriefExchangeSchema = z.object({
  schema_version: schemaVersionSchema,
  exchange_type: z.literal("evening_debrief"),
  local_date: localDateSchema,
  overall_day_summary: z.string().min(1),
  task_outcomes: z.array(eveningTaskOutcomeSchema).min(1).max(3),
  new_support_patterns_to_remember: z.array(z.string()),
  patterns_to_not_remember: z.array(z.string()),
  corrections_for_task_boundaries: z.string().nullable(),
  corrected_ambiguity_labels: z.array(z.string()).optional(),
  carry_forward_to_tomorrow: z.string().nullable(),
  coaching_note_for_tomorrow: z.string().nullable(),
  tomorrow_suggestions: z.array(z.string()).optional(),
  milestone_relevance_summary: z.string().nullable().optional(),
});

export const coachingExchangeSchema = z.discriminatedUnion("exchange_type", [
  morningPlanExchangeSchema,
  eveningDebriefExchangeSchema,
]);

export type MorningPlanTask = z.infer<typeof morningPlanTaskSchema>;
export type MorningPlanExchange = z.infer<typeof morningPlanExchangeSchema>;
export type EveningTaskOutcome = z.infer<typeof eveningTaskOutcomeSchema>;
export type EveningDebriefExchange = z.infer<
  typeof eveningDebriefExchangeSchema
>;
export type CoachingExchange = z.infer<typeof coachingExchangeSchema>;
