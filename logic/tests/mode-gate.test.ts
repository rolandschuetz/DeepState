import { describe, expect, it, vi } from "vitest";

import {
  isRuntimeEvaluationEnabled,
  runWhenModeIsRunning,
} from "../src/index.js";

describe("isRuntimeEvaluationEnabled", () => {
  it("only enables evaluations while the system is running", () => {
    expect(isRuntimeEvaluationEnabled("running")).toBe(true);
    expect(isRuntimeEvaluationEnabled("booting")).toBe(false);
    expect(isRuntimeEvaluationEnabled("no_plan")).toBe(false);
    expect(isRuntimeEvaluationEnabled("paused")).toBe(false);
    expect(isRuntimeEvaluationEnabled("degraded_screenpipe")).toBe(false);
    expect(isRuntimeEvaluationEnabled("logic_error")).toBe(false);
  });
});

describe("runWhenModeIsRunning", () => {
  it("executes the evaluator only when mode is running", () => {
    const evaluate = vi.fn(() => "evaluated");
    const fallback = vi.fn(() => "skipped");

    expect(runWhenModeIsRunning("running", evaluate, fallback)).toBe("evaluated");
    expect(runWhenModeIsRunning("paused", evaluate, fallback)).toBe("skipped");
    expect(evaluate).toHaveBeenCalledOnce();
    expect(fallback).toHaveBeenCalledOnce();
  });
});
