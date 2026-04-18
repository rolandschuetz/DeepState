import { describe, expect, it } from "vitest";

import { decideIntervention } from "../src/interventions/intervention-engine.js";

const baseInput = {
  lastGoodContext: "Figma - Checkout",
  lastHardDriftNotificationAtMs: null,
  milestoneCandidate: null,
  mode: "running" as const,
  notificationPermissionGranted: true,
  nowIso: "2026-04-18T10:00:00Z",
  nowMs: Date.parse("2026-04-18T10:00:00Z"),
  observeOnlyTicksRemaining: 0,
  paused: false,
  praiseInput: {
    alignedStreakMs: 0,
    currentFocusBlockKey: "plan:plan_1",
    lastPraiseEmittedForFocusBlockKey: null,
  },
  previousRuntimeState: "aligned" as const,
  riskPromptDetail: null,
  sourceClassificationId: null,
  taskTitle: "Checkout",
};

describe("decideIntervention", () => {
  it("stays silent on soft drift", () => {
    const result = decideIntervention({
      ...baseInput,
      classificationRuntimeState: "soft_drift",
      previousRuntimeState: "aligned",
    });

    expect(result.intervention).toBeNull();
  });

  it("suppresses native hard drift notifications during observe-only", () => {
    const result = decideIntervention({
      ...baseInput,
      classificationRuntimeState: "hard_drift",
      observeOnlyTicksRemaining: 12,
      previousRuntimeState: "aligned",
    });

    expect(result.intervention?.kind).toBe("hard_drift");
    expect(result.intervention?.suppressNativeNotification).toBe(true);
    expect(result.intervention?.suppressionReason).toBe("observe_only");
  });

  it("emits recovery anchor when leaving hard drift with a recovery context", () => {
    const result = decideIntervention({
      ...baseInput,
      classificationRuntimeState: "aligned",
      previousRuntimeState: "hard_drift",
    });

    expect(result.intervention?.kind).toBe("recovery_anchor");
  });

  it("suppresses recovery-anchor native delivery when notifications are unavailable", () => {
    const result = decideIntervention({
      ...baseInput,
      classificationRuntimeState: "aligned",
      notificationPermissionGranted: false,
      previousRuntimeState: "hard_drift",
    });

    expect(result.intervention?.kind).toBe("recovery_anchor");
    expect(result.intervention?.suppressNativeNotification).toBe(true);
    expect(result.intervention?.suppressionReason).toBe("permissions_missing");
  });

  it("respects hard drift cooldown windows", () => {
    const first = decideIntervention({
      ...baseInput,
      classificationRuntimeState: "hard_drift",
      previousRuntimeState: "aligned",
    });

    expect(first.intervention?.suppressNativeNotification).toBe(false);

    const second = decideIntervention({
      ...baseInput,
      classificationRuntimeState: "hard_drift",
      lastHardDriftNotificationAtMs: first.lastHardDriftNotificationAtMs,
      nowIso: "2026-04-18T10:02:00Z",
      nowMs: Date.parse("2026-04-18T10:02:00Z"),
      previousRuntimeState: "hard_drift",
    });

    expect(second.intervention?.suppressNativeNotification).toBe(true);
    expect(second.intervention?.suppressionReason).toBe("cooldown");
  });

  it("emits praise when aligned streak exceeds the threshold", () => {
    const result = decideIntervention({
      ...baseInput,
      classificationRuntimeState: "aligned",
      previousRuntimeState: "aligned",
      praiseInput: {
        alignedStreakMs: 26 * 60 * 1000,
        currentFocusBlockKey: "plan:plan_1",
        lastPraiseEmittedForFocusBlockKey: null,
      },
    });

    expect(result.intervention?.kind).toBe("praise");
    expect(result.intervention?.title.startsWith("Locked.")).toBe(true);
  });

  it("does not repeat praise for the same focus block key", () => {
    const first = decideIntervention({
      ...baseInput,
      classificationRuntimeState: "aligned",
      previousRuntimeState: "aligned",
      praiseInput: {
        alignedStreakMs: 26 * 60 * 1000,
        currentFocusBlockKey: "plan:plan_1",
        lastPraiseEmittedForFocusBlockKey: null,
      },
    });

    expect(first.intervention?.kind).toBe("praise");

    const second = decideIntervention({
      ...baseInput,
      classificationRuntimeState: "aligned",
      previousRuntimeState: "aligned",
      praiseInput: {
        alignedStreakMs: 40 * 60 * 1000,
        currentFocusBlockKey: "plan:plan_1",
        lastPraiseEmittedForFocusBlockKey: "plan:plan_1",
      },
    });

    expect(second.intervention).toBeNull();
  });

  it("suppresses praise notifications during observe-only", () => {
    const result = decideIntervention({
      ...baseInput,
      classificationRuntimeState: "aligned",
      observeOnlyTicksRemaining: 5,
      previousRuntimeState: "aligned",
      praiseInput: {
        alignedStreakMs: 26 * 60 * 1000,
        currentFocusBlockKey: "plan:plan_1",
        lastPraiseEmittedForFocusBlockKey: null,
      },
    });

    expect(result.intervention?.kind).toBe("praise");
    expect(result.intervention?.suppressNativeNotification).toBe(true);
    expect(result.intervention?.suppressionReason).toBe("observe_only");
  });
});
