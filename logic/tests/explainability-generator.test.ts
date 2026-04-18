import { describe, expect, it } from "vitest";

import { buildExplainabilityForDashboard } from "../src/explainability/explainability-generator.js";

describe("buildExplainabilityForDashboard", () => {
  it("returns at most three explainability items with a counterfactual hint", () => {
    const items = buildExplainabilityForDashboard({
      confidenceRatio: 0.72,
      raw: [
        {
          code: "task_token_match",
          detail: "Matched planned task keywords.",
          weight: 0.7,
        },
        {
          code: "context_switch_penalty",
          detail: "Frequent app switching lowered confidence.",
          weight: -0.15,
        },
      ],
    });

    expect(items).toHaveLength(3);
    expect(items[2]?.code).toBe("what_would_change_this");
  });
});
