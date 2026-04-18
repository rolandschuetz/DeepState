import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  appMigrations,
  buildMorningContextPacket,
  createDefaultSystemState,
  createMorningFlowState,
  generateMorningPrompt,
  handleMorningFlowCommand,
  ImportAuditLogRepo,
  openDatabase,
  parseCoachingExchange,
  parseMorningPlanExchange,
  runStartupMigrations,
  shouldTriggerMorningFlow,
  type SqliteDatabase,
} from "../src/index.js";

const openConnections: SqliteDatabase[] = [];

afterEach(() => {
  for (const database of openConnections.splice(0)) {
    database.close();
  }
});

const createDatabase = (): SqliteDatabase => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ineedabossagent-morning-flow-"));
  const database = openDatabase({
    dbPath: join(tempDirectory, "logic.sqlite"),
  });

  runStartupMigrations(database, appMigrations);
  openConnections.push(database);
  return database;
};

const MORNING_PLAN_JSON = JSON.stringify({
  schema_version: "1.0.0",
  exchange_type: "morning_plan",
  local_date: "2026-04-18",
  total_intended_work_seconds: 14_400,
  notes_for_tracker: "Protect the deep work block.",
  tasks: [
    {
      title: "Finish checkout redesign",
      success_definition: "Ready for implementation handoff.",
      total_remaining_effort_seconds: 7_200,
      intended_work_seconds_today: 7_200,
      progress_kind: "milestone_based",
      allowed_support_work: ["Design QA"],
      likely_detours_that_still_count: ["Stakeholder review"],
    },
    {
      title: "Review billing copy",
      success_definition: "Copy approved for release.",
      total_remaining_effort_seconds: 1_800,
      intended_work_seconds_today: 1_800,
      progress_kind: "artifact_based",
      allowed_support_work: ["Legal review"],
      likely_detours_that_still_count: [],
    },
  ],
});

describe("morning flow planning", () => {
  it("triggers morning flow only once per day until a plan exists", () => {
    expect(
      shouldTriggerMorningFlow(
        {
          hasPlanForToday: false,
          hasTriggeredForDate: false,
          triggeredLocalDate: null,
        },
        {
          localDate: "2026-04-18",
          openedAt: "2026-04-18T04:05:00",
          reason: "first_notebook_open_after_4am",
        },
      ),
    ).toBe(true);

    expect(
      shouldTriggerMorningFlow(
        {
          hasPlanForToday: false,
          hasTriggeredForDate: true,
          triggeredLocalDate: "2026-04-18",
        },
        {
          localDate: "2026-04-18",
          openedAt: "2026-04-18T09:00:00",
          reason: "first_notebook_open_after_4am",
        },
      ),
    ).toBe(false);

    expect(
      shouldTriggerMorningFlow(
        {
          hasPlanForToday: true,
          hasTriggeredForDate: false,
          triggeredLocalDate: null,
        },
        {
          localDate: "2026-04-18",
          openedAt: "2026-04-18T09:00:00",
          reason: "manual_start_day",
        },
      ),
    ).toBe(false);

    expect(
      shouldTriggerMorningFlow(
        {
          hasPlanForToday: false,
          hasTriggeredForDate: false,
          triggeredLocalDate: null,
        },
        {
          localDate: "2026-04-18",
          openedAt: "2026-04-18T03:59:59",
          reason: "first_notebook_open_after_4am",
        },
      ),
    ).toBe(false);
  });

  it("builds a deterministic context packet and prompt", () => {
    const contextPacket = buildMorningContextPacket({
      carryOverContext: ["Finish mobile variants", "Finish mobile variants"],
      declaredMeetings: ["11:00 product sync"],
      durableRulesSafeToSurface: ["Stripe docs research counts as support work."],
      localDate: "2026-04-18",
      openQuestions: ["Do we need stakeholder sign-off?"],
      unresolvedAmbiguities: ["Docs research vs. drift"],
      yesterdayDebriefOutcomes: ["Strong focus before lunch."],
    });
    const prompt = generateMorningPrompt(contextPacket);

    expect(JSON.parse(contextPacket)).toEqual({
      carry_over_context: ["Finish mobile variants"],
      declared_meetings: ["11:00 product sync"],
      durable_rules_safe_to_surface: ["Stripe docs research counts as support work."],
      local_date: "2026-04-18",
      open_questions: ["Do we need stakeholder sign-off?"],
      unresolved_ambiguities: ["Docs research vs. drift"],
      yesterday_debrief_outcomes: ["Strong focus before lunch."],
    });
    expect(prompt).toContain("Return strict JSON only.");
    expect(prompt).toContain(contextPacket);
  });

  it("rejects transcript-like and malformed imports with explicit errors", () => {
    expect(() => parseCoachingExchange("Coach: what matters today?\nUser: shipping.")).toThrow(
      /strict JSON only/,
    );
    expect(() => parseCoachingExchange("{not json")).toThrow(/malformed JSON/i);
    expect(() =>
      parseMorningPlanExchange(
        JSON.stringify({
          schema_version: "2.0.0",
          exchange_type: "morning_plan",
          local_date: "2026-04-18",
          total_intended_work_seconds: 3600,
          notes_for_tracker: null,
          tasks: [],
        }),
      ),
    ).toThrow(/schema validation/i);
  });

  it("creates a morning-flow export state from no_plan mode", () => {
    const state = createMorningFlowState(createDefaultSystemState(), {
      causedByCommandId: "c7942526-57a3-4ccb-a4da-2480b496759c",
      contextPacketText: "{\n  \"local_date\": \"2026-04-18\"\n}",
      emittedAt: "2026-04-18T08:00:00Z",
      promptText: "Return strict JSON only.",
    });

    expect(state.mode).toBe("no_plan");
    expect(state.caused_by_command_id).toBe("c7942526-57a3-4ccb-a4da-2480b496759c");
    expect(state.dashboard.morning_exchange).toEqual({
      status: "available",
      context_packet_text: "{\n  \"local_date\": \"2026-04-18\"\n}",
      prompt_text: "Return strict JSON only.",
    });
  });

  it("imports a validated morning plan, stores audit records, and preserves observations on same-day reset", () => {
    const database = createDatabase();

    database.exec(`
      INSERT INTO observations (
        observation_id,
        observed_at,
        source,
        app_identifier,
        window_title,
        url,
        screenpipe_ref_json,
        payload_json
      ) VALUES (
        'obs_keep',
        '2026-04-18T09:00:00Z',
        'screenpipe_search',
        'cursor',
        'checkout.ts',
        NULL,
        '{}',
        '{}'
      )
    `);

    const firstState = handleMorningFlowCommand({
      command: {
        command_id: "11111111-1111-4111-8111-111111111111",
        kind: "import_coaching_exchange",
        payload: {
          raw_text: MORNING_PLAN_JSON,
          source: "manual_paste",
        },
        schema_version: "1.0.0",
        sent_at: "2026-04-18T08:00:00Z",
      },
      currentState: createDefaultSystemState(),
      database,
      importedAt: "2026-04-18T08:00:00Z",
      runtimeSessionId: "d7d724cd-0e26-432e-91eb-c283725b6922",
    });

    expect(firstState.mode).toBe("running");
    expect(firstState.dashboard.plan?.tasks).toHaveLength(2);
    expect(firstState.dashboard.morning_exchange?.status).toBe("completed");
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM daily_plans").get() as { count: number },
    ).toEqual({ count: 1 });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM goal_contracts").get() as { count: number },
    ).toEqual({ count: 2 });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM task_contracts").get() as { count: number },
    ).toEqual({ count: 2 });

    const secondState = handleMorningFlowCommand({
      command: {
        command_id: "22222222-2222-4222-8222-222222222222",
        kind: "import_coaching_exchange",
        payload: {
          raw_text: MORNING_PLAN_JSON.replace("Protect the deep work block.", "Reset the afternoon around shipping."),
          source: "clipboard",
        },
        schema_version: "1.0.0",
        sent_at: "2026-04-18T12:00:00Z",
      },
      currentState: firstState,
      database,
      importedAt: "2026-04-18T12:00:00Z",
      runtimeSessionId: "d7d724cd-0e26-432e-91eb-c283725b6922",
    });

    expect(secondState.mode).toBe("running");
    expect(secondState.dashboard.plan?.notes_for_tracker).toBe(
      "Reset the afternoon around shipping.",
    );
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM observations").get() as { count: number },
    ).toEqual({ count: 1 });
    expect(new ImportAuditLogRepo(database).listAll()).toHaveLength(2);
    expect(new ImportAuditLogRepo(database).listAll()[1]?.note).toBe(
      "replaced_existing_plan_for_day",
    );
  });
});
