import { z } from "zod";

import { privacyExclusionEntrySchema } from "./system-state.js";
import {
  durationSecondsSchema,
  isoUtcSchema,
  opaqueIdSchema,
  schemaVersionSchema,
  uuidSchema,
} from "../domain/scalars.js";

const commandBaseSchema = z.object({
  schema_version: schemaVersionSchema,
  command_id: uuidSchema,
  sent_at: isoUtcSchema,
});

export const pauseCommandSchema = commandBaseSchema.extend({
  kind: z.literal("pause"),
  payload: z.object({
    reason: z.enum(["user_pause", "break", "snooze", "intentional_detour"]),
    duration_seconds: durationSecondsSchema.nullable(),
    note: z.string().nullable(),
  }),
});

export const resumeCommandSchema = commandBaseSchema.extend({
  kind: z.literal("resume"),
  payload: z.object({
    reason: z.enum(["user_resume", "notification_return", "pause_elapsed"]),
  }),
});

export const updateExclusionsCommandSchema = commandBaseSchema.extend({
  kind: z.literal("update_exclusions"),
  payload: z.object({
    operations: z.array(
      z.discriminatedUnion("op", [
        z.object({
          op: z.literal("upsert"),
          entry: privacyExclusionEntrySchema,
        }),
        z.object({
          op: z.literal("remove"),
          exclusion_id: opaqueIdSchema,
        }),
      ]),
    ),
  }),
});

export const resolveAmbiguityCommandSchema = commandBaseSchema.extend({
  kind: z.literal("resolve_ambiguity"),
  payload: z.object({
    clarification_id: opaqueIdSchema,
    answer_id: opaqueIdSchema,
    remember_choice: z.enum([
      "do_not_remember",
      "remember_as_task",
      "remember_as_work_group",
    ]),
    user_note: z.string().nullable(),
  }),
});

export const importCoachingExchangeCommandSchema = commandBaseSchema.extend({
  kind: z.literal("import_coaching_exchange"),
  payload: z.object({
    source: z.enum(["manual_paste", "clipboard"]),
    raw_text: z.string().min(1),
  }),
});

export const notificationActionCommandSchema = commandBaseSchema.extend({
  kind: z.literal("notification_action"),
  payload: z.object({
    intervention_id: opaqueIdSchema,
    action_id: opaqueIdSchema,
  }),
});

export const reportNotificationPermissionCommandSchema = commandBaseSchema.extend({
  kind: z.literal("report_notification_permission"),
  payload: z.object({
    os_permission: z.enum(["unknown", "granted", "denied"]),
  }),
});

export const requestMorningFlowCommandSchema = commandBaseSchema.extend({
  kind: z.literal("request_morning_flow"),
  payload: z.object({
    local_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    opened_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/),
    reason: z.enum([
      "first_notebook_open_after_4am",
      "manual_start_day",
      "manual_plan_reset",
    ]),
  }),
});

export const purgeAllCommandSchema = commandBaseSchema.extend({
  kind: z.literal("purge_all"),
  payload: z.object({
    confirm_phrase: z.literal("DELETE ALL COACHING DATA"),
  }),
});

export const commandSchema = z.discriminatedUnion("kind", [
  pauseCommandSchema,
  resumeCommandSchema,
  updateExclusionsCommandSchema,
  resolveAmbiguityCommandSchema,
  importCoachingExchangeCommandSchema,
  notificationActionCommandSchema,
  reportNotificationPermissionCommandSchema,
  requestMorningFlowCommandSchema,
  purgeAllCommandSchema,
]);

export type PauseCommand = z.infer<typeof pauseCommandSchema>;
export type ResumeCommand = z.infer<typeof resumeCommandSchema>;
export type UpdateExclusionsCommand = z.infer<typeof updateExclusionsCommandSchema>;
export type ResolveAmbiguityCommand = z.infer<typeof resolveAmbiguityCommandSchema>;
export type ImportCoachingExchangeCommand = z.infer<
  typeof importCoachingExchangeCommandSchema
>;
export type NotificationActionCommand = z.infer<
  typeof notificationActionCommandSchema
>;
export type ReportNotificationPermissionCommand = z.infer<
  typeof reportNotificationPermissionCommandSchema
>;
export type RequestMorningFlowCommand = z.infer<
  typeof requestMorningFlowCommandSchema
>;
export type PurgeAllCommand = z.infer<typeof purgeAllCommandSchema>;
export type Command = z.infer<typeof commandSchema>;
