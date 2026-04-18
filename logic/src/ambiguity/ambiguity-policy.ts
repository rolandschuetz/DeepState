import type { Mode, RuntimeState } from "@ineedabossagent/shared-contracts";

import type { AggregatedContextWindow } from "../context/context-aggregator.js";
import { shouldSurfaceAmbiguityPrompt } from "../runtime/runtime-guards.js";

/** ~30s: do not prompt immediately after context change (US-4.1). */
export const NEW_CONTEXT_GUARD_MS = 30_000;

/** ~40s sustained uncertain state before HUD (architecture: 30–45s). */
export const STABLE_UNCERTAIN_DWELL_MS = 40_000;

/** Two slow ticks (90s) in uncertain counts as stable ambiguity. */
export const AMBIGUOUS_CYCLE_THRESHOLD = 2;

export type AmbiguityPolicyMemory = {
  ambiguousCycleCount: number;
  contextEnteredAtMs: number;
  hudShownForFingerprint: string | null;
  lastContextFingerprint: string | null;
  uncertainSinceMs: number | null;
};

export const createInitialAmbiguityPolicyMemory = (
  nowMs: number,
): AmbiguityPolicyMemory => ({
  ambiguousCycleCount: 0,
  contextEnteredAtMs: nowMs,
  hudShownForFingerprint: null,
  lastContextFingerprint: null,
  uncertainSinceMs: null,
});

export const fingerprintForContextWindow = (window: AggregatedContextWindow): string => {
  const parts = [
    window.summary.activeApps.slice(0, 2).join("|"),
    window.summary.windowTitles.slice(0, 2).join("|"),
    window.summary.urls.slice(0, 2).join("|"),
  ];

  return parts.join("::").slice(0, 512);
};

export type AmbiguityPolicyTickInput = {
  ambiguityCooldownActive: boolean;
  classificationRuntimeState: RuntimeState;
  isLockedBoundary: boolean;
  mode: Mode;
  nowMs: number;
  paused: boolean;
  tickDurationMs: number;
  window: AggregatedContextWindow | null;
};

export type AmbiguityPolicyTickResult = {
  eligibleForHud: boolean;
  memory: AmbiguityPolicyMemory;
  shouldIncrementAmbiguousCycle: boolean;
};

/**
 * Updates dwell / cycle counters for uncertain classification. Call once per slow tick.
 * HUD creation (and DB write) is separate; use `eligibleForHud` to gate.
 */
export const tickAmbiguityPolicy = ({
  input,
  memory,
}: {
  input: AmbiguityPolicyTickInput;
  memory: AmbiguityPolicyMemory;
}): AmbiguityPolicyTickResult => {
  const window = input.window;
  const fingerprint =
    window === null ? memory.lastContextFingerprint : fingerprintForContextWindow(window);

  let nextMemory: AmbiguityPolicyMemory = { ...memory };

  if (fingerprint !== nextMemory.lastContextFingerprint) {
    nextMemory = {
      ...nextMemory,
      ambiguousCycleCount: 0,
      contextEnteredAtMs: input.nowMs,
      hudShownForFingerprint: null,
      lastContextFingerprint: fingerprint,
      uncertainSinceMs: null,
    };
  }

  let shouldIncrementAmbiguousCycle = false;

  if (input.classificationRuntimeState === "uncertain") {
    if (nextMemory.uncertainSinceMs === null) {
      nextMemory = {
        ...nextMemory,
        uncertainSinceMs: input.nowMs,
      };
    }

    shouldIncrementAmbiguousCycle = true;
    nextMemory = {
      ...nextMemory,
      ambiguousCycleCount: nextMemory.ambiguousCycleCount + 1,
    };
  } else {
    nextMemory = {
      ...nextMemory,
      ambiguousCycleCount: 0,
      uncertainSinceMs: null,
    };
  }

  const uncertainSince = nextMemory.uncertainSinceMs;
  const dwellMs =
    uncertainSince === null ? 0 : Math.max(0, input.nowMs - uncertainSince);
  const pastNewContextGuard = input.nowMs - nextMemory.contextEnteredAtMs >= NEW_CONTEXT_GUARD_MS;
  const dwellEligible = dwellMs >= STABLE_UNCERTAIN_DWELL_MS;
  const cycleEligible = nextMemory.ambiguousCycleCount >= AMBIGUOUS_CYCLE_THRESHOLD;

  const stableAmbiguity =
    input.classificationRuntimeState === "uncertain" && (dwellEligible || cycleEligible);

  const surfaceAllowed = shouldSurfaceAmbiguityPrompt({
    cooldownActive: input.ambiguityCooldownActive,
    isLockedBoundary: input.isLockedBoundary,
    mode: input.mode,
    paused: input.paused,
  });

  const eligibleForHud =
    stableAmbiguity &&
    pastNewContextGuard &&
    surfaceAllowed &&
    fingerprint !== null &&
    fingerprint.length > 0 &&
    (nextMemory.hudShownForFingerprint === null ||
      nextMemory.hudShownForFingerprint !== fingerprint);

  return {
    eligibleForHud,
    memory: nextMemory,
    shouldIncrementAmbiguousCycle,
  };
};

export const markHudShownForFingerprint = (
  memory: AmbiguityPolicyMemory,
  fingerprint: string | null,
): AmbiguityPolicyMemory => ({
  ...memory,
  hudShownForFingerprint: fingerprint,
});
