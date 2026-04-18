import { randomUUID } from "node:crypto";

import {
  systemStateSchema,
  type SystemState,
} from "@ineedabossagent/shared-contracts";

import type { SqliteDatabase } from "../db/database.js";
import { DailyPlanRepo, TaskRepo } from "../repos/sqlite-repositories.js";
import {
  applyScreenpipeHealthToSystemState,
  type ScreenpipeHealthProbe,
} from "../screenpipe/client.js";
import { createDefaultSystemState } from "../system-state/default-system-state.js";

type BuildStartupSystemStateOptions = {
  database: SqliteDatabase;
  emittedAt?: string;
  runtimeSessionId?: string;
  screenpipeHealth?: ScreenpipeHealthProbe;
};

const sortPlansByImportedAt = <T extends { importedAt: string }>(plans: T[]): T[] =>
  [...plans].sort((left, right) => left.importedAt.localeCompare(right.importedAt));

export const buildStartupSystemState = ({
  database,
  emittedAt = new Date().toISOString(),
  runtimeSessionId = randomUUID(),
  screenpipeHealth,
}: BuildStartupSystemStateOptions): SystemState => {
  const baseState = createDefaultSystemState();
  const dailyPlanRepo = new DailyPlanRepo(database);
  const taskRepo = new TaskRepo(database);
  const plans = sortPlansByImportedAt(dailyPlanRepo.listAll());
  const latestPlan = plans.at(-1) ?? null;

  if (latestPlan === null) {
    const systemState = systemStateSchema.parse({
      ...baseState,
      dashboard: {
        ...baseState.dashboard,
        header: {
          ...baseState.dashboard.header,
          local_date: emittedAt.slice(0, 10),
          mode: "no_plan",
          summary_text: "No imported plan is available yet.",
        },
        morning_exchange: {
          status: "required",
          context_packet_text: null,
          prompt_text: null,
        },
        plan: null,
      },
      emitted_at: emittedAt,
      menu_bar: {
        ...baseState.menu_bar,
        active_goal_id: null,
        active_goal_title: null,
        active_task_id: null,
        active_task_title: null,
        allowed_actions: {
          ...baseState.menu_bar.allowed_actions,
          can_open_evening_flow: false,
          can_open_morning_flow: true,
          can_pause: false,
        },
        mode_label: "No Plan",
        primary_label: "Start your day plan",
      },
      mode: "no_plan",
      runtime_session_id: runtimeSessionId,
    });

    return screenpipeHealth === undefined
      ? systemState
      : applyScreenpipeHealthToSystemState(systemState, screenpipeHealth);
  }

  const plannedTasks = taskRepo
    .listAll()
    .filter((task) => task.planId === latestPlan.planId)
    .map((task) => ({
      allowed_support_work: task.allowedSupportWork,
      intended_work_seconds_today: task.intendedWorkSecondsToday,
      likely_detours_that_still_count: task.likelyDetours,
      progress_kind: task.progressKind,
      success_definition: task.successDefinition,
      task_id: task.taskId,
      title: task.title,
      total_remaining_effort_seconds: task.totalRemainingEffortSeconds,
    }));

  const systemState = systemStateSchema.parse({
    ...baseState,
    dashboard: {
      ...baseState.dashboard,
      header: {
        ...baseState.dashboard.header,
        local_date: latestPlan.localDate,
        mode: "running",
        summary_text: "Plan loaded. Runtime ready.",
      },
      morning_exchange: {
        status: "completed",
        context_packet_text: null,
        prompt_text: null,
      },
      evening_exchange: {
        ...baseState.dashboard.evening_exchange,
        status: "available",
      },
      plan: {
        imported_at: latestPlan.importedAt,
        local_date: latestPlan.localDate,
        notes_for_tracker: latestPlan.notesForTracker,
        plan_id: latestPlan.planId,
        tasks: plannedTasks,
        total_intended_work_seconds: latestPlan.totalIntendedWorkSeconds,
      },
    },
    emitted_at: emittedAt,
    menu_bar: {
      ...baseState.menu_bar,
      allowed_actions: {
        ...baseState.menu_bar.allowed_actions,
        can_open_evening_flow: true,
        can_pause: true,
      },
      mode_label: "Running",
      primary_label: latestPlan.notesForTracker ?? "Plan loaded",
    },
    mode: "running",
    runtime_session_id: runtimeSessionId,
  });

  return screenpipeHealth === undefined
    ? systemState
    : applyScreenpipeHealthToSystemState(systemState, screenpipeHealth);
};
