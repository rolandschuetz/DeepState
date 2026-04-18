import { randomUUID } from "node:crypto";

import type { RuntimeState } from "@ineedabossagent/shared-contracts";

import type { EpisodeRecord } from "../repos/sqlite-repositories.js";

/** One classified 60–90s context window ready to roll into episodes. */
export type ClassifiedWindowInput = {
  confidenceRatio: number | null;
  contextWindowId: string;
  dwellDurationSeconds: number;
  endedAt: string;
  isSupport: boolean;
  matchedGoalId: string | null;
  matchedTaskId: string | null;
  /** Optional: used for focus-block context-switch risk (sum per episode). */
  appSwitches?: number;
  runtimeState: RuntimeState;
  startedAt: string;
  topEvidence: string[];
};

export type EpisodeBuilderOptions = {
  /** Max gap between windows to stay in the same episode (default 120s). */
  maxGapSeconds?: number;
  /** Target minimum episode length (default 180s). */
  minEpisodeSeconds?: number;
  /** Hard cap on episode length (default 300s). */
  maxEpisodeSeconds?: number;
};

const DEFAULT_MAX_GAP_SECONDS = 120;
const DEFAULT_MIN_EPISODE_SECONDS = 180;
const DEFAULT_MAX_EPISODE_SECONDS = 300;

const groupKey = (window: ClassifiedWindowInput): string =>
  [
    window.runtimeState,
    window.matchedTaskId ?? "",
    window.matchedGoalId ?? "",
    window.isSupport ? "1" : "0",
  ].join("|");

const windowDurationSeconds = (window: ClassifiedWindowInput): number => {
  if (window.dwellDurationSeconds > 0) {
    return window.dwellDurationSeconds;
  }

  const delta =
    (Date.parse(window.endedAt) - Date.parse(window.startedAt)) / 1_000;

  return Number.isFinite(delta) ? Math.max(0, Math.round(delta)) : 0;
};

const gapSeconds = (left: ClassifiedWindowInput, right: ClassifiedWindowInput): number => {
  const delta =
    (Date.parse(right.startedAt) - Date.parse(left.endedAt)) / 1_000;

  return Number.isFinite(delta) ? Math.max(0, delta) : 0;
};

const mergeEvidence = (windows: ClassifiedWindowInput[]): string[] => {
  const merged = new Set<string>();

  for (const window of windows) {
    for (const line of window.topEvidence) {
      if (line.trim().length > 0) {
        merged.add(line);
      }
    }
  }

  return [...merged].slice(0, 8);
};

const averageConfidence = (windows: ClassifiedWindowInput[]): number | null => {
  const values = windows
    .map((window) => window.confidenceRatio)
    .filter((value): value is number => value !== null && Number.isFinite(value));

  if (values.length === 0) {
    return null;
  }

  return (
    Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 100) /
    100
  );
};

const sumSwitches = (windows: ClassifiedWindowInput[]): number =>
  windows.reduce((total, window) => total + (window.appSwitches ?? 0), 0);

const bufferDuration = (buffer: ClassifiedWindowInput[]): number =>
  buffer.reduce((total, entry) => total + windowDurationSeconds(entry), 0);

const buildEpisodeRecord = (buffer: ClassifiedWindowInput[]): EpisodeRecord => {
  const first = buffer[0] as ClassifiedWindowInput;
  const last = buffer.at(-1) as ClassifiedWindowInput;
  const switches = sumSwitches(buffer);
  const evidence = mergeEvidence(buffer);

  if (switches > 0) {
    evidence.push(`Context switches in window: ${switches}`);
  }

  return {
    confidenceRatio: averageConfidence(buffer),
    contextWindowIds: buffer.map((window) => window.contextWindowId),
    endedAt: last.endedAt,
    episodeId: randomUUID(),
    isSupportWork: first.isSupport,
    matchedTaskId: first.matchedTaskId,
    runtimeState: first.runtimeState,
    startedAt: first.startedAt,
    topEvidence: evidence.length > 0 ? evidence : ["No condensed evidence captured."],
  };
};

/**
 * Rolls 60–90s classified windows into ~3–5 minute episodes for goal progress.
 */
export const buildEpisodesFromClassifiedWindows = (
  windows: ClassifiedWindowInput[],
  options: EpisodeBuilderOptions = {},
): EpisodeRecord[] => {
  const maxGapSeconds = options.maxGapSeconds ?? DEFAULT_MAX_GAP_SECONDS;
  const minEpisodeSeconds = options.minEpisodeSeconds ?? DEFAULT_MIN_EPISODE_SECONDS;
  const maxEpisodeSeconds = options.maxEpisodeSeconds ?? DEFAULT_MAX_EPISODE_SECONDS;

  const sorted = [...windows].sort((left, right) =>
    left.startedAt.localeCompare(right.startedAt),
  );

  const episodes: EpisodeRecord[] = [];
  let buffer: ClassifiedWindowInput[] = [];

  const flush = (forceShort: boolean): void => {
    if (buffer.length === 0) {
      return;
    }

    const duration = bufferDuration(buffer);

    if (duration >= minEpisodeSeconds || forceShort) {
      episodes.push(buildEpisodeRecord(buffer));
    }

    buffer = [];
  };

  for (const window of sorted) {
    if (buffer.length === 0) {
      buffer = [window];
      continue;
    }

    const last = buffer.at(-1) as ClassifiedWindowInput;
    const sameGroup = groupKey(last) === groupKey(window);
    const gapOk = gapSeconds(last, window) <= maxGapSeconds;
    const nextDuration = bufferDuration(buffer) + windowDurationSeconds(window);

    if (sameGroup && gapOk && nextDuration <= maxEpisodeSeconds) {
      buffer.push(window);

      if (nextDuration >= maxEpisodeSeconds) {
        flush(false);
      }

      continue;
    }

    const shortBuffer = bufferDuration(buffer) < minEpisodeSeconds;
    flush(shortBuffer);
    buffer = [window];
  }

  flush(true);

  return episodes;
};
