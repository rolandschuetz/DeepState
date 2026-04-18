import { describe, expect, it } from "vitest";

import { computeProgressEstimatesForPlan } from "../src/progress/progress-estimator.js";
import type { EpisodeRecord } from "../src/repos/sqlite-repositories.js";

describe("computeProgressEstimatesForPlan", () => {
  it("persists risk_level and status text for each task", () => {
    const tasks = [
      {
        allowedSupportWork: [],
        createdAt: "2026-04-18T08:00:00Z",
        goalId: "goal_1",
        intendedWorkSecondsToday: 7_200,
        likelyDetours: [],
        planId: "plan_1",
        progressKind: "time_based" as const,
        sortOrder: 1,
        successDefinition: "Done",
        taskId: "task_1",
        title: "Ship feature",
        totalRemainingEffortSeconds: 10_000,
      },
    ];

    const episodes: EpisodeRecord[] = [
      {
        confidenceRatio: 0.8,
        contextWindowIds: ["w1"],
        endedAt: "2026-04-18T09:30:00Z",
        episodeId: "ep_1",
        isSupportWork: false,
        matchedTaskId: "task_1",
        runtimeState: "aligned",
        startedAt: "2026-04-18T09:00:00Z",
        topEvidence: ["commit"],
      },
    ];

    const drafts = computeProgressEstimatesForPlan({
      episodes,
      estimatedAt: "2026-04-18T09:35:00Z",
      focusBlocks: [],
      localDayStartMs: Date.parse("2026-04-18T08:00:00Z"),
      nowMs: Date.parse("2026-04-18T09:35:00Z"),
      planId: "plan_1",
      tasks,
    });

    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.riskLevel).toBeDefined();
    expect(drafts[0]?.latestStatusText.length).toBeGreaterThan(10);
  });
});
