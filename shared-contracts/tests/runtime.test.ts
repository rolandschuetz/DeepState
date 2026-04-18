import { describe, expect, it } from "vitest";

import {
  classificationSummarySchema,
  modeSchema,
  runtimeStateSchema,
} from "../src/index.js";

describe("modeSchema", () => {
  it("accepts the canonical top-level runtime modes", () => {
    expect(modeSchema.options).toEqual([
      "booting",
      "no_plan",
      "running",
      "paused",
      "degraded_screenpipe",
      "logic_error",
    ]);
  });
});

describe("runtimeStateSchema", () => {
  it("accepts the canonical five-state runtime classifier values", () => {
    expect(runtimeStateSchema.options).toEqual([
      "aligned",
      "uncertain",
      "soft_drift",
      "hard_drift",
      "paused",
    ]);
  });
});

describe("classificationSummarySchema", () => {
  it("accepts aligned support work", () => {
    expect(
      classificationSummarySchema.parse({
        runtime_state: "aligned",
        confidence: 0.84,
        is_support: true,
      }),
    ).toEqual({
      runtime_state: "aligned",
      confidence: 0.84,
      is_support: true,
    });
  });

  it("rejects non-aligned support classifications", () => {
    expect(() =>
      classificationSummarySchema.parse({
        runtime_state: "soft_drift",
        confidence: 0.4,
        is_support: true,
      }),
    ).toThrow();
  });
});
