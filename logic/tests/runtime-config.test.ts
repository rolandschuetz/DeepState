import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  isFeatureFlagEnabled,
  loadRuntimeConfig,
} from "../src/index.js";

describe("loadRuntimeConfig", () => {
  it("loads sensible defaults", () => {
    const config = loadRuntimeConfig({});

    expect(config).toEqual({
      dbPath: resolve(process.cwd(), "data/logic.sqlite"),
      featureFlags: [],
      healthTimeouts: {
        bridgeMs: 2_000,
        databaseMs: 2_000,
        screenpipeMs: 5_000,
      },
      logLevel: "info",
      screenpipeBaseUrl: "http://127.0.0.1:3030",
    });
  });

  it("parses overrides and trims feature flags", () => {
    const config = loadRuntimeConfig({
      INEEDABOSSAGENT_BRIDGE_HEALTH_TIMEOUT_MS: "1500",
      INEEDABOSSAGENT_DATABASE_HEALTH_TIMEOUT_MS: "2500",
      INEEDABOSSAGENT_DB_PATH: "/tmp/custom.sqlite",
      INEEDABOSSAGENT_FEATURE_FLAGS: "contracts, diagnostics ,mode-gate",
      INEEDABOSSAGENT_LOG_LEVEL: "debug",
      INEEDABOSSAGENT_SCREENPIPE_BASE_URL: "http://localhost:3030/",
      INEEDABOSSAGENT_SCREENPIPE_HEALTH_TIMEOUT_MS: "4500",
    });

    expect(config).toEqual({
      dbPath: "/tmp/custom.sqlite",
      featureFlags: ["contracts", "diagnostics", "mode-gate"],
      healthTimeouts: {
        bridgeMs: 1_500,
        databaseMs: 2_500,
        screenpipeMs: 4_500,
      },
      logLevel: "debug",
      screenpipeBaseUrl: "http://localhost:3030",
    });
    expect(isFeatureFlagEnabled(config, "diagnostics")).toBe(true);
    expect(isFeatureFlagEnabled(config, "missing")).toBe(false);
  });

  it("rejects invalid config values", () => {
    expect(() =>
      loadRuntimeConfig({
        INEEDABOSSAGENT_SCREENPIPE_BASE_URL: "not-a-url",
      }),
    ).toThrow();
  });
});
