import { describe, expect, it } from "vitest";

import { messages, parseCoachingExchange } from "../src/index.js";

describe("finalize contract checks", () => {
  it("accepts aggressively formatted GPT output after Swift sanitization", () => {
    const sanitized = `{
  "schema_version": "1.0.0",
  "exchange_type": "morning_plan",
  "local_date": "2026-04-18",
  "total_intended_work_seconds": 14400,
  "notes_for_tracker": "Protect the first block",
  "tasks": [
    {
      "title": "Finish checkout redesign",
      "success_definition": "Ready for implementation handoff.",
      "total_remaining_effort_seconds": 7200,
      "intended_work_seconds_today": 7200,
      "progress_kind": "milestone_based",
      "allowed_support_work": ["Design QA"],
      "likely_detours_that_still_count": ["Stakeholder review"]
    }
  ]
}`;

    expect(parseCoachingExchange(sanitized)).toMatchObject({
      exchange_type: "morning_plan",
      schema_version: "1.0.0",
    });
  });

  it("keeps all notification copy aligned with approved prefixes", () => {
    const allowedPrefixes = ["Check.", "Locked.", "Reset.", "Back."];
    const bodies = [
      messages.hardDrift.body("Checkout redesign"),
      messages.milestoneCandidate.body("Checkout redesign", "PR ready"),
      messages.recoveryAnchor.body("Figma - Checkout"),
      messages.riskPrompt.body("Task pacing is slipping."),
      messages.praise.body(26, "Checkout redesign"),
    ];
    const titles = [
      messages.hardDrift.title,
      messages.milestoneCandidate.title,
      messages.recoveryAnchor.title,
      messages.riskPrompt.title,
      messages.praise.title,
    ];

    for (const copy of [...titles, ...bodies]) {
      expect(allowedPrefixes.some((prefix) => copy.startsWith(prefix))).toBe(true);
    }
  });
});
