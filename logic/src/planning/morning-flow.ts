import { randomUUID } from "node:crypto";

import {
  eveningDebriefExchangeSchema,
  morningPlanExchangeSchema,
  type Command,
  type MorningPlanExchange,
  type SystemState,
} from "@ineedabossagent/shared-contracts";

import type { SqliteDatabase } from "../db/database.js";
import {
  DailyPlanRepo,
  GoalContractRepo,
  ImportAuditLogRepo,
  TaskRepo,
} from "../repos/sqlite-repositories.js";
import { buildStartupSystemState } from "../bootstrap/startup-state.js";

import {
  CoachingExchangeParseError,
  parseCoachingExchange,
} from "./coaching-exchange-parse.js";
import { importEveningDebriefExchange } from "./evening-flow.js";

export { CoachingExchangeParseError, parseCoachingExchange } from "./coaching-exchange-parse.js";

export type MorningFlowTriggerReason =
  | "first_notebook_open_after_4am"
  | "manual_start_day"
  | "manual_plan_reset";

export type MorningFlowTriggerEvent = {
  localDate: string;
  openedAt: string;
  reason: MorningFlowTriggerReason;
};

export type MorningFlowTriggerState = {
  hasPlanForToday: boolean;
  hasTriggeredForDate: boolean;
  triggeredLocalDate: string | null;
};

export type MorningContextPacket = {
  carryOverContext: string[];
  localDate: string;
  openQuestions: string[];
  unresolvedAmbiguities: string[];
  yesterdayDebriefOutcomes: string[];
  declaredMeetings: string[];
  durableRulesSafeToSurface: string[];
};

const normalizeTextList = (values: string[]): string[] =>
  [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];

const isAfterDailyMorningCutoff = (openedAt: string, localDate: string): boolean =>
  openedAt >= `${localDate}T04:00:00`;

export const shouldTriggerMorningFlow = (
  state: MorningFlowTriggerState,
  event: MorningFlowTriggerEvent,
): boolean => {
  if (event.reason === "manual_plan_reset") {
    return true;
  }

  if (state.hasPlanForToday) {
    return false;
  }

  if (
    event.reason === "first_notebook_open_after_4am" &&
    !isAfterDailyMorningCutoff(event.openedAt, event.localDate)
  ) {
    return false;
  }

  return !(state.hasTriggeredForDate && state.triggeredLocalDate === event.localDate);
};

export const buildMorningContextPacket = ({
  carryOverContext,
  declaredMeetings,
  durableRulesSafeToSurface,
  localDate,
  openQuestions,
  unresolvedAmbiguities,
  yesterdayDebriefOutcomes,
}: MorningContextPacket): string =>
  JSON.stringify(
    {
      carry_over_context: normalizeTextList(carryOverContext),
      declared_meetings: normalizeTextList(declaredMeetings),
      durable_rules_safe_to_surface: normalizeTextList(durableRulesSafeToSurface),
      local_date: localDate,
      open_questions: normalizeTextList(openQuestions),
      unresolved_ambiguities: normalizeTextList(unresolvedAmbiguities),
      yesterday_debrief_outcomes: normalizeTextList(yesterdayDebriefOutcomes),
    },
    null,
    2,
  );

export const generateMorningPrompt = (contextPacketText: string): string =>
  [
    "You are preparing a structured morning plan for a focus coaching app.",
    "Return strict JSON only. Do not include markdown fences or any prose before or after the JSON.",
    'The JSON must validate against schema_version "1.0.0" and exchange_type "morning_plan".',
    "Choose 1 to 3 concrete tasks for today.",
    "Each task must include a success_definition, intended_work_seconds_today, progress_kind, allowed_support_work, and likely_detours_that_still_count.",
    "Keep total_intended_work_seconds greater than zero, and do not let the sum of task intended_work_seconds_today exceed total_intended_work_seconds.",
    "Use this planning context:",
    contextPacketText,
  ].join("\n\n");

export const parseMorningPlanExchange = (rawText: string): MorningPlanExchange => {
  const parsed = parseCoachingExchange(rawText);

  if (parsed.exchange_type !== "morning_plan") {
    throw new CoachingExchangeParseError(
      `Expected a morning_plan payload but received ${parsed.exchange_type}.`,
    );
  }

  return morningPlanExchangeSchema.parse(parsed);
};

export const createMorningFlowState = (
  currentState: SystemState,
  options: {
    causedByCommandId?: string | null;
    contextPacketText: string;
    emittedAt: string;
    promptText: string;
  },
): SystemState => ({
  ...currentState,
  caused_by_command_id: options.causedByCommandId ?? null,
  dashboard: {
    ...currentState.dashboard,
    header: {
      ...currentState.dashboard.header,
      mode: "no_plan",
      summary_text: "Morning plan is ready to export.",
    },
    morning_exchange: {
      status: "available",
      context_packet_text: options.contextPacketText,
      prompt_text: options.promptText,
    },
  },
  emitted_at: options.emittedAt,
  menu_bar: {
    ...currentState.menu_bar,
    allowed_actions: {
      ...currentState.menu_bar.allowed_actions,
      can_open_morning_flow: true,
    },
    mode_label: "No Plan",
    primary_label: "Morning plan ready",
  },
  mode: "no_plan",
  stream_sequence: currentState.stream_sequence + 1,
});

const deletePlanGraph = (database: SqliteDatabase, planId: string): void => {
  database.prepare("DELETE FROM focus_blocks WHERE plan_id = ?").run(planId);
  database.prepare("DELETE FROM task_contracts WHERE plan_id = ?").run(planId);
  database.prepare("DELETE FROM goal_contracts WHERE plan_id = ?").run(planId);
  database.prepare("DELETE FROM daily_plans WHERE plan_id = ?").run(planId);
};

export const importMorningPlanExchange = ({
  commandId = null,
  database,
  exchange,
  importedAt = new Date().toISOString(),
  runtimeSessionId,
  source,
}: {
  commandId?: string | null;
  database: SqliteDatabase;
  exchange: MorningPlanExchange;
  importedAt?: string;
  runtimeSessionId?: string;
  source: "clipboard" | "manual_paste";
}): SystemState => {
  const dailyPlanRepo = new DailyPlanRepo(database);
  const goalContractRepo = new GoalContractRepo(database);
  const taskRepo = new TaskRepo(database);
  const importAuditLogRepo = new ImportAuditLogRepo(database);
  const existingPlansForDate = dailyPlanRepo
    .listAll()
    .filter((plan) => plan.localDate === exchange.local_date);
  const planId = `plan_${exchange.local_date}`;

  database.transaction(() => {
    for (const existingPlan of existingPlansForDate) {
      deletePlanGraph(database, existingPlan.planId);
    }

    dailyPlanRepo.create({
      importedAt,
      localDate: exchange.local_date,
      notesForTracker: exchange.notes_for_tracker,
      planId,
      totalIntendedWorkSeconds: exchange.total_intended_work_seconds,
    });

    for (const [index, task] of exchange.tasks.entries()) {
      const goalId = `goal_${exchange.local_date}_${index + 1}`;
      const taskId = `task_${exchange.local_date}_${index + 1}`;

      goalContractRepo.create({
        createdAt: importedAt,
        goalId,
        planId,
        sortOrder: index + 1,
        successDefinition: task.success_definition,
        title: task.title,
      });
      taskRepo.create({
        allowedSupportWork: task.allowed_support_work,
        createdAt: importedAt,
        goalId,
        intendedWorkSecondsToday: task.intended_work_seconds_today,
        likelyDetours: task.likely_detours_that_still_count,
        planId,
        progressKind: task.progress_kind,
        sortOrder: index + 1,
        successDefinition: task.success_definition,
        taskId,
        title: task.title,
        totalRemainingEffortSeconds: task.total_remaining_effort_seconds,
      });
    }

    importAuditLogRepo.create({
      accepted: true,
      auditId: randomUUID(),
      exchangeType: exchange.exchange_type,
      importedAt,
      localDate: exchange.local_date,
      note: existingPlansForDate.length > 0 ? "replaced_existing_plan_for_day" : null,
      payload: exchange,
      schemaVersion: exchange.schema_version,
      source,
    });
  })();

  const nextState = buildStartupSystemState({
    database,
    emittedAt: importedAt,
    ...(runtimeSessionId === undefined ? {} : { runtimeSessionId }),
  });

  return {
    ...nextState,
    caused_by_command_id: commandId,
    dashboard: {
      ...nextState.dashboard,
      header: {
        ...nextState.dashboard.header,
        summary_text: "Morning plan imported. Runtime running.",
      },
      morning_exchange: {
        status: "completed",
        context_packet_text: null,
        prompt_text: null,
      },
    },
    menu_bar: {
      ...nextState.menu_bar,
      primary_label: exchange.notes_for_tracker ?? "Plan imported",
    },
  };
};

export const handleMorningFlowCommand = ({
  command,
  currentState,
  database,
  importedAt = new Date().toISOString(),
  runtimeSessionId,
}: {
  command: Extract<Command, { kind: "import_coaching_exchange" }>;
  currentState: SystemState;
  database: SqliteDatabase;
  importedAt?: string;
  runtimeSessionId?: string;
}): SystemState => {
  void currentState;
  const exchange = parseCoachingExchange(command.payload.raw_text);

  if (exchange.exchange_type === "morning_plan") {
    return importMorningPlanExchange({
      commandId: command.command_id,
      database,
      exchange,
      importedAt,
      source: command.payload.source,
      ...(runtimeSessionId === undefined ? {} : { runtimeSessionId }),
    });
  }

  return importEveningDebriefExchange({
    commandId: command.command_id,
    database,
    exchange: eveningDebriefExchangeSchema.parse(exchange),
    importedAt,
    source: command.payload.source,
    ...(runtimeSessionId === undefined ? {} : { runtimeSessionId }),
  });
};
