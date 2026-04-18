import { describe, expect, it } from "vitest";

import {
  createContextAggregator,
  type NormalizedScreenpipeEvidence,
} from "../src/index.js";

const createEvidence = (
  overrides: Partial<NormalizedScreenpipeEvidence> = {},
): NormalizedScreenpipeEvidence => ({
  accessibilityText: null,
  activitySummary: {
    dominantSignal: "typing",
    isActive: true,
    totalInteractions: 10,
  },
  appIdentifier: "cursor",
  appName: "Cursor",
  interactionSummary: {
    appSwitches: 1,
    clickCount: 2,
    scrollEvents: 3,
    typingSeconds: 4,
  },
  keywords: ["checkout"],
  observedAt: "2026-04-18T09:00:00.000Z",
  ocrText: null,
  screenpipeRefs: {
    elementIds: [1],
    frameIds: [10],
    recordIds: ["record_1"],
  },
  source: "screenpipe_search",
  uiText: ["checkout"],
  url: "https://github.com/openai/repo/pull/1",
  urlSummary: {
    host: "github.com",
    normalizedUrl: "https://github.com/openai/repo/pull/1",
    pathTokens: ["openai", "repo", "pull", "1"],
  },
  windowTitle: "repo.ts - INeedABossAgent",
  ...overrides,
});

describe("createContextAggregator", () => {
  it("rolls normalized evidence into contiguous 90 second context windows", () => {
    const aggregator = createContextAggregator();

    const windows = aggregator.aggregate([
      createEvidence({
        observedAt: "2026-04-18T09:00:45.000Z",
        screenpipeRefs: { elementIds: [2], frameIds: [11], recordIds: ["record_2"] },
        url: "https://docs.stripe.com/payments",
        urlSummary: {
          host: "docs.stripe.com",
          normalizedUrl: "https://docs.stripe.com/payments",
          pathTokens: ["payments"],
        },
        windowTitle: "Stripe Docs - Payments",
      }),
      createEvidence({
        observedAt: "2026-04-18T09:00:00.000Z",
      }),
      createEvidence({
        appIdentifier: "slack",
        appName: "Slack",
        interactionSummary: {
          appSwitches: 0,
          clickCount: 1,
          scrollEvents: 1,
          typingSeconds: 10,
        },
        keywords: ["standup"],
        observedAt: "2026-04-18T09:02:10.000Z",
        screenpipeRefs: { elementIds: [3], frameIds: [12], recordIds: ["record_3"] },
        uiText: ["daily standup"],
        url: null,
        urlSummary: {
          host: null,
          normalizedUrl: null,
          pathTokens: [],
        },
        windowTitle: "Slack | Team",
      }),
    ]);

    expect(windows).toHaveLength(2);
    expect(windows[0]).toMatchObject({
      startedAt: "2026-04-18T09:00:00.000Z",
      endedAt: "2026-04-18T09:00:45.000Z",
      sourceRecordIds: ["record_1", "record_2"],
      summary: {
        activeApps: ["Cursor"],
        activitySummary: {
          appSwitches: 2,
          clickCount: 4,
          isActive: true,
          scrollEvents: 6,
          totalInteractions: 20,
          typingSeconds: 8,
        },
        keywords: ["checkout"],
        urls: [
          "https://github.com/openai/repo/pull/1",
          "https://docs.stripe.com/payments",
        ],
        windowTitles: ["repo.ts - INeedABossAgent", "Stripe Docs - Payments"],
      },
    });
    expect(windows[1]).toMatchObject({
      startedAt: "2026-04-18T09:02:10.000Z",
      endedAt: "2026-04-18T09:02:10.000Z",
      sourceRecordIds: ["record_3"],
      summary: {
        activeApps: ["Slack"],
        activitySummary: {
          appSwitches: 0,
          clickCount: 1,
          isActive: true,
          scrollEvents: 1,
          totalInteractions: 10,
          typingSeconds: 10,
        },
        keywords: ["standup"],
        urls: [],
        windowTitles: ["Slack | Team"],
      },
    });
  });

  it("ignores records without valid timestamps", () => {
    const aggregator = createContextAggregator();

    const windows = aggregator.aggregate([
      createEvidence({
        observedAt: null,
        screenpipeRefs: { elementIds: [], frameIds: [], recordIds: ["invalid"] },
      }),
    ]);

    expect(windows).toEqual([]);
  });
});
