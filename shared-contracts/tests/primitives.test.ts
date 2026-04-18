import { describe, expect, it } from "vitest";

import {
  confidenceSchema,
  healthStatusSchema,
  timestampSchema,
} from "../src/index.js";

describe("timestampSchema", () => {
  it("accepts UTC timestamps", () => {
    expect(timestampSchema.parse("2026-04-18T08:42:11Z")).toBe(
      "2026-04-18T08:42:11Z",
    );
    expect(timestampSchema.parse("2026-04-18T08:42:11.123Z")).toBe(
      "2026-04-18T08:42:11.123Z",
    );
  });

  it("rejects local and offset timestamps", () => {
    expect(() => timestampSchema.parse("2026-04-18T08:42:11")).toThrow();
    expect(() => timestampSchema.parse("2026-04-18T08:42:11+02:00")).toThrow();
  });
});

describe("confidenceSchema", () => {
  it("accepts inclusive 0 to 1 ratios", () => {
    expect(confidenceSchema.parse(0)).toBe(0);
    expect(confidenceSchema.parse(0.5)).toBe(0.5);
    expect(confidenceSchema.parse(1)).toBe(1);
  });

  it("rejects values outside the ratio range", () => {
    expect(() => confidenceSchema.parse(-0.01)).toThrow();
    expect(() => confidenceSchema.parse(1.01)).toThrow();
  });
});

describe("healthStatusSchema", () => {
  it("accepts the canonical health states", () => {
    expect(healthStatusSchema.options).toEqual(["ok", "degraded", "down"]);
  });

  it("rejects unknown health states", () => {
    expect(() => healthStatusSchema.parse("warning")).toThrow();
  });
});
