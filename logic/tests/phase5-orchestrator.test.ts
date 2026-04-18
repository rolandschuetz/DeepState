import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  appMigrations,
  createInitialPhase5Memory,
  openDatabase,
  runPhase5SlowTick,
  runStartupMigrations,
  type SqliteDatabase,
} from "../src/index.js";

const openConnections: SqliteDatabase[] = [];

afterEach(() => {
  for (const database of openConnections.splice(0)) {
    database.close();
  }
});

const createDatabase = (): SqliteDatabase => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ineedabossagent-phase5-"));
  const database = openDatabase({
    dbPath: join(tempDirectory, "logic.sqlite"),
  });

  runStartupMigrations(database, appMigrations);
  openConnections.push(database);
  return database;
};

describe("runPhase5SlowTick", () => {
  it("persists episodes, progress rows, and optional interventions", () => {
    const database = createDatabase();

    database.exec(`
      INSERT INTO daily_plans (plan_id, local_date, imported_at, total_intended_work_seconds, notes_for_tracker)
      VALUES ('plan_1', '2026-04-18', '2026-04-18T08:00:00Z', 14400, NULL);
      INSERT INTO goal_contracts (goal_id, plan_id, title, success_definition, sort_order, created_at)
      VALUES ('goal_1', 'plan_1', 'G', 'S', 1, '2026-04-18T08:00:00Z');
      INSERT INTO task_contracts (
        task_id, plan_id, goal_id, title, success_definition,
        total_remaining_effort_seconds, intended_work_seconds_today, progress_kind,
        allowed_support_work_json, likely_detours_json, sort_order, created_at
      )
      VALUES (
        'task_1', 'plan_1', 'goal_1', 'Task', 'Done',
        8000, 7200, 'time_based',
        '[]', '[]', 1, '2026-04-18T08:00:00Z'
      );
    `);

    const classifiedWindows = [
      {
        confidenceRatio: 0.9,
        contextWindowId: "cw1",
        dwellDurationSeconds: 90,
        endedAt: "2026-04-18T09:01:30Z",
        isSupport: false,
        matchedGoalId: "goal_1",
        matchedTaskId: "task_1",
        runtimeState: "aligned" as const,
        startedAt: "2026-04-18T09:00:00Z",
        topEvidence: ["Figma"],
      },
      {
        confidenceRatio: 0.88,
        contextWindowId: "cw2",
        dwellDurationSeconds: 90,
        endedAt: "2026-04-18T09:03:00Z",
        isSupport: false,
        matchedGoalId: "goal_1",
        matchedTaskId: "task_1",
        runtimeState: "aligned" as const,
        startedAt: "2026-04-18T09:01:31Z",
        topEvidence: ["Figma"],
      },
      {
        confidenceRatio: 0.88,
        contextWindowId: "cw3",
        dwellDurationSeconds: 90,
        endedAt: "2026-04-18T09:04:30Z",
        isSupport: false,
        matchedGoalId: "goal_1",
        matchedTaskId: "task_1",
        runtimeState: "aligned" as const,
        startedAt: "2026-04-18T09:03:01Z",
        topEvidence: ["Figma"],
      },
    ];

    const tasks = [
      {
        allowedSupportWork: [],
        createdAt: "2026-04-18T08:00:00Z",
        goalId: "goal_1",
        intendedWorkSecondsToday: 7_200,
        likelyDetours: [],
        planId: "plan_1",
        progressKind: "time_based" as const,
        sortOrder: 1,
        successDefinition: "Done",
        taskId: "task_1",
        title: "Task",
        totalRemainingEffortSeconds: 8_000,
      },
    ];

    const result = runPhase5SlowTick({
      classificationId: null,
      classificationRuntimeState: "aligned",
      classifiedWindows,
      database,
      estimatedAtIso: "2026-04-18T09:05:00Z",
      focusBlocks: [],
      lastGoodContext: "Figma",
      localDayStartMs: Date.parse("2026-04-18T08:00:00Z"),
      memory: createInitialPhase5Memory("aligned"),
      milestoneScanEnabled: false,
      mode: "running",
      notificationPermissionGranted: true,
      nowIso: "2026-04-18T09:05:00Z",
      nowMs: Date.parse("2026-04-18T09:05:00Z"),
      paused: false,
      planId: "plan_1",
      taskForMilestoneInference: tasks[0] ?? null,
      taskTitle: "Task",
      tasks,
    });

    expect(result.episodeIds.length).toBeGreaterThan(0);
    expect(result.progressEstimateIds.length).toBe(1);

    const episodeCount = database
      .prepare("SELECT COUNT(*) as c FROM episodes")
      .get() as { c: number };

    expect(episodeCount.c).toBeGreaterThan(0);
  });

  it("does not duplicate episodes across repeated ticks and uses accumulated history for progress", () => {
    const database = createDatabase();

    database.exec(`
      INSERT INTO daily_plans (plan_id, local_date, imported_at, total_intended_work_seconds, notes_for_tracker)
      VALUES ('plan_1', '2026-04-18', '2026-04-18T08:00:00Z', 14400, NULL);
      INSERT INTO goal_contracts (goal_id, plan_id, title, success_definition, sort_order, created_at)
      VALUES ('goal_1', 'plan_1', 'G', 'S', 1, '2026-04-18T08:00:00Z');
      INSERT INTO task_contracts (
        task_id, plan_id, goal_id, title, success_definition,
        total_remaining_effort_seconds, intended_work_seconds_today, progress_kind,
        allowed_support_work_json, likely_detours_json, sort_order, created_at
      )
      VALUES (
        'task_1', 'plan_1', 'goal_1', 'Task', 'Done',
        8000, 7200, 'time_based',
        '[]', '[]', 1, '2026-04-18T08:00:00Z'
      );
    `);

    const classifiedWindows = [
      {
        confidenceRatio: 0.9,
        contextWindowId: "cw1",
        dwellDurationSeconds: 90,
        endedAt: "2026-04-18T09:01:30Z",
        isSupport: false,
        matchedGoalId: "goal_1",
        matchedTaskId: "task_1",
        runtimeState: "aligned" as const,
        startedAt: "2026-04-18T09:00:00Z",
        topEvidence: ["Figma"],
      },
      {
        confidenceRatio: 0.88,
        contextWindowId: "cw2",
        dwellDurationSeconds: 90,
        endedAt: "2026-04-18T09:03:00Z",
        isSupport: false,
        matchedGoalId: "goal_1",
        matchedTaskId: "task_1",
        runtimeState: "aligned" as const,
        startedAt: "2026-04-18T09:01:31Z",
        topEvidence: ["Figma"],
      },
      {
        confidenceRatio: 0.88,
        contextWindowId: "cw3",
        dwellDurationSeconds: 90,
        endedAt: "2026-04-18T09:04:30Z",
        isSupport: false,
        matchedGoalId: "goal_1",
        matchedTaskId: "task_1",
        runtimeState: "aligned" as const,
        startedAt: "2026-04-18T09:03:01Z",
        topEvidence: ["Figma"],
      },
    ];

    const tasks = [
      {
        allowedSupportWork: [],
        createdAt: "2026-04-18T08:00:00Z",
        goalId: "goal_1",
        intendedWorkSecondsToday: 7_200,
        likelyDetours: [],
        planId: "plan_1",
        progressKind: "time_based" as const,
        sortOrder: 1,
        successDefinition: "Done",
        taskId: "task_1",
        title: "Task",
        totalRemainingEffortSeconds: 8_000,
      },
    ];

    const memory = createInitialPhase5Memory("aligned");

    runPhase5SlowTick({
      classificationId: null,
      classificationRuntimeState: "aligned",
      classifiedWindows,
      database,
      estimatedAtIso: "2026-04-18T09:05:00Z",
      focusBlocks: [],
      lastGoodContext: "Figma",
      localDayStartMs: Date.parse("2026-04-18T08:00:00Z"),
      memory,
      milestoneScanEnabled: false,
      mode: "running",
      notificationPermissionGranted: true,
      nowIso: "2026-04-18T09:05:00Z",
      nowMs: Date.parse("2026-04-18T09:05:00Z"),
      paused: false,
      planId: "plan_1",
      taskForMilestoneInference: tasks[0] ?? null,
      taskTitle: "Task",
      tasks,
    });

    runPhase5SlowTick({
      classificationId: null,
      classificationRuntimeState: "aligned",
      classifiedWindows,
      database,
      estimatedAtIso: "2026-04-18T09:10:00Z",
      focusBlocks: [],
      lastGoodContext: "Figma",
      localDayStartMs: Date.parse("2026-04-18T08:00:00Z"),
      memory,
      milestoneScanEnabled: false,
      mode: "running",
      notificationPermissionGranted: true,
      nowIso: "2026-04-18T09:10:00Z",
      nowMs: Date.parse("2026-04-18T09:10:00Z"),
      paused: false,
      planId: "plan_1",
      taskForMilestoneInference: tasks[0] ?? null,
      taskTitle: "Task",
      tasks,
    });

    const episodeCount = database
      .prepare("SELECT COUNT(*) as c FROM episodes")
      .get() as { c: number };
    const latestProgress = database
      .prepare(`
        SELECT aligned_seconds
        FROM progress_estimates
        WHERE task_id = 'task_1'
        ORDER BY estimated_at DESC
        LIMIT 1
      `)
      .get() as { aligned_seconds: number };

    expect(episodeCount.c).toBe(1);
    expect(latestProgress.aligned_seconds).toBe(270);
  });
});
