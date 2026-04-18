import { describe, expect, it } from "vitest";

import { coachingExchangeSchema } from "../src/index.js";

describe("coachingExchangeSchema", () => {
  it("accepts a valid morning plan exchange", () => {
    const exchange = {
      schema_version: "1.0.0",
      exchange_type: "morning_plan",
      local_date: "2026-04-18",
      total_intended_work_seconds: 14400,
      notes_for_tracker: "Protect the first deep-work block.",
      tasks: [
        {
          title: "Finish checkout redesign",
          success_definition: "Ready for implementation handoff.",
          total_remaining_effort_seconds: 7200,
          intended_work_seconds_today: 7200,
          progress_kind: "milestone_based",
          allowed_support_work: ["Design QA"],
          likely_detours_that_still_count: ["Stakeholder review"],
        },
        {
          title: "Review billing copy",
          success_definition: "Copy approved for release.",
          total_remaining_effort_seconds: 1800,
          intended_work_seconds_today: 1800,
          progress_kind: "artifact_based",
          allowed_support_work: ["Legal review"],
          likely_detours_that_still_count: [],
        },
      ],
    };

    expect(coachingExchangeSchema.parse(exchange)).toEqual(exchange);
  });

  it("accepts a valid evening debrief exchange", () => {
    const exchange = {
      schema_version: "1.0.0",
      exchange_type: "evening_debrief",
      local_date: "2026-04-18",
      overall_day_summary: "Good forward motion with one afternoon drift block.",
      task_outcomes: [
        {
          task_title: "Finish checkout redesign",
          did_progress_occur: "partial",
          what_counted_as_real_progress: "Completed the empty and error states.",
          what_was_support_work: "Reviewed implementation constraints with engineering.",
          what_was_misclassified_or_ambiguous: null,
        },
      ],
      new_support_patterns_to_remember: ["Stripe docs research counts as support work."],
      patterns_to_not_remember: [],
      corrections_for_task_boundaries: null,
      carry_forward_to_tomorrow: "Finalize mobile variants.",
      coaching_note_for_tomorrow: "Start with the highest-friction state.",
    };

    expect(coachingExchangeSchema.parse(exchange)).toEqual(exchange);
  });

  it("rejects morning plans whose task totals exceed the daily total", () => {
    expect(() =>
      coachingExchangeSchema.parse({
        schema_version: "1.0.0",
        exchange_type: "morning_plan",
        local_date: "2026-04-18",
        total_intended_work_seconds: 3600,
        notes_for_tracker: null,
        tasks: [
          {
            title: "Task 1",
            success_definition: "Done",
            total_remaining_effort_seconds: null,
            intended_work_seconds_today: 2400,
            progress_kind: "time_based",
            allowed_support_work: [],
            likely_detours_that_still_count: [],
          },
          {
            title: "Task 2",
            success_definition: "Done",
            total_remaining_effort_seconds: null,
            intended_work_seconds_today: 2400,
            progress_kind: "time_based",
            allowed_support_work: [],
            likely_detours_that_still_count: [],
          },
        ],
      }),
    ).toThrow(/must not exceed/);
  });

  it("rejects evening debriefs with more than three task outcomes", () => {
    expect(() =>
      coachingExchangeSchema.parse({
        schema_version: "1.0.0",
        exchange_type: "evening_debrief",
        local_date: "2026-04-18",
        overall_day_summary: "Too many outcomes",
        task_outcomes: [
          {
            task_title: "Task 1",
            did_progress_occur: "yes",
            what_counted_as_real_progress: null,
            what_was_support_work: null,
            what_was_misclassified_or_ambiguous: null,
          },
          {
            task_title: "Task 2",
            did_progress_occur: "yes",
            what_counted_as_real_progress: null,
            what_was_support_work: null,
            what_was_misclassified_or_ambiguous: null,
          },
          {
            task_title: "Task 3",
            did_progress_occur: "yes",
            what_counted_as_real_progress: null,
            what_was_support_work: null,
            what_was_misclassified_or_ambiguous: null,
          },
          {
            task_title: "Task 4",
            did_progress_occur: "yes",
            what_counted_as_real_progress: null,
            what_was_support_work: null,
            what_was_misclassified_or_ambiguous: null,
          },
        ],
        new_support_patterns_to_remember: [],
        patterns_to_not_remember: [],
        corrections_for_task_boundaries: null,
        carry_forward_to_tomorrow: null,
        coaching_note_for_tomorrow: null,
      }),
    ).toThrow();
  });
});
