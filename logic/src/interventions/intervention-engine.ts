import { randomUUID } from "node:crypto";

import type { Mode, RuntimeState } from "@ineedabossagent/shared-contracts";

import type { InterventionRecord } from "../repos/sqlite-repositories.js";

import { messages } from "./messages.js";

export const HARD_DRIFT_COOLDOWN_MS = 15 * 60 * 1_000;
export const MILESTONE_CONFIDENCE_THRESHOLD = 0.85;

export type MilestoneCandidateInput = {
  confidence: number;
  hint: string;
  taskId: string;
  taskTitle: string;
};

export type InterventionDecisionInput = {
  classificationRuntimeState: RuntimeState;
  lastGoodContext: string | null;
  lastHardDriftNotificationAtMs: number | null;
  milestoneCandidate: MilestoneCandidateInput | null;
  mode: Mode;
  notificationPermissionGranted: boolean;
  nowIso: string;
  nowMs: number;
  observeOnlyTicksRemaining: number;
  paused: boolean;
  previousRuntimeState: RuntimeState;
  riskPromptDetail: string | null;
  sourceClassificationId: string | null;
  taskTitle: string | null;
};

export type InterventionDecision = {
  intervention: InterventionRecord | null;
  lastHardDriftNotificationAtMs: number | null;
};

const suppressionForHardDrift = ({
  cooldownActive,
  mode,
  notificationPermissionGranted,
  observeOnlyTicksRemaining,
  paused,
}: {
  cooldownActive: boolean;
  mode: Mode;
  notificationPermissionGranted: boolean;
  observeOnlyTicksRemaining: number;
  paused: boolean;
}): {
  reason: InterventionRecord["suppressionReason"];
  suppress: boolean;
} => {
  if (mode !== "running") {
    return { reason: "mode_gate", suppress: true };
  }

  if (paused) {
    return { reason: "paused", suppress: true };
  }

  if (observeOnlyTicksRemaining > 0) {
    return { reason: "observe_only", suppress: true };
  }

  if (!notificationPermissionGranted) {
    return { reason: "permissions_missing", suppress: true };
  }

  if (cooldownActive) {
    return { reason: "cooldown", suppress: true };
  }

  return { reason: null, suppress: false };
};

export const decideIntervention = (
  input: InterventionDecisionInput,
): InterventionDecision => {
  let lastHardDrift = input.lastHardDriftNotificationAtMs;
  const nativeDeliverySuppressed =
    input.observeOnlyTicksRemaining > 0 || !input.notificationPermissionGranted;
  const nativeSuppressionReason =
    input.observeOnlyTicksRemaining > 0
      ? "observe_only"
      : !input.notificationPermissionGranted
        ? "permissions_missing"
        : null;

  if (input.mode !== "running" || input.paused) {
    return { intervention: null, lastHardDriftNotificationAtMs: lastHardDrift };
  }

  // 1) Milestone candidate (confirm/dismiss) — dashboard-first, never required native.
  if (
    input.milestoneCandidate !== null &&
    input.milestoneCandidate.confidence >= MILESTONE_CONFIDENCE_THRESHOLD
  ) {
    const milestone = input.milestoneCandidate;

    return {
      intervention: {
        actions: [
          {
            actionId: randomUUID(),
            label: "Confirm milestone",
            semanticAction: "confirm_milestone",
          },
          {
            actionId: randomUUID(),
            label: "Not yet",
            semanticAction: "dismiss_milestone",
          },
        ],
        body: messages.milestoneCandidate.body(milestone.taskTitle, milestone.hint),
        createdAt: input.nowIso,
        dedupeKey: `milestone_candidate:${milestone.taskId}:${input.nowIso.slice(0, 13)}`,
        expiresAt: null,
        interventionId: randomUUID(),
        kind: "milestone_candidate",
        presentation: "dashboard_only",
        severity: "info",
        sourceClassificationId: input.sourceClassificationId,
        suppressNativeNotification: true,
        suppressionReason: null,
        title: messages.milestoneCandidate.title,
      },
      lastHardDriftNotificationAtMs: lastHardDrift,
    };
  }

  // 2) Recovery anchor: leaving hard drift.
  if (
    input.previousRuntimeState === "hard_drift" &&
    input.classificationRuntimeState !== "hard_drift" &&
    input.lastGoodContext !== null &&
    input.lastGoodContext.trim().length > 0
  ) {
    return {
      intervention: {
        actions: [
          {
            actionId: randomUUID(),
            label: "Open dashboard",
            semanticAction: "open_dashboard",
          },
          {
            actionId: randomUUID(),
            label: "Dismiss",
            semanticAction: "dismiss",
          },
        ],
        body: messages.recoveryAnchor.body(input.lastGoodContext),
        createdAt: input.nowIso,
        dedupeKey: `recovery_anchor:${input.previousRuntimeState}:${input.nowMs}`,
        expiresAt: null,
        interventionId: randomUUID(),
        kind: "recovery_anchor",
        presentation: "both",
        severity: "info",
        sourceClassificationId: input.sourceClassificationId,
        suppressNativeNotification: nativeDeliverySuppressed,
        suppressionReason: nativeSuppressionReason,
        title: messages.recoveryAnchor.title,
      },
      lastHardDriftNotificationAtMs: lastHardDrift,
    };
  }

  // 3) Soft drift — silent (no intervention).
  if (input.classificationRuntimeState === "soft_drift") {
    return { intervention: null, lastHardDriftNotificationAtMs: lastHardDrift };
  }

  // 4) Hard drift redirect (takes precedence over generic risk text).
  if (input.classificationRuntimeState === "hard_drift") {
    const cooldownActive =
      lastHardDrift !== null &&
      input.nowMs - lastHardDrift < HARD_DRIFT_COOLDOWN_MS;

    const { reason, suppress } = suppressionForHardDrift({
      cooldownActive,
      mode: input.mode,
      notificationPermissionGranted: input.notificationPermissionGranted,
      observeOnlyTicksRemaining: input.observeOnlyTicksRemaining,
      paused: input.paused,
    });

    if (!cooldownActive && !suppress) {
      lastHardDrift = input.nowMs;
    }

    return {
      intervention: {
        actions: [
          {
            actionId: randomUUID(),
            label: "Return now",
            semanticAction: "return_now",
          },
          {
            actionId: randomUUID(),
            label: "Intentional detour",
            semanticAction: "intentional_detour",
          },
          {
            actionId: randomUUID(),
            label: "Pause 10 minutes",
            semanticAction: "pause_10_minutes",
          },
        ],
        body: messages.hardDrift.body(input.taskTitle),
        createdAt: input.nowIso,
        dedupeKey: `hard_drift:${input.taskTitle ?? "none"}`,
        expiresAt: null,
        interventionId: randomUUID(),
        kind: "hard_drift",
        presentation: "both",
        severity: "warning",
        sourceClassificationId: input.sourceClassificationId,
        suppressNativeNotification: suppress,
        suppressionReason: reason,
        title: messages.hardDrift.title,
      },
      lastHardDriftNotificationAtMs: lastHardDrift,
    };
  }

  // 5) Risk prompt (dashboard-only) when not in drift states.
  if (input.riskPromptDetail !== null && input.riskPromptDetail.length > 0) {
    return {
      intervention: {
        actions: [
          {
            actionId: randomUUID(),
            label: "Review plan",
            semanticAction: "open_dashboard",
          },
        ],
        body: messages.riskPrompt.body(input.riskPromptDetail),
        createdAt: input.nowIso,
        dedupeKey: `risk_prompt:${input.nowIso.slice(0, 16)}`,
        expiresAt: null,
        interventionId: randomUUID(),
        kind: "risk_prompt",
        presentation: "dashboard_only",
        severity: "warning",
        sourceClassificationId: input.sourceClassificationId,
        suppressNativeNotification: true,
        suppressionReason: null,
        title: messages.riskPrompt.title,
      },
      lastHardDriftNotificationAtMs: lastHardDrift,
    };
  }

  return { intervention: null, lastHardDriftNotificationAtMs: lastHardDrift };
};
