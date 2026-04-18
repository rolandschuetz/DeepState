import { randomUUID } from "node:crypto";

import type { RiskLevel } from "@ineedabossagent/shared-contracts";

import type {
  EpisodeRecord,
  FocusBlockRecord,
  TaskContractRecord,
} from "../repos/sqlite-repositories.js";

import {
  buildLatestStatusText,
  evaluateRiskSignals,
  riskLevelFromSignals,
  rollupEpisodesByTask,
  type TaskEpisodeRollup,
} from "./risk-detector.js";

export type ProgressEstimateDraft = {
  alignedSeconds: number;
  confidenceRatio: number | null;
  driftSeconds: number;
  estimatedAt: string;
  etaRemainingSeconds: number | null;
  latestStatusText: string;
  planId: string;
  progressEstimateId: string;
  progressRatio: number | null;
  riskLevel: RiskLevel | null;
  supportSeconds: number;
  taskId: string | null;
};

const ARTIFACT_HINTS = [
  "commit",
  "merge",
  "ship",
  "deploy",
  "release",
  "pr ",
  "pull request",
  "changelog",
];

export type MilestoneCandidateEstimate = {
  confidence: number;
  hint: string;
  taskId: string;
  taskTitle: string;
};

const milestoneArtifactScore = (episodes: EpisodeRecord[], taskId: string): number => {
  let score = 0;

  for (const episode of episodes) {
    if (episode.matchedTaskId !== taskId) {
      continue;
    }

    const blob = episode.topEvidence.join(" ").toLowerCase();

    for (const hint of ARTIFACT_HINTS) {
      if (blob.includes(hint)) {
        score += 0.12;
      }
    }
  }

  return Math.min(0.45, score);
};

/**
 * Deterministic milestone hint for intervention `milestone_candidate` when evidence is strong.
 */
export const inferMilestoneCandidate = ({
  episodes,
  task,
}: {
  episodes: EpisodeRecord[];
  task: TaskContractRecord;
}): MilestoneCandidateEstimate | null => {
  const score = milestoneArtifactScore(episodes, task.taskId);

  if (score < 0.24) {
    return null;
  }

  return {
    confidence: Math.min(0.95, 0.75 + score),
    hint: "Artifact signals (commits/PR/shipping language) spiked in recent work.",
    taskId: task.taskId,
    taskTitle: task.title,
  };
};

const averageEpisodeConfidence = (
  episodes: EpisodeRecord[],
  taskId: string,
): number | null => {
  let weighted = 0;
  let weightTotal = 0;

  for (const episode of episodes) {
    if (episode.matchedTaskId !== taskId) {
      continue;
    }

    if (episode.confidenceRatio === null) {
      continue;
    }

    const duration = Math.max(
      0,
      (Date.parse(episode.endedAt) - Date.parse(episode.startedAt)) / 1_000,
    );

    weighted += episode.confidenceRatio * duration;
    weightTotal += duration;
  }

  if (weightTotal === 0) {
    return null;
  }

  return Math.round((weighted / weightTotal) * 100) / 100;
};

const progressRatioForTask = ({
  episodes,
  rollup,
  task,
}: {
  episodes: EpisodeRecord[];
  rollup: TaskEpisodeRollup;
  task: TaskContractRecord;
}): number | null => {
  const intended = task.intendedWorkSecondsToday;

  if (intended <= 0) {
    return null;
  }

  const timeRatio = Math.min(1, rollup.alignedSeconds / intended);

  if (task.progressKind === "time_based") {
    return Math.round(timeRatio * 100) / 100;
  }

  const artifactBonus = milestoneArtifactScore(episodes, task.taskId);

  if (task.progressKind === "milestone_based") {
    return Math.min(1, Math.round((timeRatio * 0.65 + artifactBonus) * 100) / 100);
  }

  if (task.progressKind === "artifact_based") {
    return Math.min(
      1,
      Math.round((artifactBonus * 0.85 + timeRatio * 0.25) * 100) / 100,
    );
  }

  // hybrid
  return Math.min(
    1,
    Math.round((timeRatio * 0.55 + artifactBonus * 0.55) * 100) / 100,
  );
};

const etaRemaining = ({
  progressKind,
  progressRatio,
  rollup,
  task,
}: {
  progressKind: TaskContractRecord["progressKind"];
  progressRatio: number | null;
  rollup: TaskEpisodeRollup;
  task: TaskContractRecord;
}): number | null => {
  if (progressKind === "time_based") {
    return Math.max(0, task.intendedWorkSecondsToday - rollup.alignedSeconds);
  }

  if (progressRatio === null) {
    return null;
  }

  if (progressKind === "milestone_based" || progressKind === "artifact_based") {
    return task.totalRemainingEffortSeconds !== null
      ? Math.max(0, Math.round(task.totalRemainingEffortSeconds * (1 - progressRatio)))
      : null;
  }

  return Math.max(0, task.intendedWorkSecondsToday - rollup.alignedSeconds);
};

/**
 * Produces one persisted snapshot per task for the plan, suitable for `ProgressRepo.create`.
 */
export const computeProgressEstimatesForPlan = ({
  episodes,
  estimatedAt,
  focusBlocks,
  localDayStartMs,
  nowMs,
  planId,
  tasks,
}: {
  episodes: EpisodeRecord[];
  estimatedAt: string;
  focusBlocks: FocusBlockRecord[];
  localDayStartMs: number;
  nowMs: number;
  planId: string;
  tasks: TaskContractRecord[];
}): ProgressEstimateDraft[] => {
  const rollups = rollupEpisodesByTask(episodes);
  const daySeconds = Math.max(1, (nowMs - localDayStartMs) / 1_000);
  const dayElapsedFraction = Math.min(1, daySeconds / (16 * 3_600));

  const drafts: ProgressEstimateDraft[] = [];

  for (const task of tasks) {
    if (task.planId !== planId) {
      continue;
    }

    const rollup = rollups.get(task.taskId) ?? {
      alignedSeconds: 0,
      contextSwitchScore: 0,
      driftSeconds: 0,
      uncertainEpisodesForTask: 0,
      supportSeconds: 0,
    };

    const progressRatio = progressRatioForTask({ episodes, rollup, task });
    const confidenceRatio = averageEpisodeConfidence(episodes, task.taskId);
    const signals = evaluateRiskSignals({
      dayElapsedFraction,
      focusBlocks,
      nowMs,
      rollup,
      task,
    });
    const riskLevel = riskLevelFromSignals(signals);

    drafts.push({
      alignedSeconds: rollup.alignedSeconds,
      confidenceRatio,
      driftSeconds: rollup.driftSeconds,
      estimatedAt,
      etaRemainingSeconds: etaRemaining({
        progressKind: task.progressKind,
        progressRatio,
        rollup,
        task,
      }),
      latestStatusText: buildLatestStatusText({
        progressKind: task.progressKind,
        progressRatio,
        riskLevel,
        taskTitle: task.title,
      }),
      planId,
      progressEstimateId: randomUUID(),
      progressRatio,
      riskLevel,
      supportSeconds: rollup.supportSeconds,
      taskId: task.taskId,
    });
  }

  return drafts;
};
