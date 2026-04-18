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
      activitySummary: {
        dominantSignal: "typing",
        isActive: true,
        totalInteractions: 114,
      },
      appIdentifier: "google.chrome",
      appName: "Google Chrome",
      interactionSummary: {
        appSwitches: 0,
        clickCount: 4,
        scrollEvents: 14,
        typingSeconds: 96,
      },
      keywords: ["checkout", "payment"],
      meetingHints: {
        collaboratorHints: [],
        hasAudioTranscript: false,
        isLikelyMeeting: false,
        reasons: [],
      },
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
      urlSummary: {
        host: "docs.stripe.com",
        normalizedUrl: "https://docs.stripe.com/payments",
        pathTokens: ["payments"],
      },
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
      activitySummary: {
        dominantSignal: "typing",
        isActive: true,
        totalInteractions: 50,
      },
      appIdentifier: "cursor",
      appName: "Cursor",
      interactionSummary: {
        appSwitches: 2,
        clickCount: 3,
        scrollEvents: 0,
        typingSeconds: 45,
      },
      keywords: [],
      meetingHints: {
        collaboratorHints: [],
        hasAudioTranscript: false,
        isLikelyMeeting: false,
        reasons: [],
      },
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
      urlSummary: {
        host: "github.com",
        normalizedUrl: "https://github.com/openai/repo/pull/1",
        pathTokens: ["openai", "repo", "pull", "1"],
      },
      windowTitle: "checkout.tsx - repo",
    });
  });

  it("sanitizes noisy titles, canonicalizes app identifiers, and strips url query noise", () => {
    expect(
      normalizeScreenpipeRecordToEvidence({
        app_name: "Linear.app",
        id: "record_3",
        scroll_events: 2,
        title: "  Sprint Review  \n|\tLinear  ",
        url:
          "https://linear.app/acme/issue/ENG-123/fix-auth-flow?utm_source=test#activity",
      }),
    ).toEqual({
      accessibilityText: null,
      activitySummary: {
        dominantSignal: "scrolling",
        isActive: true,
        totalInteractions: 2,
      },
      appIdentifier: "linear",
      appName: "Linear.app",
      interactionSummary: {
        appSwitches: 0,
        clickCount: 0,
        scrollEvents: 2,
        typingSeconds: 0,
      },
      keywords: [],
      meetingHints: {
        collaboratorHints: [],
        hasAudioTranscript: false,
        isLikelyMeeting: false,
        reasons: [],
      },
      observedAt: null,
      ocrText: null,
      screenpipeRefs: {
        elementIds: [],
        frameIds: [],
        recordIds: ["record_3"],
      },
      source: "screenpipe_search",
      uiText: [],
      url: "https://linear.app/acme/issue/ENG-123/fix-auth-flow",
      urlSummary: {
        host: "linear.app",
        normalizedUrl: "https://linear.app/acme/issue/ENG-123/fix-auth-flow",
        pathTokens: ["acme", "issue", "eng", "123", "fix", "auth", "flow"],
      },
      windowTitle: "Sprint Review - Linear",
    });
  });

  it("tags likely meeting contexts from conferencing apps, transcripts, and collaborator hints", () => {
    expect(
      normalizeScreenpipeRecordToEvidence({
        app_name: "Zoom",
        audio_transcript: "Alice: can you hear me? Bob: yes.",
        id: "record_4",
        participant_names: ["Alice", "Bob"],
        timestamp: "2026-04-18T10:20:00Z",
        title: "Weekly Sync - Product",
        typing_seconds: 3,
        url: "https://zoom.us/j/123456",
      }),
    ).toEqual({
      accessibilityText: null,
      activitySummary: {
        dominantSignal: "typing",
        isActive: true,
        totalInteractions: 3,
      },
      appIdentifier: "zoom",
      appName: "Zoom",
      interactionSummary: {
        appSwitches: 0,
        clickCount: 0,
        scrollEvents: 0,
        typingSeconds: 3,
      },
      keywords: [],
      meetingHints: {
        collaboratorHints: ["Alice", "Bob"],
        hasAudioTranscript: true,
        isLikelyMeeting: true,
        reasons: [
          "audio_heavy_low_typing",
          "collaborator_hint",
          "conferencing_app",
          "meeting_keyword",
        ],
      },
      observedAt: "2026-04-18T10:20:00.000Z",
      ocrText: null,
      screenpipeRefs: {
        elementIds: [],
        frameIds: [],
        recordIds: ["record_4"],
      },
      source: "screenpipe_search",
      uiText: [],
      url: "https://zoom.us/j/123456",
      urlSummary: {
        host: "zoom.us",
        normalizedUrl: "https://zoom.us/j/123456",
        pathTokens: ["j", "123456"],
      },
      windowTitle: "Weekly Sync - Product",
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
