import type { Mode, RuntimeState } from "@ineedabossagent/shared-contracts";

import {
  buildEpisodesFromClassifiedWindows,
  type ClassifiedWindowInput,
} from "../context/episode-builder.js";
import {
  computeProgressEstimatesForPlan,
  inferMilestoneCandidate,
} from "../progress/progress-estimator.js";
import type { FocusBlockRecord, TaskContractRecord } from "../repos/sqlite-repositories.js";
import {
  EpisodeRepo,
  InterventionRepo,
  ProgressRepo,
  SettingsRepo,
} from "../repos/sqlite-repositories.js";
import type { SqliteDatabase } from "../db/database.js";
import { decideIntervention } from "../interventions/intervention-engine.js";
import type { InterventionDecision } from "../interventions/intervention-engine.js";

export type Phase5OrchestratorMemory = {
  lastHardDriftNotificationAtMs: number | null;
  previousRuntimeState: RuntimeState;
};

export const createInitialPhase5Memory = (
  initialPreviousState: RuntimeState = "uncertain",
): Phase5OrchestratorMemory => ({
  lastHardDriftNotificationAtMs: null,
  previousRuntimeState: initialPreviousState,
});

export type RunPhase5SlowTickParams = {
  classificationId: string | null;
  classificationRuntimeState: RuntimeState;
  classifiedWindows: ClassifiedWindowInput[];
  database: SqliteDatabase;
  estimatedAtIso: string;
  focusBlocks: FocusBlockRecord[];
  lastGoodContext: string | null;
  localDayStartMs: number;
  memory: Phase5OrchestratorMemory;
  /** When true, runs deterministic milestone inference (opt-in to avoid repeating every tick). */
  milestoneScanEnabled?: boolean;
  mode: Mode;
  notificationPermissionGranted: boolean;
  nowIso: string;
  nowMs: number;
  paused: boolean;
  planId: string;
  taskForMilestoneInference: TaskContractRecord | null;
  taskTitle: string | null;
  tasks: TaskContractRecord[];
};

export type Phase5SlowTickResult = {
  decision: InterventionDecision;
  episodeIds: string[];
  memory: Phase5OrchestratorMemory;
  progressEstimateIds: string[];
};

/**
 * Single seam for Phase 8 slow tick: episodes → progress snapshots → interventions, persisted.
 */
export const runPhase5SlowTick = ({
  classificationId,
  classificationRuntimeState,
  classifiedWindows,
  database,
  estimatedAtIso,
  focusBlocks,
  lastGoodContext,
  localDayStartMs,
  memory,
  milestoneScanEnabled = false,
  mode,
  notificationPermissionGranted,
  nowIso,
  nowMs,
  paused,
  planId,
  taskForMilestoneInference,
  taskTitle,
  tasks,
}: RunPhase5SlowTickParams): Phase5SlowTickResult => {
  const episodeRepo = new EpisodeRepo(database);
  const progressRepo = new ProgressRepo(database);
  const interventionRepo = new InterventionRepo(database);
  const settingsRepo = new SettingsRepo(database);

  const existingEpisodes = episodeRepo.listAll();
  const episodeKey = (contextWindowIds: string[]): string => contextWindowIds.join("|");
  const existingEpisodeKeys = new Set(
    existingEpisodes.map((episode) => episodeKey(episode.contextWindowIds)),
  );
  const newEpisodes = buildEpisodesFromClassifiedWindows(classifiedWindows).filter(
    (episode) => !existingEpisodeKeys.has(episodeKey(episode.contextWindowIds)),
  );

  for (const episode of newEpisodes) {
    episodeRepo.create(episode);
  }

  const episodeHistory = [...existingEpisodes, ...newEpisodes];

  const progressDrafts = computeProgressEstimatesForPlan({
    episodes: episodeHistory,
    estimatedAt: estimatedAtIso,
    focusBlocks,
    localDayStartMs,
    nowMs,
    planId,
    tasks,
  });

  const progressEstimateIds: string[] = [];

  for (const draft of progressDrafts) {
    progressRepo.create(draft);
    progressEstimateIds.push(draft.progressEstimateId);
  }

  const settings = settingsRepo.getById(1);
  const observeOnlyTicksRemaining = settings?.observeOnlyTicksRemaining ?? 0;

  if (observeOnlyTicksRemaining > 0) {
    settingsRepo.update({
      ...(settings ?? {
        createdAt: nowIso,
        observationRetentionDays: 14,
        observeOnlySeedVersion: 1,
        observeOnlyTicksRemaining: 0,
        settingsId: 1,
        staleContextWindowRetentionHours: 12,
        updatedAt: nowIso,
      }),
      observeOnlyTicksRemaining: observeOnlyTicksRemaining - 1,
      updatedAt: nowIso,
    });
  }

  const highRiskDraft = progressDrafts.find((draft) => draft.riskLevel === "high");

  const milestoneCandidate =
    taskForMilestoneInference === null || !milestoneScanEnabled
      ? null
      : inferMilestoneCandidate({
          episodes: episodeHistory,
          task: taskForMilestoneInference,
        });

  const decision = decideIntervention({
    classificationRuntimeState,
    lastGoodContext,
    lastHardDriftNotificationAtMs: memory.lastHardDriftNotificationAtMs,
    milestoneCandidate,
    mode,
    notificationPermissionGranted,
    nowIso,
    nowMs,
    observeOnlyTicksRemaining,
    paused,
    previousRuntimeState: memory.previousRuntimeState,
    riskPromptDetail:
      highRiskDraft === undefined
        ? null
        : `High risk on a task: ${highRiskDraft.latestStatusText}`,
    sourceClassificationId: classificationId,
    taskTitle,
  });

  if (decision.intervention !== null) {
    interventionRepo.create(decision.intervention);
  }

  const nextMemory: Phase5OrchestratorMemory = {
    lastHardDriftNotificationAtMs: decision.lastHardDriftNotificationAtMs,
    previousRuntimeState: classificationRuntimeState,
  };

  return {
    decision,
    episodeIds: newEpisodes.map((episode) => episode.episodeId),
    memory: nextMemory,
    progressEstimateIds,
  };
};
