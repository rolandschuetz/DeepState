import { describe, expect, it } from "vitest";

import {
  applyClassificationHysteresis,
  classifyContextWindow,
  createContextAggregator,
  type AggregatedContextWindow,
  type ClassifierTaskProfile,
  type HysteresisMemory,
  type NormalizedScreenpipeEvidence,
} from "../src/index.js";

const createEvidence = (
  overrides: Partial<NormalizedScreenpipeEvidence> = {},
): NormalizedScreenpipeEvidence => ({
  accessibilityText: null,
  activitySummary: {
    dominantSignal: "typing",
    isActive: true,
    totalInteractions: 12,
  },
  appIdentifier: "cursor",
  appName: "Cursor",
  interactionSummary: {
    appSwitches: 0,
    clickCount: 1,
    scrollEvents: 1,
    typingSeconds: 10,
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
  uiText: ["checkout form"],
  url: "https://github.com/openai/repo/pull/1",
  urlSummary: {
    host: "github.com",
    normalizedUrl: "https://github.com/openai/repo/pull/1",
    pathTokens: ["openai", "repo", "pull", "1"],
  },
  windowTitle: "checkout.ts - INeedABossAgent",
  ...overrides,
});

const TASKS: ClassifierTaskProfile[] = [
  {
    allowedSupportWork: ["Stripe docs research"],
    goalId: "goal_1",
    likelyDetours: ["stakeholder review"],
    successDefinition: "Ready for implementation handoff",
    taskId: "task_1",
    title: "Finish checkout redesign",
  },
];

const getSingleWindow = (records: NormalizedScreenpipeEvidence[]): AggregatedContextWindow => {
  const window = createContextAggregator().aggregate(records)[0];

  if (window === undefined) {
    throw new Error("Expected one aggregated context window.");
  }

  return window;
};

describe("focus classifier", () => {
  it("classifies strongly matching evidence as aligned and stores a recovery anchor", () => {
    const window = getSingleWindow([
      createEvidence(),
      createEvidence({
        observedAt: "2026-04-18T09:00:30.000Z",
        uiText: ["error state", "checkout design"],
      }),
    ]);

    const classification = classifyContextWindow({
      tasks: TASKS,
      window,
    });

    expect(classification.runtimeState).toBe("aligned");
    expect(classification.matchedTaskId).toBe("task_1");
    expect(classification.lastGoodContext).toBe("checkout.ts - INeedABossAgent");
    expect(classification.explainability[0]?.code).toBe("task_token_match");
  });

  it("treats support-work signals as aligned support work", () => {
    const window = getSingleWindow([
      createEvidence({
        keywords: ["stripe", "docs", "research"],
        uiText: ["Stripe docs research"],
        windowTitle: "Stripe Docs - Payments",
      }),
    ]);

    const classification = classifyContextWindow({
      tasks: TASKS,
      window,
    });

    expect(classification.runtimeState).toBe("aligned");
    expect(classification.isSupport).toBe(true);
  });

  it("penalizes meeting-like mismatches into drift", () => {
    const window = getSingleWindow([
      createEvidence({
        appIdentifier: "slack",
        appName: "Slack",
        interactionSummary: {
          appSwitches: 4,
          clickCount: 1,
          scrollEvents: 0,
          typingSeconds: 1,
        },
        keywords: ["standup"],
        meetingHints: {
          collaboratorHints: ["Alice"],
          hasAudioTranscript: true,
          isLikelyMeeting: true,
          reasons: ["meeting_keyword", "collaborator_hint", "audio_heavy_low_typing"],
        },
        uiText: ["daily standup"],
        url: null,
        urlSummary: {
          host: null,
          normalizedUrl: null,
          pathTokens: [],
        },
        windowTitle: "Slack Huddle - Product",
      }),
    ]);

    const classification = classifyContextWindow({
      previousLastGoodContext: "checkout.ts - INeedABossAgent",
      tasks: TASKS,
      window,
    });

    expect(classification.runtimeState).toBe("hard_drift");
    expect(classification.lastGoodContext).toBe("checkout.ts - INeedABossAgent");
    expect(classification.explainability.map((item) => item.code)).toContain(
      "meeting_contradiction",
    );
  });

  it("treats LinkedIn browsing as immediate hard drift when the task does not justify it", () => {
    const window = getSingleWindow([
      createEvidence({
        appIdentifier: "com.google.Chrome",
        appName: "Google Chrome",
        keywords: ["linkedin", "feed", "network"],
        uiText: ["LinkedIn", "Start a post"],
        url: "https://www.linkedin.com/feed/",
        urlSummary: {
          host: "www.linkedin.com",
          normalizedUrl: "https://www.linkedin.com/feed",
          pathTokens: ["feed"],
        },
        windowTitle: "LinkedIn",
      }),
    ]);

    const classification = classifyContextWindow({
      previousLastGoodContext: "checkout.ts - INeedABossAgent",
      tasks: TASKS,
      window,
    });

    expect(classification.runtimeState).toBe("hard_drift");
    expect(classification.explainability.map((item) => item.code)).toContain(
      "known_distraction_linkedin",
    );
    expect(classification.lastGoodContext).toBe("checkout.ts - INeedABossAgent");
  });

  it("applies hysteresis across replayed ticks for aligned to soft drift to recovery", () => {
    const alignedWindow = getSingleWindow([createEvidence()]);
    const driftWindowA = getSingleWindow([
      createEvidence({
        keywords: ["slack", "chat"],
        uiText: ["random chatter"],
        windowTitle: "Slack | Team",
      }),
    ]);
    const driftWindowB = getSingleWindow([
      createEvidence({
        keywords: ["calendar", "admin"],
        uiText: ["calendar cleanup"],
        windowTitle: "Calendar",
      }),
    ]);

    let memory: HysteresisMemory = {
      driftStreak: 0,
      lastGoodContext: null,
      previousRuntimeState: "uncertain",
    };

    const aligned = applyClassificationHysteresis({
      classification: classifyContextWindow({ tasks: TASKS, window: alignedWindow }),
      memory,
    });
    memory = aligned.memory;

    const firstDrift = applyClassificationHysteresis({
      classification: classifyContextWindow({
        previousLastGoodContext: memory.lastGoodContext,
        tasks: TASKS,
        window: driftWindowA,
      }),
      memory,
    });
    memory = firstDrift.memory;

    const secondDrift = applyClassificationHysteresis({
      classification: classifyContextWindow({
        previousLastGoodContext: memory.lastGoodContext,
        tasks: TASKS,
        window: driftWindowB,
      }),
      memory,
    });
    memory = secondDrift.memory;

    const recovery = applyClassificationHysteresis({
      classification: classifyContextWindow({
        previousLastGoodContext: memory.lastGoodContext,
        tasks: TASKS,
        window: alignedWindow,
      }),
      memory,
    });

    expect(aligned.classification.runtimeState).toBe("aligned");
    expect(firstDrift.classification.runtimeState).toBe("aligned");
    expect(secondDrift.classification.runtimeState).toBe("soft_drift");
    expect(recovery.classification.runtimeState).toBe("aligned");
    expect(recovery.classification.lastGoodContext).toBe("checkout.ts - INeedABossAgent");
  });

  it("bypasses drift hysteresis for an explicit LinkedIn distraction", () => {
    const alignedWindow = getSingleWindow([createEvidence()]);
    const linkedInWindow = getSingleWindow([
      createEvidence({
        appIdentifier: "com.google.Chrome",
        appName: "Google Chrome",
        keywords: ["linkedin", "feed"],
        uiText: ["LinkedIn", "Home"],
        url: "https://www.linkedin.com/feed/",
        urlSummary: {
          host: "www.linkedin.com",
          normalizedUrl: "https://www.linkedin.com/feed",
          pathTokens: ["feed"],
        },
        windowTitle: "LinkedIn",
      }),
    ]);

    let memory: HysteresisMemory = {
      driftStreak: 0,
      lastGoodContext: null,
      previousRuntimeState: "uncertain",
    };

    const aligned = applyClassificationHysteresis({
      classification: classifyContextWindow({ tasks: TASKS, window: alignedWindow }),
      memory,
    });
    memory = aligned.memory;

    const distraction = applyClassificationHysteresis({
      classification: classifyContextWindow({
        previousLastGoodContext: memory.lastGoodContext,
        tasks: TASKS,
        window: linkedInWindow,
      }),
      memory,
    });

    expect(aligned.classification.runtimeState).toBe("aligned");
    expect(distraction.classification.runtimeState).toBe("hard_drift");
    expect(distraction.memory.driftStreak).toBe(3);
  });
});
