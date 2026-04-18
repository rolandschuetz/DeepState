import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  createContextAggregator,
  type NormalizedScreenpipeEvidence,
} from "../src/index.js";

type ReplayFixture = {
  expected_context_windows: Array<{
    dwellDurationSeconds: number;
    endedAt: string;
    sourceRecordIds: Array<number | string>;
    startedAt: string;
    summary: {
      activeApps: string[];
      activitySummary: {
        appSwitches: number;
        clickCount: number;
        isActive: boolean;
        scrollEvents: number;
        totalInteractions: number;
        typingSeconds: number;
      };
      keywords: string[];
      meetingContext: {
        collaboratorHints: string[];
        isLikelyMeeting: boolean;
        reasons: string[];
        titles: string[];
      };
      urls: string[];
      windowTitles: string[];
    };
  }>;
  normalized_evidence: NormalizedScreenpipeEvidence[];
};

const loadReplayFixture = (name: string): ReplayFixture => {
  const fixturePath = path.resolve(
    process.cwd(),
    "..",
    "fixtures",
    "replay",
    "normalized-evidence",
    `${name}.json`,
  );

  return JSON.parse(readFileSync(fixturePath, "utf8")) as ReplayFixture;
};

describe("normalized evidence replay fixtures", () => {
  it("keeps fixture payloads compatible with the replay pipeline", () => {
    const fixture = loadReplayFixture("focus-session");

    expect(fixture.normalized_evidence).toHaveLength(3);
    expect(
      fixture.normalized_evidence.map((record) => ({
        observedAt: record.observedAt,
        recordIds: record.screenpipeRefs.recordIds,
        source: record.source,
      })),
    ).toEqual([
      {
        observedAt: "2026-04-18T09:00:00.000Z",
        recordIds: ["record_1"],
        source: "screenpipe_search",
      },
      {
        observedAt: "2026-04-18T09:00:40.000Z",
        recordIds: ["record_2"],
        source: "screenpipe_search",
      },
      {
        observedAt: "2026-04-18T09:02:20.000Z",
        recordIds: ["record_3"],
        source: "screenpipe_search",
      },
    ]);
  });

  it("replays normalized evidence fixtures into deterministic context windows offline", () => {
    const fixture = loadReplayFixture("focus-session");
    const aggregator = createContextAggregator();

    const windows = aggregator.aggregate(fixture.normalized_evidence);

    expect(
      windows.map((window) => ({
        dwellDurationSeconds: window.dwellDurationSeconds,
        endedAt: window.endedAt,
        sourceRecordIds: window.sourceRecordIds,
        startedAt: window.startedAt,
        summary: {
          activeApps: window.summary.activeApps,
          activitySummary: window.summary.activitySummary,
          keywords: window.summary.keywords,
          meetingContext: window.summary.meetingContext,
          urls: window.summary.urls,
          windowTitles: window.summary.windowTitles,
        },
      })),
    ).toEqual(fixture.expected_context_windows);
  });
});
