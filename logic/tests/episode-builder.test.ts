import { describe, expect, it } from "vitest";

import { buildEpisodesFromClassifiedWindows } from "../src/context/episode-builder.js";

const baseWindow = (
  id: string,
  start: string,
  end: string,
  overrides: Partial<{
    appSwitches: number;
    isSupport: boolean;
    matchedTaskId: string | null;
    runtimeState: "aligned" | "hard_drift";
  }> = {},
) => ({
  appSwitches: 0,
  confidenceRatio: 0.8,
  contextWindowId: id,
  dwellDurationSeconds: 90,
  endedAt: end,
  isSupport: false,
  matchedGoalId: "goal_1",
  matchedTaskId: "task_1" as string | null,
  runtimeState: "aligned" as const,
  startedAt: start,
  topEvidence: ["Figma"],
  ...overrides,
});

describe("buildEpisodesFromClassifiedWindows", () => {
  it("merges consecutive aligned windows into a 3–5 minute episode", () => {
    const episodes = buildEpisodesFromClassifiedWindows([
      baseWindow("w1", "2026-04-18T09:00:00Z", "2026-04-18T09:01:30Z"),
      baseWindow("w2", "2026-04-18T09:01:31Z", "2026-04-18T09:03:00Z"),
      baseWindow("w3", "2026-04-18T09:03:01Z", "2026-04-18T09:04:30Z"),
    ]);

    expect(episodes).toHaveLength(1);
    expect(episodes[0]?.contextWindowIds).toEqual(["w1", "w2", "w3"]);
    expect(episodes[0]?.runtimeState).toBe("aligned");
  });

  it("starts a new episode when the task association changes", () => {
    const episodes = buildEpisodesFromClassifiedWindows([
      baseWindow("w1", "2026-04-18T09:00:00Z", "2026-04-18T09:01:30Z", {
        matchedTaskId: "task_1",
      }),
      baseWindow("w2", "2026-04-18T09:01:31Z", "2026-04-18T09:03:00Z", {
        matchedTaskId: "task_2",
      }),
    ]);

    expect(episodes.length).toBeGreaterThanOrEqual(2);
  });
});
