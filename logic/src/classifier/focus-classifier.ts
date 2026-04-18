import type { RuntimeState } from "@ineedabossagent/shared-contracts";

import type { AggregatedContextWindow } from "../context/context-aggregator.js";

export type ClassificationExplainability = {
  code: string;
  detail: string;
  weight: number;
};

export type ClassifierTaskProfile = {
  allowedSupportWork: string[];
  goalId: string | null;
  likelyDetours: string[];
  successDefinition: string;
  taskId: string;
  title: string;
};

export type DeterministicClassification = {
  confidenceRatio: number;
  explainability: ClassificationExplainability[];
  isSupport: boolean;
  lastGoodContext: string | null;
  matchedGoalId: string | null;
  matchedTaskId: string | null;
  runtimeState: RuntimeState;
};

export type ClassificationTickResult = DeterministicClassification & {
  desiredState: RuntimeState;
};

export type HysteresisMemory = {
  driftStreak: number;
  lastGoodContext: string | null;
  previousRuntimeState: RuntimeState;
};

const clampRatio = (value: number): number => Math.max(0, Math.min(1, Number(value.toFixed(2))));

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);

const unique = <T>(values: T[]): T[] => [...new Set(values)];

const IMMEDIATE_DISTRACTION_CODE = "known_distraction_linkedin";

const isLinkedInDistraction = (
  window: AggregatedContextWindow,
  contextTokens: string[],
): boolean =>
  contextTokens.includes("linkedin") ||
  window.summary.urls.some((url) => /:\/\/(?:www\.)?linkedin\.com\b/i.test(url)) ||
  window.summary.windowTitles.some((title) => /\blinkedin\b/i.test(title)) ||
  window.summary.activeApps.some((app) => /\blinkedin\b/i.test(app));

const buildContextTokens = (window: AggregatedContextWindow): string[] =>
  unique([
    ...window.summary.activeApps.flatMap(tokenize),
    ...window.summary.windowTitles.flatMap(tokenize),
    ...window.summary.urls.flatMap(tokenize),
    ...window.summary.keywords.flatMap(tokenize),
    ...window.summary.uiText.flatMap(tokenize),
  ]);

const countMatches = (haystack: string[], needles: string[]): number =>
  unique(needles).filter((token) => haystack.includes(token)).length;

const buildRecoveryAnchor = (window: AggregatedContextWindow): string | null =>
  window.summary.windowTitles[0] ?? window.summary.urls[0] ?? window.summary.activeApps[0] ?? null;

const compareTask = (
  task: ClassifierTaskProfile,
  contextTokens: string[],
): {
  explainability: ClassificationExplainability[];
  isSupport: boolean;
  score: number;
} => {
  const taskTokens = unique([...tokenize(task.title), ...tokenize(task.successDefinition)]);
  const supportTokens = unique([
    ...task.allowedSupportWork.flatMap(tokenize),
    ...task.likelyDetours.flatMap(tokenize),
  ]);
  const taskMatchCount = countMatches(contextTokens, taskTokens);
  const supportMatchCount = countMatches(contextTokens, supportTokens);
  const explainability: ClassificationExplainability[] = [];
  let score = 0;

  if (taskMatchCount > 0) {
    const weight = Math.min(0.85, 0.45 + taskMatchCount * 0.14);
    score += weight;
    explainability.push({
      code: "task_token_match",
      detail: `Matched ${taskMatchCount} task tokens against the current window.`,
      weight,
    });
  }

  if (supportMatchCount > 0) {
    const weight = Math.min(0.65, 0.32 + supportMatchCount * 0.1);
    score += weight;
    explainability.push({
      code: "support_work_match",
      detail: `Matched ${supportMatchCount} support-work tokens for the task.`,
      weight,
    });
  }

  return {
    explainability,
    isSupport: taskMatchCount === 0 && supportMatchCount > 0,
    score: clampRatio(score),
  };
};

export const classifyContextWindow = ({
  previousLastGoodContext = null,
  tasks,
  window,
}: {
  previousLastGoodContext?: string | null;
  tasks: ClassifierTaskProfile[];
  window: AggregatedContextWindow;
}): ClassificationTickResult => {
  const contextTokens = buildContextTokens(window);
  const rankedTasks = tasks.map((task) => ({
    task,
    ...compareTask(task, contextTokens),
  }));
  const best = rankedTasks.sort((left, right) => right.score - left.score)[0] ?? null;
  const explainability: ClassificationExplainability[] = [];

  if (contextTokens.length === 0) {
    explainability.push({
      code: "no_context_tokens",
      detail: "The context window did not contain usable task signals.",
      weight: -0.4,
    });

    return {
      confidenceRatio: 0.15,
      desiredState: "uncertain",
      explainability,
      isSupport: false,
      lastGoodContext: previousLastGoodContext,
      matchedGoalId: null,
      matchedTaskId: null,
      runtimeState: "uncertain",
    };
  }

  if (best !== null) {
    explainability.push(...best.explainability);
  }

  if (window.summary.meetingContext.isLikelyMeeting && (best === null || best.score < 0.35)) {
    explainability.push({
      code: "meeting_contradiction",
      detail: "Meeting-like context weakens confidence that the current work matches a planned task.",
      weight: -0.25,
    });
  }

  if (window.summary.activitySummary.appSwitches >= 3) {
    explainability.push({
      code: "context_switch_penalty",
      detail: "Frequent app switching reduces confidence in a focused task match.",
      weight: -0.15,
    });
  }

  const weightedScore = clampRatio(
    (best?.score ?? 0) +
      explainability
        .filter((item) => item.weight < 0)
        .reduce((total, item) => total + item.weight, 0),
  );

  if (isLinkedInDistraction(window, contextTokens) && (best?.score ?? 0) < 0.3) {
    explainability.push({
      code: IMMEDIATE_DISTRACTION_CODE,
      detail: "LinkedIn was detected in the active context and treated as a distraction.",
      weight: -0.9,
    });

    return {
      confidenceRatio: clampRatio(Math.max(weightedScore, 0.9)),
      desiredState: "hard_drift",
      explainability,
      isSupport: false,
      lastGoodContext: previousLastGoodContext,
      matchedGoalId: null,
      matchedTaskId: null,
      runtimeState: "hard_drift",
    };
  }

  if (best !== null && weightedScore >= 0.5) {
    const recoveryAnchor = buildRecoveryAnchor(window) ?? previousLastGoodContext;

    return {
      confidenceRatio: weightedScore,
      desiredState: "aligned",
      explainability,
      isSupport: best.isSupport,
      lastGoodContext: recoveryAnchor,
      matchedGoalId: best.task.goalId,
      matchedTaskId: best.task.taskId,
      runtimeState: "aligned",
    };
  }

  if (best !== null && weightedScore >= 0.3) {
    return {
      confidenceRatio: weightedScore,
      desiredState: "soft_drift",
      explainability,
      isSupport: false,
      lastGoodContext: previousLastGoodContext,
      matchedGoalId: best.task.goalId,
      matchedTaskId: best.task.taskId,
      runtimeState: "soft_drift",
    };
  }

  explainability.push({
    code: "task_mismatch",
    detail: "The window did not produce enough evidence for any planned task.",
    weight: -0.5,
  });

  return {
    confidenceRatio: clampRatio(Math.max(weightedScore, 0.1)),
    desiredState: "hard_drift",
    explainability,
    isSupport: false,
    lastGoodContext: previousLastGoodContext,
    matchedGoalId: null,
    matchedTaskId: null,
    runtimeState: "hard_drift",
  };
};

export const applyClassificationHysteresis = ({
  classification,
  memory,
}: {
  classification: ClassificationTickResult;
  memory: HysteresisMemory;
}): { classification: DeterministicClassification; memory: HysteresisMemory } => {
  let nextState: RuntimeState = classification.desiredState;
  const nextMemory: HysteresisMemory = {
    driftStreak: memory.driftStreak,
    lastGoodContext: memory.lastGoodContext,
    previousRuntimeState: memory.previousRuntimeState,
  };

  if (classification.desiredState === "aligned") {
    nextState = "aligned";
    nextMemory.driftStreak = 0;
    nextMemory.lastGoodContext = classification.lastGoodContext;
  } else if (classification.desiredState === "soft_drift") {
    nextMemory.driftStreak += 1;
    nextState = nextMemory.driftStreak >= 2 ? "soft_drift" : memory.previousRuntimeState;
  } else if (classification.desiredState === "hard_drift") {
    const isImmediateDistraction = classification.explainability.some(
      (item) => item.code === IMMEDIATE_DISTRACTION_CODE,
    );

    if (isImmediateDistraction) {
      nextMemory.driftStreak = 3;
      nextState = "hard_drift";
    } else {
      nextMemory.driftStreak += 1;
      nextState =
        nextMemory.driftStreak >= 3
          ? "hard_drift"
          : nextMemory.driftStreak >= 2
            ? "soft_drift"
            : memory.previousRuntimeState;
    }
  } else {
    nextState = "uncertain";
  }

  nextMemory.previousRuntimeState = nextState;

  return {
    classification: {
      confidenceRatio: classification.confidenceRatio,
      explainability: classification.explainability,
      isSupport: nextState === "aligned" ? classification.isSupport : false,
      lastGoodContext:
        nextState === "aligned"
          ? classification.lastGoodContext
          : nextMemory.lastGoodContext,
      matchedGoalId:
        nextState === "hard_drift" || nextState === "uncertain"
          ? null
          : classification.matchedGoalId,
      matchedTaskId:
        nextState === "hard_drift" || nextState === "uncertain"
          ? null
          : classification.matchedTaskId,
      runtimeState: nextState,
    },
    memory: nextMemory,
  };
};
