import { describe, expect, it } from "vitest";

import {
  createPrivacyFilter,
  sanitizeEvidenceForPersistence,
  type NormalizedScreenpipeEvidence,
  type PrivacyExclusionRecord,
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
    appSwitches: 0,
    clickCount: 1,
    scrollEvents: 2,
    typingSeconds: 7,
  },
  keywords: [],
  meetingHints: {
    collaboratorHints: [],
    hasAudioTranscript: false,
    isLikelyMeeting: false,
    reasons: [],
  },
  observedAt: "2026-04-18T10:00:00.000Z",
  ocrText: null,
  screenpipeRefs: {
    elementIds: [],
    frameIds: [],
    recordIds: [],
  },
  source: "screenpipe_search",
  uiText: [],
  url: "https://github.com/openai/repo",
  urlSummary: {
    host: "github.com",
    normalizedUrl: "https://github.com/openai/repo",
    pathTokens: ["openai", "repo"],
  },
  windowTitle: "repo.ts - INeedABossAgent",
  ...overrides,
});

const createExclusion = (
  overrides: Partial<PrivacyExclusionRecord>,
): PrivacyExclusionRecord => ({
  createdAt: "2026-04-18T00:00:00Z",
  enabled: true,
  exclusionId: "exclude_checkout",
  label: "Checkout",
  matchType: "domain",
  pattern: "paypal.com",
  source: "user_defined",
  updatedAt: "2026-04-18T00:00:00Z",
  ...overrides,
});

describe("sanitizeEvidenceForPersistence", () => {
  it("drops incognito contexts, redacts protected fragments, and excludes matched evidence before persistence", () => {
    const privacyFilter = createPrivacyFilter([
      createExclusion({
        exclusionId: "exclude_paypal",
        matchType: "domain",
        pattern: "paypal.com",
      }),
    ]);

    const result = sanitizeEvidenceForPersistence(
      [
        createEvidence({
          ocrText: "Contact alice@example.com and use password: hunter2",
          screenpipeRefs: { elementIds: [], frameIds: [], recordIds: ["redact"] },
          uiText: ["sk-prod_123456789", "4111 1111 1111 1111"],
          windowTitle: "Alice alice@example.com",
        }),
        createEvidence({
          screenpipeRefs: { elementIds: [], frameIds: [], recordIds: ["private"] },
          url: "https://example.com/private-window",
          windowTitle: "Research - Incognito",
        }),
        createEvidence({
          screenpipeRefs: { elementIds: [], frameIds: [], recordIds: ["excluded"] },
          url: "https://paypal.com/checkout",
          urlSummary: {
            host: "paypal.com",
            normalizedUrl: "https://paypal.com/checkout",
            pathTokens: ["checkout"],
          },
        }),
      ],
      privacyFilter,
    );

    expect(result.persistable).toHaveLength(1);
    expect(result.persistable[0]).toMatchObject({
      ocrText:
        "Contact [redacted_email] and use [redacted_secret]",
      screenpipeRefs: { recordIds: ["redact"] },
      uiText: ["[redacted_token]", "[redacted_card]"],
      windowTitle: "Alice [redacted_email]",
    });
    expect(result.audit).toEqual({
      droppedPrivateContextCount: 1,
      privacyFilter: {
        filteredCount: 1,
        keptCount: 1,
        totalCount: 2,
        totalsByMatchType: {
          app: 0,
          domain: 1,
          url_regex: 0,
          window_title_regex: 0,
        },
      },
      redactedFieldCount: 4,
    });
  });
});
