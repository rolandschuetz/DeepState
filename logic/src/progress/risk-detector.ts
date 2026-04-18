import type { ProgressKind, RiskLevel } from "@ineedabossagent/shared-contracts";

import type { EpisodeRecord, FocusBlockRecord, TaskContractRecord } from "../repos/sqlite-repositories.js";

export type TaskEpisodeRollup = {
  alignedSeconds: number;
  driftSeconds: number;
  supportSeconds: number;
  uncertainEpisodesForTask: number;
  /** Sum of app-switch hints aggregated into episodes for this task. */
  contextSwitchScore: number;
};

const parseSwitchScore = (topEvidence: string[]): number => {
  let total = 0;

  for (const line of topEvidence) {
    if (line.includes("Context switches in window:")) {
      const match = /(\d+)\s*$/.exec(line);

      if (match !== null) {
        total += Number.parseInt(match[1] ?? "0", 10);
      }
    }

    if (line.toLowerCase().includes("context_switch")) {
      total += 1;
    }
  }

  return total;
};

export const rollupEpisodesByTask = (
  episodes: EpisodeRecord[],
): Map<string | null, TaskEpisodeRollup> => {
  const map = new Map<string | null, TaskEpisodeRollup>();

  const ensure = (taskId: string | null): TaskEpisodeRollup => {
    const existing = map.get(taskId);

    if (existing !== undefined) {
      return existing;
    }

    const created: TaskEpisodeRollup = {
      alignedSeconds: 0,
      contextSwitchScore: 0,
      driftSeconds: 0,
      uncertainEpisodesForTask: 0,
      supportSeconds: 0,
    };

    map.set(taskId, created);

    return created;
  };

  for (const episode of episodes) {
    const taskId = episode.matchedTaskId;
    const rollup = ensure(taskId);
    const durationSeconds = Math.max(
      0,
      Math.round(
        (Date.parse(episode.endedAt) - Date.parse(episode.startedAt)) / 1_000,
      ),
    );
    const switches = parseSwitchScore(episode.topEvidence);

    rollup.contextSwitchScore += switches;

    if (episode.runtimeState === "aligned") {
      if (episode.isSupportWork) {
        rollup.supportSeconds += durationSeconds;
      } else {
        rollup.alignedSeconds += durationSeconds;
      }
    } else if (episode.runtimeState === "uncertain") {
      rollup.driftSeconds += durationSeconds;
      rollup.uncertainEpisodesForTask += 1;
    } else if (
      episode.runtimeState === "soft_drift" ||
      episode.runtimeState === "hard_drift"
    ) {
      rollup.driftSeconds += durationSeconds;
    }
  }

  return map;
};

const isWithinFocusBlock = (
  focusBlocks: FocusBlockRecord[],
  nowMs: number,
  taskId: string,
): FocusBlockRecord | null => {
  for (const block of focusBlocks) {
    if (block.taskId !== taskId) {
      continue;
    }

    const start = Date.parse(block.startsAt);
    const end = Date.parse(block.endsAt);

    if (Number.isFinite(start) && Number.isFinite(end) && nowMs >= start && nowMs <= end) {
      return block;
    }
  }

  return null;
};

export type RiskSignals = {
  behindPace: boolean;
  excessiveSupport: boolean;
  heavyContextSwitchInFocusBlock: boolean;
  repeatedAmbiguity: boolean;
};

export const evaluateRiskSignals = ({
  dayElapsedFraction,
  focusBlocks,
  nowMs,
  rollup,
  task,
}: {
  dayElapsedFraction: number;
  focusBlocks: FocusBlockRecord[];
  nowMs: number;
  rollup: TaskEpisodeRollup;
  task: TaskContractRecord;
}): RiskSignals => {
  const intended = task.intendedWorkSecondsToday;

  const expectedAligned = intended * Math.min(1, Math.max(0, dayElapsedFraction));
  const behindPace =
    expectedAligned > 120 &&
    rollup.alignedSeconds < expectedAligned * 0.45 &&
    rollup.alignedSeconds + rollup.supportSeconds < expectedAligned * 0.55;

  const excessiveSupport =
    rollup.alignedSeconds > 120 &&
    rollup.supportSeconds > rollup.alignedSeconds * 2;

  const repeatedAmbiguity = rollup.uncertainEpisodesForTask >= 3;

  const focusBlock = isWithinFocusBlock(focusBlocks, nowMs, task.taskId);
  const heavyContextSwitchInFocusBlock =
    focusBlock !== null && rollup.contextSwitchScore >= 4;

  return {
    behindPace,
    excessiveSupport,
    heavyContextSwitchInFocusBlock,
    repeatedAmbiguity,
  };
};

export const riskLevelFromSignals = (signals: RiskSignals): RiskLevel => {
  const score =
    (signals.behindPace ? 2 : 0) +
    (signals.repeatedAmbiguity ? 1 : 0) +
    (signals.excessiveSupport ? 1 : 0) +
    (signals.heavyContextSwitchInFocusBlock ? 2 : 0);

  if (score >= 3) {
    return "high";
  }

  if (score >= 1) {
    return "medium";
  }

  return "low";
};

export const buildLatestStatusText = ({
  progressKind,
  progressRatio,
  riskLevel,
  taskTitle,
}: {
  progressKind: ProgressKind;
  progressRatio: number | null;
  riskLevel: RiskLevel;
  taskTitle: string;
}): string => {
  const ratioLabel =
    progressRatio === null ? "n/a" : `${Math.round(progressRatio * 100)}%`;

  if (riskLevel === "high") {
    return `High risk on "${taskTitle}" — progress ${ratioLabel} with multiple warning signals.`;
  }

  if (riskLevel === "medium") {
    return `Watch "${taskTitle}" — progress ${ratioLabel} (${progressKind.replaceAll("_", " ")}).`;
  }

  return `Steady progress on "${taskTitle}" (${ratioLabel}).`;
};
