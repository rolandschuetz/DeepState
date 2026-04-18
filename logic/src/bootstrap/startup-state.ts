import { randomUUID } from "node:crypto";

import {
  systemStateSchema,
  type SystemState,
} from "@ineedabossagent/shared-contracts";

import type { SqliteDatabase } from "../db/database.js";
import {
  buildEveningDebriefPacket,
  buildReviewQueueFromDatabase,
  generateEveningPrompt,
  hasAcceptedEveningDebriefForLocalDate,
} from "../planning/evening-debrief-context.js";
import {
  ClassificationRepo,
  CorrectionRepo,
  DailyPlanRepo,
  EpisodeRepo,
  InterventionRepo,
  PendingClarificationRepo,
  ProgressRepo,
  TaskRepo,
} from "../repos/sqlite-repositories.js";
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

const clampRatio = (value: number | null): number | null => {
  if (value === null || Number.isFinite(value) === false) {
    return null;
  }

  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
};

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
        review_queue: buildReviewQueueFromDatabase(database),
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

  const pendingClarificationRepo = new PendingClarificationRepo(database);
  const classificationRepo = new ClassificationRepo(database);
  const correctionRepo = new CorrectionRepo(database);
  const episodeRepo = new EpisodeRepo(database);
  const interventionRepo = new InterventionRepo(database);
  const progressRepo = new ProgressRepo(database);
  const pendingRows = pendingClarificationRepo.listPendingForPlan(latestPlan.planId);
  const pendingRow = pendingRows[0] ?? null;

  let clarificationHud: SystemState["clarification_hud"] = null;
  const ambiguityQueue: SystemState["dashboard"]["ambiguity_queue"] = [];

  if (pendingRow !== null) {
    try {
      clarificationHud = JSON.parse(pendingRow.hudJson) as NonNullable<
        SystemState["clarification_hud"]
      >;

      ambiguityQueue.push({
        ambiguity_id: clarificationHud.clarification_id,
        created_at: pendingRow.createdAt,
        prompt: clarificationHud.prompt,
        resolution_summary: null,
        status: "pending",
      });
    } catch {
      clarificationHud = null;
    }
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
  const taskTitleById = new Map(plannedTasks.map((task) => [task.task_id, task.title]));
  const latestClassification = classificationRepo.listAll().at(-1) ?? null;
  const progressCards = progressRepo
    .listAll()
    .filter((estimate) => estimate.planId === latestPlan.planId && estimate.taskId !== null)
    .reduce<
      Map<
        string,
        {
          aligned_seconds: number;
          confidence_ratio: number | null;
          drift_seconds: number;
          eta_remaining_seconds: number | null;
          latest_status_text: string;
          progress_ratio: number | null;
          risk_level: "high" | "low" | "medium" | null;
          support_seconds: number;
          task_id: string;
          title: string;
        }
      >
    >((cards, estimate) => {
      const taskId = estimate.taskId as string;
      cards.set(taskId, {
        aligned_seconds: estimate.alignedSeconds,
        confidence_ratio: clampRatio(estimate.confidenceRatio),
        drift_seconds: estimate.driftSeconds,
        eta_remaining_seconds: estimate.etaRemainingSeconds,
        latest_status_text: estimate.latestStatusText,
        progress_ratio: clampRatio(estimate.progressRatio),
        risk_level: estimate.riskLevel,
        support_seconds: estimate.supportSeconds,
        task_id: taskId,
        title: taskTitleById.get(taskId) ?? "Unknown task",
      });
      return cards;
    }, new Map());
  const recentEpisodes = episodeRepo
    .listAll()
    .slice(-8)
    .reverse()
    .map((episode) => ({
      confidence_ratio: clampRatio(episode.confidenceRatio),
      ended_at: episode.endedAt,
      episode_id: episode.episodeId,
      is_support_work: episode.isSupportWork,
      matched_task_id: episode.matchedTaskId,
      matched_task_title:
        episode.matchedTaskId === null ? null : (taskTitleById.get(episode.matchedTaskId) ?? null),
      runtime_state: episode.runtimeState,
      started_at: episode.startedAt,
      top_evidence: episode.topEvidence,
    }));
  const corrections = correctionRepo
    .listAll()
    .slice(-8)
    .reverse()
    .map((correction) => ({
      correction_id: correction.correctionId,
      created_at: correction.createdAt,
      kind:
        correction.correctionKind === "clarification"
          ? "clarification"
          : correction.correctionKind === "notification_action"
            ? "notification_action"
            : "manual_override",
      summary_text: correction.summaryText,
    }));
  const latestIntervention = interventionRepo.listAll().at(-1) ?? null;
  const totalAlignedSeconds = [...progressCards.values()].reduce(
    (total, card) => total + card.aligned_seconds,
    0,
  );
  const totalSupportSeconds = [...progressCards.values()].reduce(
    (total, card) => total + card.support_seconds,
    0,
  );
  const totalDriftSeconds = [...progressCards.values()].reduce(
    (total, card) => total + card.drift_seconds,
    0,
  );

  const eveningDebriefDone = hasAcceptedEveningDebriefForLocalDate(database, latestPlan.localDate);

  let debriefPacketText: string | null = null;
  let eveningPromptText: string | null = null;

  if (!eveningDebriefDone) {
    debriefPacketText = buildEveningDebriefPacket({
      database,
      localDate: latestPlan.localDate,
      plan: latestPlan,
      planId: latestPlan.planId,
    });
    eveningPromptText = generateEveningPrompt(debriefPacketText);
  }

  const systemState = systemStateSchema.parse({
    ...baseState,
    clarification_hud: clarificationHud,
    dashboard: {
      ...baseState.dashboard,
      ambiguity_queue: ambiguityQueue,
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
      evening_exchange: eveningDebriefDone
        ? {
            debrief_packet_text: null,
            prompt_text: null,
            status: "completed",
          }
        : {
            debrief_packet_text: debriefPacketText,
            prompt_text: eveningPromptText,
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
      current_focus: {
        runtime_state: latestClassification?.runtimeState ?? "uncertain",
        is_support_work: latestClassification?.isSupport ?? false,
        confidence_ratio: clampRatio(latestClassification?.confidenceRatio ?? null),
        explainability: latestClassification?.explainability ?? [],
        last_good_context: latestClassification?.lastGoodContext ?? null,
        last_updated_at: latestClassification?.classifiedAt ?? emittedAt,
      },
      progress: {
        total_intended_work_seconds: latestPlan.totalIntendedWorkSeconds,
        total_aligned_seconds: totalAlignedSeconds,
        total_support_seconds: totalSupportSeconds,
        total_drift_seconds: totalDriftSeconds,
        tasks: [...progressCards.values()],
      },
      recent_episodes: recentEpisodes,
      corrections,
      review_queue: buildReviewQueueFromDatabase(database),
    },
    emitted_at: emittedAt,
    intervention:
      latestIntervention === null
        ? null
        : {
            intervention_id: latestIntervention.interventionId,
            created_at: latestIntervention.createdAt,
            kind: latestIntervention.kind as
              | "clarification_notification"
              | "hard_drift"
              | "milestone_candidate"
              | "praise"
              | "recovery_anchor"
              | "risk_prompt",
            presentation: latestIntervention.presentation as
              | "both"
              | "dashboard_only"
              | "local_notification",
            severity: latestIntervention.severity as "error" | "info" | "warning",
            title: latestIntervention.title,
            body: latestIntervention.body,
            actions: latestIntervention.actions.map((action) => ({
              action_id: action.actionId,
              label: action.label,
              semantic_action: action.semanticAction as
                | "confirm_milestone"
                | "dismiss"
                | "dismiss_milestone"
                | "intentional_detour"
                | "open_dashboard"
                | "pause_10_minutes"
                | "return_now",
            })),
            suppress_native_notification: latestIntervention.suppressNativeNotification,
            suppression_reason: latestIntervention.suppressionReason as
              | "cooldown"
              | "mode_gate"
              | "observe_only"
              | "paused"
              | "permissions_missing"
              | null,
            dedupe_key: latestIntervention.dedupeKey,
            expires_at: latestIntervention.expiresAt,
          },
    menu_bar: {
      ...baseState.menu_bar,
      allowed_actions: {
        ...baseState.menu_bar.allowed_actions,
        can_open_evening_flow: true,
        can_pause: true,
      },
      mode_label: "Running",
      primary_label: latestPlan.notesForTracker ?? "Plan loaded",
      runtime_state: latestClassification?.runtimeState ?? "uncertain",
      is_support_work: latestClassification?.isSupport ?? false,
      confidence_ratio: clampRatio(latestClassification?.confidenceRatio ?? null),
      active_goal_id: latestClassification?.matchedGoalId ?? null,
      active_task_id: latestClassification?.matchedTaskId ?? null,
      active_task_title:
        latestClassification === null || latestClassification.matchedTaskId === null
          ? null
          : (taskTitleById.get(latestClassification.matchedTaskId) ?? null),
      state_started_at: recentEpisodes[0]?.started_at ?? null,
    },
    mode: "running",
    runtime_session_id: runtimeSessionId,
  });

  return screenpipeHealth === undefined
    ? systemState
    : applyScreenpipeHealthToSystemState(systemState, screenpipeHealth);
};
