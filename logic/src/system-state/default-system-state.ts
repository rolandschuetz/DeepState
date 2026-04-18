import { randomUUID } from "node:crypto";

import {
  systemStateSchema,
  type SystemState,
} from "@ineedabossagent/shared-contracts";

export const createDefaultSystemState = (): SystemState =>
  systemStateSchema.parse({
    schema_version: "1.0.0",
    runtime_session_id: randomUUID(),
    stream_sequence: 1,
    emitted_at: "2026-04-18T00:00:00Z",
    caused_by_command_id: null,
    mode: "booting",
    menu_bar: {
      color_token: "gray",
      mode_label: "Booting",
      primary_label: "Starting logic runtime",
      secondary_label: null,
      runtime_state: "uncertain",
      is_support_work: false,
      confidence_ratio: null,
      active_goal_id: null,
      active_goal_title: null,
      active_task_id: null,
      active_task_title: null,
      state_started_at: null,
      focused_elapsed_seconds: null,
      pause_until: null,
      allowed_actions: {
        can_pause: false,
        can_resume: false,
        can_take_break: false,
        can_open_morning_flow: true,
        can_open_evening_flow: false,
      },
    },
    dashboard: {
      header: {
        local_date: "2026-04-18",
        mode: "booting",
        summary_text: "Logic runtime is starting.",
        warning_banner: null,
      },
      plan: null,
      current_focus: {
        runtime_state: "uncertain",
        is_support_work: false,
        confidence_ratio: null,
        explainability: [],
        last_good_context: null,
        last_updated_at: "2026-04-18T00:00:00Z",
      },
      progress: {
        total_intended_work_seconds: null,
        total_aligned_seconds: 0,
        total_support_seconds: 0,
        total_drift_seconds: 0,
        tasks: [],
      },
      recent_episodes: [],
      corrections: [],
      ambiguity_queue: [],
      review_queue: [],
      morning_exchange: {
        status: "required",
        context_packet_text: null,
        prompt_text: null,
      },
      evening_exchange: {
        status: "not_ready",
        debrief_packet_text: null,
        prompt_text: null,
      },
      privacy_exclusions: {
        exclusions: [],
      },
    },
    clarification_hud: null,
    intervention: null,
    system_health: {
      overall_status: "ok",
      screenpipe: {
        status: "ok",
        last_ok_at: null,
        last_error_at: null,
        message: "Awaiting probe.",
      },
      database: {
        status: "ok",
        last_ok_at: null,
        last_error_at: null,
        message: "Awaiting probe.",
      },
      scheduler: {
        fast_tick_last_ran_at: null,
        slow_tick_last_ran_at: null,
      },
      notifications: {
        os_permission: "unknown",
        muted_by_logic: true,
        muted_reason: "mode_gate",
      },
      observe_only: {
        active: false,
        ticks_remaining: null,
      },
    },
  });
