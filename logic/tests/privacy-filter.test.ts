import { describe, expect, it } from "vitest";

import {
  createPrivacyFilter,
  type NormalizedScreenpipeEvidence,
  type PrivacyExclusionRecord,
} from "../src/index.js";

const createEvidence = (
  overrides: Partial<NormalizedScreenpipeEvidence> = {},
): NormalizedScreenpipeEvidence => ({
  accessibilityText: null,
  activitySummary: {
    dominantSignal: "idle",
    isActive: false,
    totalInteractions: 0,
  },
  appIdentifier: null,
  appName: null,
  interactionSummary: {
    appSwitches: 0,
    clickCount: 0,
    scrollEvents: 0,
    typingSeconds: 0,
  },
  keywords: [],
  observedAt: "2026-04-18T10:00:00.000Z",
  ocrText: null,
  screenpipeRefs: {
    elementIds: [],
    frameIds: [],
    recordIds: [],
  },
  source: "screenpipe_search",
  uiText: [],
  url: null,
  urlSummary: {
    host: null,
    normalizedUrl: null,
    pathTokens: [],
  },
  windowTitle: null,
  ...overrides,
});

const createExclusion = (
  overrides: Partial<PrivacyExclusionRecord>,
): PrivacyExclusionRecord => ({
  createdAt: "2026-04-18T00:00:00Z",
  enabled: true,
  exclusionId: "exclusion_1",
  label: "Test exclusion",
  matchType: "app",
  pattern: "1Password",
  source: "user_defined",
  updatedAt: "2026-04-18T00:00:00Z",
  ...overrides,
});

describe("createPrivacyFilter", () => {
  it("drops records matched by app, domain, url regex, and window title rules while keeping aggregate audit counters only", () => {
    const filter = createPrivacyFilter([
      createExclusion({
        exclusionId: "app_rule",
        matchType: "app",
        pattern: "1password",
      }),
      createExclusion({
        exclusionId: "domain_rule",
        matchType: "domain",
        pattern: "bankofamerica.com",
      }),
      createExclusion({
        exclusionId: "url_rule",
        matchType: "url_regex",
        pattern: "paypal\\.com",
      }),
      createExclusion({
        exclusionId: "window_rule",
        matchType: "window_title_regex",
        pattern: "keychain",
      }),
    ]);

    const result = filter.filterEvidence([
      createEvidence({
        appIdentifier: "1password",
        appName: "1Password",
        screenpipeRefs: { elementIds: [], frameIds: [], recordIds: ["app"] },
      }),
      createEvidence({
        screenpipeRefs: { elementIds: [], frameIds: [], recordIds: ["domain"] },
        url: "https://secure.bankofamerica.com/login",
        urlSummary: {
          host: "secure.bankofamerica.com",
          normalizedUrl: "https://secure.bankofamerica.com/login",
          pathTokens: ["login"],
        },
      }),
      createEvidence({
        screenpipeRefs: { elementIds: [], frameIds: [], recordIds: ["url"] },
        url: "https://paypal.com/checkout",
        urlSummary: {
          host: "paypal.com",
          normalizedUrl: "https://paypal.com/checkout",
          pathTokens: ["checkout"],
        },
      }),
      createEvidence({
        screenpipeRefs: { elementIds: [], frameIds: [], recordIds: ["window"] },
        windowTitle: "Keychain Access",
      }),
      createEvidence({
        appIdentifier: "cursor",
        appName: "Cursor",
        screenpipeRefs: { elementIds: [], frameIds: [], recordIds: ["keep"] },
        url: "https://github.com/openai/repo/pull/1",
        urlSummary: {
          host: "github.com",
          normalizedUrl: "https://github.com/openai/repo/pull/1",
          pathTokens: ["openai", "repo", "pull", "1"],
        },
        windowTitle: "repo.ts - INeedABossAgent",
      }),
    ]);

    expect(result.kept).toHaveLength(1);
    expect(result.kept[0]?.screenpipeRefs.recordIds).toEqual(["keep"]);
    expect(result.audit).toEqual({
      filteredCount: 4,
      keptCount: 1,
      totalCount: 5,
      totalsByMatchType: {
        app: 1,
        domain: 1,
        url_regex: 1,
        window_title_regex: 1,
      },
    });
  });

  it("ignores disabled or invalid regex exclusions", () => {
    const filter = createPrivacyFilter([
      createExclusion({
        enabled: false,
        exclusionId: "disabled_domain",
        matchType: "domain",
        pattern: "github.com",
      }),
      createExclusion({
        exclusionId: "invalid_regex",
        matchType: "url_regex",
        pattern: "[unterminated",
      }),
    ]);

    const record = createEvidence({
      appIdentifier: "cursor",
      appName: "Cursor",
      url: "https://github.com/openai/repo",
      urlSummary: {
        host: "github.com",
        normalizedUrl: "https://github.com/openai/repo",
        pathTokens: ["openai", "repo"],
      },
      windowTitle: "repo.ts - INeedABossAgent",
    });

    expect(filter.shouldExclude(record)).toBe(false);
    expect(filter.filterEvidence([record]).audit).toEqual({
      filteredCount: 0,
      keptCount: 1,
      totalCount: 1,
      totalsByMatchType: {
        app: 0,
        domain: 0,
        url_regex: 0,
        window_title_regex: 0,
      },
    });
  });
});
