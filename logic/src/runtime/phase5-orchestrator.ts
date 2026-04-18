import type { Mode, RuntimeState } from "@ineedabossagent/shared-contracts";

import {
  createInitialAmbiguityPolicyMemory,
  fingerprintForContextWindow,
  markHudShownForFingerprint,
  tickAmbiguityPolicy,
  type AmbiguityPolicyMemory,
} from "../ambiguity/ambiguity-policy.js";
import {
  buildClarificationHud,
  evidenceSnapshotFromWindow,
} from "../ambiguity/build-clarification-hud.js";
import type { ClarificationHudModel } from "../ambiguity/build-clarification-hud.js";
import {
  buildEpisodesFromClassifiedWindows,
  type ClassifiedWindowInput,
} from "../context/episode-builder.js";
import type { AggregatedContextWindow } from "../context/context-aggregator.js";
import {
  alignedStreakDurationMs,
  createInitialPraisePolicyMemory,
  nextPraisePolicyMemory,
  pickPraiseFocusBlockKey,
  type PraisePolicyMemory,
} from "../interventions/praise-engine.js";
import {
  computeProgressEstimatesForPlan,
  inferMilestoneCandidate,
} from "../progress/progress-estimator.js";
import type {
  FocusBlockRecord,
  PendingClarificationRecord,
  TaskContractRecord,
} from "../repos/sqlite-repositories.js";
import {
  EpisodeRepo,
  InterventionRepo,
  PendingClarificationRepo,
  ProgressRepo,
  SettingsRepo,
} from "../repos/sqlite-repositories.js";
import type { SqliteDatabase } from "../db/database.js";
import { decideIntervention } from "../interventions/intervention-engine.js";
import type { InterventionDecision } from "../interventions/intervention-engine.js";

export type Phase5OrchestratorMemory = {
  ambiguityMemory?: AmbiguityPolicyMemory;
  lastHardDriftNotificationAtMs: number | null;
  praiseMemory?: PraisePolicyMemory;
  previousRuntimeState: RuntimeState;
};

export const createInitialPhase5Memory = (
  initialPreviousState: RuntimeState = "uncertain",
  nowMs: number = Date.now(),
): Phase5OrchestratorMemory => ({
  ambiguityMemory: createInitialAmbiguityPolicyMemory(nowMs),
  lastHardDriftNotificationAtMs: null,
  praiseMemory: createInitialPraisePolicyMemory(),
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
  /** Ambiguity HUD + sustained praise (Phase 7). Omitted pieces default to safe in-memory state. */
  phase7?: {
    ambiguityCooldownActive: boolean;
    currentWindow: AggregatedContextWindow | null;
    isLockedBoundary: boolean;
    relatedEpisodeId: string | null;
    slowTickDurationMs: number;
    tasksForHud: { taskId: string; title: string }[];
  };
};

export type Phase5SlowTickResult = {
  clarificationHud: ClarificationHudModel | null;
  decision: InterventionDecision;
  episodeIds: string[];
  memory: Phase5OrchestratorMemory;
  pendingClarification: PendingClarificationRecord | null;
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
  phase7,
}: RunPhase5SlowTickParams): Phase5SlowTickResult => {
  const episodeRepo = new EpisodeRepo(database);
  const progressRepo = new ProgressRepo(database);
  const interventionRepo = new InterventionRepo(database);
  const pendingClarificationRepo = new PendingClarificationRepo(database);
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
        morningFlowLastTriggeredAt: null,
        morningFlowLastTriggeredLocalDate: null,
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

  let ambiguityMemory =
    memory.ambiguityMemory ?? createInitialAmbiguityPolicyMemory(nowMs);
  let praiseMemory = memory.praiseMemory ?? createInitialPraisePolicyMemory();

  praiseMemory = nextPraisePolicyMemory({
    classificationRuntimeState,
    nowMs,
    previous: praiseMemory,
  });

  const alignedStreakMs = alignedStreakDurationMs({ nowMs, praiseMemory });
  const focusBlockKey = pickPraiseFocusBlockKey({
    focusBlocks,
    nowMs,
    planId,
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
    praiseInput: {
      alignedStreakMs,
      currentFocusBlockKey: focusBlockKey,
      lastPraiseEmittedForFocusBlockKey:
        praiseMemory.lastPraiseEmittedForFocusBlockKey,
    },
    previousRuntimeState: memory.previousRuntimeState,
    riskPromptDetail:
      highRiskDraft === undefined
        ? null
        : `High risk on a task: ${highRiskDraft.latestStatusText}`,
    sourceClassificationId: classificationId,
    taskTitle,
  });

  if (decision.intervention?.kind === "praise") {
    praiseMemory = {
      ...praiseMemory,
      lastPraiseEmittedForFocusBlockKey: focusBlockKey,
    };
  }

  if (decision.intervention !== null) {
    interventionRepo.create(decision.intervention);
  }

  let clarificationHud: ClarificationHudModel | null = null;
  let pendingClarification: PendingClarificationRecord | null = null;

  if (phase7 !== undefined && phase7.currentWindow !== null) {
    const ambiguityTick = tickAmbiguityPolicy({
      input: {
        ambiguityCooldownActive: phase7.ambiguityCooldownActive,
        classificationRuntimeState,
        isLockedBoundary: phase7.isLockedBoundary,
        mode,
        nowMs,
        paused,
        tickDurationMs: phase7.slowTickDurationMs,
        window: phase7.currentWindow,
      },
      memory: ambiguityMemory,
    });

    ambiguityMemory = ambiguityTick.memory;

    const fingerprint = fingerprintForContextWindow(phase7.currentWindow);
    const pendingExisting = pendingClarificationRepo.listPendingForPlan(planId);

    if (
      ambiguityTick.eligibleForHud &&
      pendingExisting.length === 0 &&
      phase7.tasksForHud.length > 0
    ) {
      const hud = buildClarificationHud({
        nowIso,
        relatedEpisodeId: phase7.relatedEpisodeId,
        subtitle: null,
        tasks: phase7.tasksForHud,
      });
      const evidence = evidenceSnapshotFromWindow(phase7.currentWindow);

      pendingClarification = {
        clarificationId: hud.clarification_id,
        createdAt: nowIso,
        evidenceJson: JSON.stringify(evidence),
        expiresAt: null,
        hudJson: JSON.stringify(hud),
        planId,
        status: "pending",
      };

      pendingClarificationRepo.create(pendingClarification);
      clarificationHud = hud;
      ambiguityMemory = markHudShownForFingerprint(ambiguityMemory, fingerprint);
    }
  }

  const nextMemory: Phase5OrchestratorMemory = {
    ambiguityMemory,
    lastHardDriftNotificationAtMs: decision.lastHardDriftNotificationAtMs,
    praiseMemory,
    previousRuntimeState: classificationRuntimeState,
  };

  return {
    clarificationHud,
    decision,
    episodeIds: newEpisodes.map((episode) => episode.episodeId),
    memory: nextMemory,
    pendingClarification,
    progressEstimateIds,
  };
};
