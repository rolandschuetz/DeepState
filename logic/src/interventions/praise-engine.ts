import type { RuntimeState } from "@ineedabossagent/shared-contracts";

import type { FocusBlockRecord } from "../repos/sqlite-repositories.js";

/** Earned praise after sustained aligned work (architecture: 25–30m). */
export const PRAISE_MIN_ALIGNED_MS = 25 * 60 * 1_000;

export type PraisePolicyMemory = {
  alignedStreakStartMs: number | null;
  lastPraiseEmittedForFocusBlockKey: string | null;
};

export const createInitialPraisePolicyMemory = (): PraisePolicyMemory => ({
  alignedStreakStartMs: null,
  lastPraiseEmittedForFocusBlockKey: null,
});

/**
 * One praise per focus block when inside a block; otherwise one per plan slice for the session.
 */
export const pickPraiseFocusBlockKey = ({
  focusBlocks,
  nowMs,
  planId,
}: {
  focusBlocks: FocusBlockRecord[];
  nowMs: number;
  planId: string;
}): string => {
  const iso = new Date(nowMs).toISOString();

  for (const block of focusBlocks) {
    if (iso >= block.startsAt && iso <= block.endsAt) {
      return `fb:${block.focusBlockId}`;
    }
  }

  return `plan:${planId}`;
};

export const nextPraisePolicyMemory = ({
  classificationRuntimeState,
  nowMs,
  previous,
}: {
  classificationRuntimeState: RuntimeState;
  nowMs: number;
  previous: PraisePolicyMemory;
}): PraisePolicyMemory => {
  if (classificationRuntimeState === "aligned") {
    if (previous.alignedStreakStartMs === null) {
      return {
        ...previous,
        alignedStreakStartMs: nowMs,
      };
    }

    return previous;
  }

  return {
    ...previous,
    alignedStreakStartMs: null,
  };
};

export const alignedStreakDurationMs = ({
  nowMs,
  praiseMemory,
}: {
  nowMs: number;
  praiseMemory: PraisePolicyMemory;
}): number =>
  praiseMemory.alignedStreakStartMs === null
    ? 0
    : Math.max(0, nowMs - praiseMemory.alignedStreakStartMs);
