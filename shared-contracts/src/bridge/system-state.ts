import { z } from "zod";

import { healthStatusSchema } from "../domain/primitives.js";
import { modeSchema, runtimeStateSchema } from "../domain/runtime.js";
import {
  colorTokenSchema,
  durationSecondsSchema,
  isoUtcSchema,
  localDateSchema,
  opaqueIdSchema,
  progressKindSchema,
  ratioSchema,
  riskLevelSchema,
  schemaVersionSchema,
  sequenceNumberSchema,
  severitySchema,
  uuidSchema,
} from "../domain/scalars.js";

export const explainabilityItemSchema = z.object({
  code: z.string().min(1),
  detail: z.string().min(1),
  weight: z.number(),
});

export const privacyExclusionEntrySchema = z.object({
  exclusion_id: opaqueIdSchema.nullable(),
  label: z.string().min(1),
  match_type: z.enum(["app", "domain", "url_regex", "window_title_regex"]),
  pattern: z.string().min(1),
  enabled: z.boolean(),
});

const bannerViewModelSchema = z.object({
  severity: severitySchema,
  title: z.string().min(1),
  body: z.string().min(1),
});

const plannedTaskViewModelSchema = z.object({
  task_id: opaqueIdSchema,
  title: z.string().min(1),
  success_definition: z.string().min(1),
  total_remaining_effort_seconds: durationSecondsSchema.nullable(),
  intended_work_seconds_today: durationSecondsSchema,
  progress_kind: progressKindSchema,
  allowed_support_work: z.array(z.string()),
  likely_detours_that_still_count: z.array(z.string()),
});

const taskProgressCardSchema = z.object({
  task_id: opaqueIdSchema,
  title: z.string().min(1),
  progress_ratio: ratioSchema.nullable(),
  confidence_ratio: ratioSchema.nullable(),
  risk_level: riskLevelSchema.nullable(),
  aligned_seconds: durationSecondsSchema,
  support_seconds: durationSecondsSchema,
  drift_seconds: durationSecondsSchema,
  eta_remaining_seconds: durationSecondsSchema.nullable(),
  latest_status_text: z.string(),
});

const episodeSummarySchema = z.object({
  episode_id: opaqueIdSchema,
  started_at: isoUtcSchema,
  ended_at: isoUtcSchema,
  runtime_state: runtimeStateSchema,
  matched_task_id: opaqueIdSchema.nullable(),
  matched_task_title: z.string().nullable(),
  is_support_work: z.boolean(),
  confidence_ratio: ratioSchema.nullable(),
  top_evidence: z.array(z.string()),
});

const correctionSummarySchema = z.object({
  correction_id: opaqueIdSchema,
  created_at: isoUtcSchema,
  kind: z.enum(["clarification", "manual_override", "notification_action"]),
  summary_text: z.string().min(1),
});

const ambiguityQueueItemSchema = z.object({
  ambiguity_id: opaqueIdSchema,
  created_at: isoUtcSchema,
  prompt: z.string().min(1),
  status: z.enum(["pending", "resolved", "dismissed"]),
  resolution_summary: z.string().nullable(),
});

const durableRuleReviewItemSchema = z.object({
  review_item_id: opaqueIdSchema,
  created_at: isoUtcSchema,
  title: z.string().min(1),
  rationale: z.string().min(1),
  proposed_rule_text: z.string().min(1),
});

const morningExchangeViewModelSchema = z.object({
  status: z.enum(["required", "available", "completed"]),
  context_packet_text: z.string().nullable(),
  prompt_text: z.string().nullable(),
});

const eveningExchangeViewModelSchema = z.object({
  status: z.enum(["not_ready", "available", "completed"]),
  debrief_packet_text: z.string().nullable(),
  prompt_text: z.string().nullable(),
});

const privacyExclusionsViewModelSchema = z.object({
  exclusions: z.array(privacyExclusionEntrySchema),
});

const dailyPlanViewModelSchema = z.object({
  plan_id: opaqueIdSchema,
  imported_at: isoUtcSchema,
  local_date: localDateSchema,
  total_intended_work_seconds: durationSecondsSchema,
  notes_for_tracker: z.string().nullable(),
  tasks: z.array(plannedTaskViewModelSchema),
});

const dashboardViewModelSchema = z.object({
  header: z.object({
    local_date: localDateSchema,
    mode: modeSchema,
    summary_text: z.string(),
    warning_banner: bannerViewModelSchema.nullable(),
  }),
  plan: dailyPlanViewModelSchema.nullable(),
  current_focus: z.object({
    runtime_state: runtimeStateSchema,
    is_support_work: z.boolean(),
    confidence_ratio: ratioSchema.nullable(),
    explainability: z.array(explainabilityItemSchema),
    last_good_context: z.string().nullable(),
    last_updated_at: isoUtcSchema,
  }),
  progress: z.object({
    total_intended_work_seconds: durationSecondsSchema.nullable(),
    total_aligned_seconds: durationSecondsSchema,
    total_support_seconds: durationSecondsSchema,
    total_drift_seconds: durationSecondsSchema,
    tasks: z.array(taskProgressCardSchema),
  }),
  recent_episodes: z.array(episodeSummarySchema),
  corrections: z.array(correctionSummarySchema),
  ambiguity_queue: z.array(ambiguityQueueItemSchema),
  review_queue: z.array(durableRuleReviewItemSchema),
  morning_exchange: morningExchangeViewModelSchema.nullable(),
  evening_exchange: eveningExchangeViewModelSchema.nullable(),
  privacy_exclusions: privacyExclusionsViewModelSchema,
});

const clarificationChoiceSchema = z.object({
  answer_id: opaqueIdSchema,
  label: z.string().min(1),
  semantics: z.enum([
    "task",
    "support_work",
    "work_group",
    "admin",
    "break",
    "intentional_detour",
    "not_related",
  ]),
  task_id: opaqueIdSchema.nullable(),
  work_group_id: opaqueIdSchema.nullable(),
});

const clarificationHudViewModelSchema = z.object({
  clarification_id: opaqueIdSchema,
  created_at: isoUtcSchema,
  expires_at: isoUtcSchema.nullable(),
  prompt: z.string().min(1),
  subtitle: z.string().nullable(),
  choices: z.array(clarificationChoiceSchema),
  related_episode_id: opaqueIdSchema.nullable(),
  remember_toggle_default: z.boolean(),
  allow_remember_toggle: z.boolean(),
});

const interventionActionSchema = z.object({
  action_id: opaqueIdSchema,
  label: z.string().min(1),
  semantic_action: z.enum([
    "return_now",
    "intentional_detour",
    "pause_10_minutes",
    "open_dashboard",
    "dismiss",
    "confirm_milestone",
    "dismiss_milestone",
  ]),
});

const interventionViewModelSchema = z.object({
  intervention_id: opaqueIdSchema,
  created_at: isoUtcSchema,
  kind: z.enum([
    "hard_drift",
    "praise",
    "recovery_anchor",
    "risk_prompt",
    "clarification_notification",
    "milestone_candidate",
  ]),
  presentation: z.enum(["dashboard_only", "local_notification", "both"]),
  severity: severitySchema,
  title: z.string().min(1),
  body: z.string().min(1),
  actions: z.array(interventionActionSchema),
  suppress_native_notification: z.boolean(),
  suppression_reason: z
    .enum(["observe_only", "cooldown", "paused", "permissions_missing", "mode_gate"])
    .nullable(),
  dedupe_key: z.string().min(1),
  expires_at: isoUtcSchema.nullable(),
});

const menuBarViewModelSchema = z
  .object({
    color_token: colorTokenSchema,
    mode_label: z.string().min(1),
    primary_label: z.string().min(1),
    secondary_label: z.string().nullable(),
    runtime_state: runtimeStateSchema,
    is_support_work: z.boolean(),
    confidence_ratio: ratioSchema.nullable(),
    active_goal_id: opaqueIdSchema.nullable(),
    active_goal_title: z.string().nullable(),
    active_task_id: opaqueIdSchema.nullable(),
    active_task_title: z.string().nullable(),
    state_started_at: isoUtcSchema.nullable(),
    focused_elapsed_seconds: durationSecondsSchema.nullable(),
    pause_until: isoUtcSchema.nullable(),
    allowed_actions: z.object({
      can_pause: z.boolean(),
      can_resume: z.boolean(),
      can_take_break: z.boolean(),
      can_open_morning_flow: z.boolean(),
      can_open_evening_flow: z.boolean(),
    }),
  })
  .superRefine((value, ctx) => {
    if (value.is_support_work && value.runtime_state !== "aligned") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["is_support_work"],
        message: "Support work is only valid while runtime_state is aligned.",
      });
    }
  });

const systemHealthViewModelSchema = z.object({
  overall_status: healthStatusSchema,
  screenpipe: z.object({
    status: healthStatusSchema,
    last_ok_at: isoUtcSchema.nullable(),
    last_error_at: isoUtcSchema.nullable(),
    message: z.string().nullable(),
  }),
  database: z.object({
    status: healthStatusSchema,
    last_ok_at: isoUtcSchema.nullable(),
    last_error_at: isoUtcSchema.nullable(),
    message: z.string().nullable(),
  }),
  scheduler: z.object({
    fast_tick_last_ran_at: isoUtcSchema.nullable(),
    slow_tick_last_ran_at: isoUtcSchema.nullable(),
  }),
  notifications: z.object({
    os_permission: z.enum(["unknown", "granted", "denied"]),
    muted_by_logic: z.boolean(),
    muted_reason: z
      .enum(["observe_only", "cooldown", "paused", "mode_gate"])
      .nullable(),
  }),
  observe_only: z.object({
    active: z.boolean(),
    ticks_remaining: z.number().int().nonnegative().nullable(),
  }),
});

export const systemStateSchema = z
  .object({
    schema_version: schemaVersionSchema,
    runtime_session_id: uuidSchema,
    stream_sequence: sequenceNumberSchema,
    emitted_at: isoUtcSchema,
    caused_by_command_id: uuidSchema.nullable(),
    mode: modeSchema,
    menu_bar: menuBarViewModelSchema,
    dashboard: dashboardViewModelSchema,
    clarification_hud: clarificationHudViewModelSchema.nullable(),
    intervention: interventionViewModelSchema.nullable(),
    system_health: systemHealthViewModelSchema,
  })
  .superRefine((value, ctx) => {
    if (value.mode === "paused" && value.menu_bar.runtime_state !== "paused") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["menu_bar", "runtime_state"],
        message: "Paused mode requires menu_bar.runtime_state to be paused.",
      });
    }

    if (value.mode === "no_plan") {
      if (value.menu_bar.active_goal_title !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["menu_bar", "active_goal_title"],
          message: "No-plan mode requires active goal title to be null.",
        });
      }

      if (value.menu_bar.active_task_title !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["menu_bar", "active_task_title"],
          message: "No-plan mode requires active task title to be null.",
        });
      }
    }
  });

export type ExplainabilityItem = z.infer<typeof explainabilityItemSchema>;
export type PrivacyExclusionEntry = z.infer<typeof privacyExclusionEntrySchema>;
export type SystemState = z.infer<typeof systemStateSchema>;
