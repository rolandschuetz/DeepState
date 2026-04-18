import { describe, expect, it } from "vitest";

import {
  normalizeScreenpipeRecordToEvidence,
  normalizeScreenpipeRecordsToEvidence,
} from "../src/index.js";

describe("normalizeScreenpipeRecordToEvidence", () => {
  it("maps a flat Screenpipe record into the app-owned evidence shape", () => {
    expect(
      normalizeScreenpipeRecordToEvidence({
        app_name: "Google Chrome",
        click_count: 4,
        element_ids: [42, 44],
        frame_id: 1001,
        id: "record_1",
        keywords: ["checkout", "payment"],
        ocr_text: "Stripe checkout docs",
        scroll_events: 14,
        timestamp: "2026-04-18T12:00:00+02:00",
        typing_seconds: 96,
        url: "https://docs.stripe.com/payments",
        window_title: "Stripe Docs - Payments",
      }),
    ).toEqual({
      accessibilityText: null,
      appName: "Google Chrome",
      interactionSummary: {
        appSwitches: 0,
        clickCount: 4,
        scrollEvents: 14,
        typingSeconds: 96,
      },
      keywords: ["checkout", "payment"],
      observedAt: "2026-04-18T10:00:00.000Z",
      ocrText: "Stripe checkout docs",
      screenpipeRefs: {
        elementIds: [42, 44],
        frameIds: [1001],
        recordIds: ["record_1"],
      },
      source: "screenpipe_search",
      uiText: [],
      url: "https://docs.stripe.com/payments",
      windowTitle: "Stripe Docs - Payments",
    });
  });

  it("pulls nested text, refs, and interaction signals from mixed record shapes", () => {
    expect(
      normalizeScreenpipeRecordToEvidence({
        metadata: {
          applicationName: "Cursor",
          createdAt: "2026-04-18T10:15:00Z",
          pageUrl: "https://github.com/openai/repo/pull/1",
          title: "checkout.tsx - repo",
        },
        recordId: "search_2",
        segments: [
          {
            accessibility_text: "Button Save",
            frameIds: [2001, 2002],
            textLines: ["checkout", "launch"],
          },
        ],
        stats: {
          appSwitches: 2,
          mouse_clicks: 3,
          typed_duration_seconds: "45",
        },
      }),
    ).toEqual({
      accessibilityText: "Button Save",
      appName: "Cursor",
      interactionSummary: {
        appSwitches: 2,
        clickCount: 3,
        scrollEvents: 0,
        typingSeconds: 45,
      },
      keywords: [],
      observedAt: "2026-04-18T10:15:00.000Z",
      ocrText: null,
      screenpipeRefs: {
        elementIds: [],
        frameIds: [2001, 2002],
        recordIds: ["search_2"],
      },
      source: "screenpipe_search",
      uiText: ["checkout", "launch"],
      url: "https://github.com/openai/repo/pull/1",
      windowTitle: "checkout.tsx - repo",
    });
  });
});

describe("normalizeScreenpipeRecordsToEvidence", () => {
  it("normalizes batches of raw records", () => {
    expect(
      normalizeScreenpipeRecordsToEvidence([
        {
          app_name: "Figma",
          id: "record_1",
          timestamp: "2026-04-18T10:00:00Z",
        },
        {
          app_name: "Slack",
          id: "record_2",
          timestamp: "2026-04-18T10:01:00Z",
        },
      ]).map((record) => ({
        appName: record.appName,
        observedAt: record.observedAt,
        recordIds: record.screenpipeRefs.recordIds,
      })),
    ).toEqual([
      {
        appName: "Figma",
        observedAt: "2026-04-18T10:00:00.000Z",
        recordIds: ["record_1"],
      },
      {
        appName: "Slack",
        observedAt: "2026-04-18T10:01:00.000Z",
        recordIds: ["record_2"],
      },
    ]);
  });
});
