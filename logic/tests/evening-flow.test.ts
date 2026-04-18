import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  appMigrations,
  buildEveningDebriefPacket,
  buildStartupSystemState,
  DailyPlanRepo,
  GoalContractRepo,
  handleMorningFlowCommand,
  hasAcceptedEveningDebriefForLocalDate,
  ImportAuditLogRepo,
  importEveningDebriefExchange,
  MemoryRepo,
  openDatabase,
  parseEveningDebriefExchange,
  ProgressRepo,
  RuleProposalRepo,
  runStartupMigrations,
  TaskRepo,
  type SqliteDatabase,
} from "../src/index.js";

const openConnections: SqliteDatabase[] = [];

afterEach(() => {
  for (const database of openConnections.splice(0)) {
    database.close();
  }
});

const createDatabase = (): SqliteDatabase => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ineedabossagent-evening-flow-"));
  const database = openDatabase({
    dbPath: join(tempDirectory, "logic.sqlite"),
  });

  runStartupMigrations(database, appMigrations);
  openConnections.push(database);
  return database;
};

const seedPlan = (database: SqliteDatabase): void => {
  const dailyPlanRepo = new DailyPlanRepo(database);

  dailyPlanRepo.create({
    importedAt: "2026-04-18T08:00:00Z",
    localDate: "2026-04-18",
    notesForTracker: "Protect shipping time.",
    planId: "plan_1",
    totalIntendedWorkSeconds: 14_400,
  });

  new GoalContractRepo(database).create({
    createdAt: "2026-04-18T08:00:00Z",
    goalId: "goal_1",
    planId: "plan_1",
    sortOrder: 1,
    successDefinition: "Ship the redesign",
    title: "Checkout redesign",
  });

  new TaskRepo(database).create({
    allowedSupportWork: ["Design QA"],
    createdAt: "2026-04-18T08:05:00Z",
    goalId: "goal_1",
    intendedWorkSecondsToday: 7200,
    likelyDetours: ["Stakeholder review"],
    planId: "plan_1",
    progressKind: "milestone_based",
    sortOrder: 1,
    successDefinition: "Ready for handoff",
    taskId: "task_1",
    title: "Finish checkout redesign",
    totalRemainingEffortSeconds: 5400,
  });
};

const EVENING_DEBRIEF_JSON = JSON.stringify({
  schema_version: "1.0.0",
  exchange_type: "evening_debrief",
  local_date: "2026-04-18",
  overall_day_summary: "Solid progress on checkout; billing review slipped.",
  task_outcomes: [
    {
      did_progress_occur: "partial" as const,
      task_title: "Finish checkout redesign",
      what_counted_as_real_progress: "Figma states finalized",
      what_was_misclassified_or_ambiguous: "Research tabs looked like drift",
      what_was_support_work: "Short design QA",
    },
  ],
  new_support_patterns_to_remember: ["Stripe docs while coding checkout counts as support"],
  patterns_to_not_remember: ["Email triage during deep work"],
  corrections_for_task_boundaries: "Treat launch-channel Slack as launch coordination.",
  carry_forward_to_tomorrow: "Finish billing copy review first.",
  coaching_note_for_tomorrow: "Keep support work explicit in the morning plan.",
});

describe("evening flow", () => {
  it("builds an evidence-rich evening debrief packet from canonical rows", () => {
    const database = createDatabase();
    seedPlan(database);

    database.exec(`
      INSERT INTO episodes (
        episode_id,
        started_at,
        ended_at,
        runtime_state,
        matched_task_id,
        is_support_work,
        confidence_ratio,
        top_evidence_json,
        context_window_ids_json
      ) VALUES (
        'episode_1',
        '2026-04-18T09:00:00Z',
        '2026-04-18T09:05:00Z',
        'uncertain',
        'task_1',
        0,
        0.42,
        '["Research drift", "Context switches in window: 4"]',
        '["window_1"]'
      )
    `);

    new ProgressRepo(database).create({
      alignedSeconds: 1200,
      confidenceRatio: 0.63,
      driftSeconds: 300,
      estimatedAt: "2026-04-18T18:00:00Z",
      etaRemainingSeconds: 4200,
      latestStatusText: "Watch task progress.",
      planId: "plan_1",
      progressEstimateId: "progress_1",
      progressRatio: 0.33,
      riskLevel: "medium",
      supportSeconds: 150,
      taskId: "task_1",
    });

    const plan = new DailyPlanRepo(database).getById("plan_1");
    expect(plan).not.toBeNull();

    const packet = JSON.parse(
      buildEveningDebriefPacket({
        database,
        localDate: "2026-04-18",
        plan: plan!,
        planId: "plan_1",
      }),
    ) as {
      estimate_vs_actual: Array<{
        latest_progress_snapshot: { risk_level: string } | null;
      }>;
      drift_and_ambiguous_blocks: Array<{
        evidence_bullets: string[];
      }>;
      unresolved_ambiguities: string[];
      suggested_learning_candidates: string[];
    };

    expect(packet.estimate_vs_actual[0]?.latest_progress_snapshot?.risk_level).toBe("medium");
    expect(packet.drift_and_ambiguous_blocks[0]?.evidence_bullets).toContain("Research drift");
    expect(packet.unresolved_ambiguities).toHaveLength(1);
    expect(packet.suggested_learning_candidates[0]).toContain("uncertain");
  });

  it("parses only evening debrief payloads through the unified coaching parser", () => {
    expect(() =>
      parseEveningDebriefExchange(
        JSON.stringify({
          exchange_type: "morning_plan",
          local_date: "2026-04-18",
          schema_version: "1.0.0",
          notes_for_tracker: null,
          tasks: [
            {
              allowed_support_work: [],
              intended_work_seconds_today: 3600,
              likely_detours_that_still_count: [],
              progress_kind: "time_based",
              success_definition: "Done",
              title: "Task 1",
              total_remaining_effort_seconds: 3600,
            },
          ],
          total_intended_work_seconds: 3600,
        }),
      ),
    ).toThrow(/Expected an evening_debrief payload/);
  });

  it("imports evening debriefs into daily memory, rule proposals, and audit history", () => {
    const database = createDatabase();
    seedPlan(database);

    const state = importEveningDebriefExchange({
      commandId: "33333333-3333-4333-8333-333333333333",
      database,
      exchange: parseEveningDebriefExchange(EVENING_DEBRIEF_JSON),
      importedAt: "2026-04-18T19:00:00Z",
      runtimeSessionId: "d7d724cd-0e26-432e-91eb-c283725b6922",
      source: "manual_paste",
    });

    const memoryRepo = new MemoryRepo(database);
    const ruleProposalRepo = new RuleProposalRepo(database);
    const auditLogRepo = new ImportAuditLogRepo(database);

    expect(state.dashboard.evening_exchange?.status).toBe("completed");
    expect(memoryRepo.listDailyMemoryNotes()).toHaveLength(1);
    expect(memoryRepo.listDailyMemoryNotes()[0]?.summaryText).toContain("Carry forward");
    expect(ruleProposalRepo.listAll()).toHaveLength(3);
    expect(
      auditLogRepo.listAll().some((entry) => entry.exchangeType === "evening_debrief"),
    ).toBe(true);
  });

  it("surfaces completed evening state and review queue on startup after import", () => {
    const database = createDatabase();
    seedPlan(database);

    importEveningDebriefExchange({
      database,
      exchange: parseEveningDebriefExchange(EVENING_DEBRIEF_JSON),
      importedAt: "2026-04-18T20:00:00Z",
      source: "clipboard",
    });

    const state = buildStartupSystemState({
      database,
      emittedAt: "2026-04-18T20:05:00Z",
    });

    expect(hasAcceptedEveningDebriefForLocalDate(database, "2026-04-18")).toBe(true);
    expect(state.dashboard.evening_exchange?.status).toBe("completed");
    expect(state.dashboard.evening_exchange?.debrief_packet_text).toBeNull();
    expect(state.dashboard.review_queue.length).toBe(3);
  });

  it("routes evening imports through the unified import command handler", () => {
    const database = createDatabase();
    seedPlan(database);

    const base = buildStartupSystemState({ database, emittedAt: "2026-04-18T19:00:00Z" });

    const next = handleMorningFlowCommand({
      command: {
        command_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        kind: "import_coaching_exchange",
        payload: { raw_text: EVENING_DEBRIEF_JSON, source: "manual_paste" },
        schema_version: "1.0.0",
        sent_at: "2026-04-18T19:30:00Z",
      },
      currentState: base,
      database,
    });

    expect(next.dashboard.evening_exchange?.status).toBe("completed");
  });
});
