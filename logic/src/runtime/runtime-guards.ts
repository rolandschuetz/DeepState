import type { Mode, SystemState } from "@ineedabossagent/shared-contracts";

import type { DeterministicClassification } from "../classifier/focus-classifier.js";
import type { AggregatedContextWindow } from "../context/context-aggregator.js";
import type { DurableRuleRecord } from "../repos/sqlite-repositories.js";

export type LocalAiFallbackDecision = {
  allow: boolean;
  compactEvidence: string[];
  reason:
    | "allowed"
    | "durable_rule_resolved"
    | "mode_gate"
    | "not_ambiguous"
    | "paused"
    | "prompt_suppressed";
};

export type InterventionGateDecision = {
  allow: boolean;
  reason:
    | "allowed"
    | "better_intervention_pending"
    | "cooldown"
    | "mode_gate"
    | "notifications_disabled"
    | "paused";
};

export const retrieveRelevantDurableRules = ({
  durableRules,
  limit = 3,
  window,
}: {
  durableRules: DurableRuleRecord[];
  limit?: number;
  window: AggregatedContextWindow;
}): DurableRuleRecord[] => {
  const searchTokens = new Set(
    [
    ...window.summary.activeApps,
    ...window.summary.windowTitles,
    ...window.summary.urls,
    ...window.summary.keywords,
    ...window.summary.uiText,
    ]
      .join(" ")
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((token) => token.length >= 3),
  );

  return durableRules
    .map((rule) => {
      const ruleTokens = rule.ruleText
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .filter((token) => token.length >= 3);
      const overlap = ruleTokens.filter((token) => searchTokens.has(token)).length;
      const score = overlap + rule.confidence * 2 + rule.recency;

      return {
        overlap,
        rule,
        score,
      };
    })
    .filter((entry) => entry.overlap > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((entry) => entry.rule);
};

export const decideLocalAiFallback = ({
  classification,
  cooldownActive,
  durableRules,
  mode,
  paused,
  window,
}: {
  classification: DeterministicClassification;
  cooldownActive: boolean;
  durableRules: DurableRuleRecord[];
  mode: Mode;
  paused: boolean;
  window: AggregatedContextWindow;
}): LocalAiFallbackDecision => {
  const compactEvidence = [
    ...window.summary.activeApps,
    ...window.summary.windowTitles,
    ...window.summary.urls,
    ...window.summary.keywords,
  ].slice(0, 12);

  if (mode !== "running") {
    return { allow: false, compactEvidence, reason: "mode_gate" };
  }

  if (paused) {
    return { allow: false, compactEvidence, reason: "paused" };
  }

  if (cooldownActive) {
    return { allow: false, compactEvidence, reason: "prompt_suppressed" };
  }

  if (classification.runtimeState !== "uncertain" && classification.runtimeState !== "soft_drift") {
    return { allow: false, compactEvidence, reason: "not_ambiguous" };
  }

  if (durableRules.length > 0) {
    return { allow: false, compactEvidence, reason: "durable_rule_resolved" };
  }

  return { allow: true, compactEvidence, reason: "allowed" };
};

export const shouldSurfaceAmbiguityPrompt = ({
  cooldownActive,
  isLockedBoundary,
  mode,
  paused,
}: {
  cooldownActive: boolean;
  isLockedBoundary: boolean;
  mode: Mode;
  paused: boolean;
}): boolean => mode === "running" && !paused && !cooldownActive && !isLockedBoundary;

export const decideInterventionGate = ({
  betterInterventionPending,
  cooldownActive,
  mode,
  notificationPermissionGranted,
  paused,
}: {
  betterInterventionPending: boolean;
  cooldownActive: boolean;
  mode: Mode;
  notificationPermissionGranted: boolean;
  paused: boolean;
}): InterventionGateDecision => {
  if (mode !== "running") {
    return { allow: false, reason: "mode_gate" };
  }

  if (paused) {
    return { allow: false, reason: "paused" };
  }

  if (cooldownActive) {
    return { allow: false, reason: "cooldown" };
  }

  if (!notificationPermissionGranted) {
    return { allow: false, reason: "notifications_disabled" };
  }

  if (betterInterventionPending) {
    return { allow: false, reason: "better_intervention_pending" };
  }

  return { allow: true, reason: "allowed" };
};

export const applyPauseToSystemState = ({
  causedByCommandId,
  currentState,
  pauseUntil,
}: {
  causedByCommandId: string | null;
  currentState: SystemState;
  pauseUntil: string | null;
}): SystemState => ({
  ...currentState,
  caused_by_command_id: causedByCommandId,
  dashboard: {
    ...currentState.dashboard,
    current_focus: {
      ...currentState.dashboard.current_focus,
      runtime_state: "paused",
    },
    header: {
      ...currentState.dashboard.header,
      mode: "paused",
      summary_text: "Coaching is paused.",
    },
  },
  menu_bar: {
    ...currentState.menu_bar,
    allowed_actions: {
      ...currentState.menu_bar.allowed_actions,
      can_pause: false,
      can_resume: true,
    },
    mode_label: "Paused",
    pause_until: pauseUntil,
    primary_label: "Coaching paused",
    runtime_state: "paused",
  },
  mode: "paused",
  stream_sequence: currentState.stream_sequence + 1,
});
