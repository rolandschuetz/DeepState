import { describe, expect, it } from "vitest";

import {
  applyPauseToSystemState,
  createContextAggregator,
  createDefaultSystemState,
  decideInterventionGate,
  decideLocalAiFallback,
  retrieveRelevantDurableRules,
  shouldSurfaceAmbiguityPrompt,
  type DeterministicClassification,
  type DurableRuleRecord,
  type NormalizedScreenpipeEvidence,
} from "../src/index.js";

const createEvidence = (
  overrides: Partial<NormalizedScreenpipeEvidence> = {},
): NormalizedScreenpipeEvidence => ({
  accessibilityText: null,
  activitySummary: {
    dominantSignal: "typing",
    isActive: true,
    totalInteractions: 8,
  },
  appIdentifier: "cursor",
  appName: "Cursor",
  interactionSummary: {
    appSwitches: 0,
    clickCount: 1,
    scrollEvents: 1,
    typingSeconds: 6,
  },
  keywords: ["checkout", "design"],
  meetingHints: {
    collaboratorHints: [],
    hasAudioTranscript: false,
    isLikelyMeeting: false,
    reasons: [],
  },
  observedAt: "2026-04-18T09:00:00.000Z",
  ocrText: null,
  screenpipeRefs: {
    elementIds: [1],
    frameIds: [10],
    recordIds: ["record_1"],
  },
  source: "screenpipe_search",
  uiText: ["checkout design"],
  url: null,
  urlSummary: {
    host: null,
    normalizedUrl: null,
    pathTokens: [],
  },
  windowTitle: "checkout.ts - INeedABossAgent",
  ...overrides,
});

const createClassification = (
  overrides: Partial<DeterministicClassification> = {},
): DeterministicClassification => ({
  confidenceRatio: 0.41,
  explainability: [],
  isSupport: false,
  lastGoodContext: null,
  matchedGoalId: null,
  matchedTaskId: null,
  runtimeState: "uncertain",
  ...overrides,
});

describe("runtime guards", () => {
  it("retrieves durable rules relevant to the current window", () => {
    const window = createContextAggregator().aggregate([createEvidence()])[0];
    const rules: DurableRuleRecord[] = [
      {
        confidence: 0.8,
        createdAt: "2026-04-17T20:00:00Z",
        lastValidatedAt: "2026-04-17T20:00:00Z",
        recency: 0.7,
        ruleId: "rule_1",
        ruleText: "Checkout design work in Cursor counts toward the redesign task.",
        source: "user_confirmed",
      },
      {
        confidence: 0.4,
        createdAt: "2026-04-17T20:00:00Z",
        lastValidatedAt: null,
        recency: 0.2,
        ruleId: "rule_2",
        ruleText: "Banking sites are excluded.",
        source: "user_confirmed",
      },
    ];

    expect(retrieveRelevantDurableRules({ durableRules: rules, window: window! })).toEqual([
      rules[0],
    ]);
  });

  it("allows local AI fallback only when rules, retrieval, and mode gates still leave ambiguity", () => {
    const window = createContextAggregator().aggregate([createEvidence()])[0]!;

    expect(
      decideLocalAiFallback({
        classification: createClassification(),
        cooldownActive: false,
        durableRules: [],
        mode: "running",
        paused: false,
        window,
      }),
    ).toMatchObject({
      allow: true,
      reason: "allowed",
    });

    expect(
      decideLocalAiFallback({
        classification: createClassification(),
        cooldownActive: false,
        durableRules: [
          {
            confidence: 0.9,
            createdAt: "2026-04-17T20:00:00Z",
            lastValidatedAt: "2026-04-17T20:00:00Z",
            recency: 1,
            ruleId: "rule_1",
            ruleText: "Checkout design work counts.",
            source: "user_confirmed",
          },
        ],
        mode: "running",
        paused: false,
        window,
      }).reason,
    ).toBe("durable_rule_resolved");
  });

  it("suppresses ambiguity prompts in pause, cooldown, or noisy lock-boundary states", () => {
    expect(
      shouldSurfaceAmbiguityPrompt({
        cooldownActive: false,
        isLockedBoundary: false,
        mode: "running",
        paused: false,
      }),
    ).toBe(true);
    expect(
      shouldSurfaceAmbiguityPrompt({
        cooldownActive: true,
        isLockedBoundary: false,
        mode: "running",
        paused: false,
      }),
    ).toBe(false);
    expect(
      shouldSurfaceAmbiguityPrompt({
        cooldownActive: false,
        isLockedBoundary: true,
        mode: "running",
        paused: false,
      }),
    ).toBe(false);
  });

  it("gates interventions on pause, cooldown, permissions, and pending better prompts", () => {
    expect(
      decideInterventionGate({
        betterInterventionPending: false,
        cooldownActive: false,
        mode: "running",
        notificationPermissionGranted: true,
        paused: false,
      }),
    ).toEqual({ allow: true, reason: "allowed" });

    expect(
      decideInterventionGate({
        betterInterventionPending: false,
        cooldownActive: false,
        mode: "paused",
        notificationPermissionGranted: true,
        paused: true,
      }).reason,
    ).toBe("mode_gate");

    expect(
      decideInterventionGate({
        betterInterventionPending: true,
        cooldownActive: false,
        mode: "running",
        notificationPermissionGranted: true,
        paused: false,
      }).reason,
    ).toBe("better_intervention_pending");
  });

  it("applies pause commands directly into the stream state", () => {
    const paused = applyPauseToSystemState({
      causedByCommandId: "c7942526-57a3-4ccb-a4da-2480b496759c",
      currentState: createDefaultSystemState(),
      pauseUntil: "2026-04-18T10:00:00Z",
    });

    expect(paused.mode).toBe("paused");
    expect(paused.menu_bar.runtime_state).toBe("paused");
    expect(paused.menu_bar.pause_until).toBe("2026-04-18T10:00:00Z");
    expect(paused.dashboard.current_focus.runtime_state).toBe("paused");
  });
});
