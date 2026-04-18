import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  appMigrations,
  buildStartupSystemState,
  DailyPlanRepo,
  openDatabase,
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
  const tempDirectory = mkdtempSync(join(tmpdir(), "ineedabossagent-startup-state-"));
  const database = openDatabase({
    dbPath: join(tempDirectory, "logic.sqlite"),
  });

  runStartupMigrations(database, appMigrations);
  openConnections.push(database);
  return database;
};

describe("buildStartupSystemState", () => {
  it("enters no_plan mode when no imported plan exists", () => {
    const database = createDatabase();

    const systemState = buildStartupSystemState({
      database,
      emittedAt: "2026-04-18T08:00:00Z",
      runtimeSessionId: "d7d724cd-0e26-432e-91eb-c283725b6922",
    });

    expect(systemState.mode).toBe("no_plan");
    expect(systemState.dashboard.plan).toBeNull();
    expect(systemState.menu_bar.active_goal_title).toBeNull();
    expect(systemState.menu_bar.active_task_title).toBeNull();
    expect(systemState.menu_bar.allowed_actions.can_open_morning_flow).toBe(true);
  });

  it("enters running mode when an imported plan exists", () => {
    const database = createDatabase();
    const dailyPlanRepo = new DailyPlanRepo(database);
    const taskRepo = new TaskRepo(database);

    dailyPlanRepo.create({
      importedAt: "2026-04-18T07:15:00Z",
      localDate: "2026-04-18",
      notesForTracker: "Ship the redesign",
      planId: "plan_1",
      totalIntendedWorkSeconds: 14_400,
    });
    taskRepo.create({
      allowedSupportWork: ["Design QA"],
      createdAt: "2026-04-18T07:16:00Z",
      goalId: null,
      intendedWorkSecondsToday: 7_200,
      likelyDetours: ["Stakeholder review"],
      planId: "plan_1",
      progressKind: "milestone_based",
      sortOrder: 1,
      successDefinition: "Ready for handoff",
      taskId: "task_1",
      title: "Finish checkout redesign",
      totalRemainingEffortSeconds: 5_400,
    });

    const systemState = buildStartupSystemState({
      database,
      emittedAt: "2026-04-18T08:00:00Z",
      runtimeSessionId: "d7d724cd-0e26-432e-91eb-c283725b6922",
    });

    expect(systemState.mode).toBe("running");
    expect(systemState.dashboard.plan?.plan_id).toBe("plan_1");
    expect(systemState.dashboard.plan?.tasks).toHaveLength(1);
    expect(systemState.menu_bar.allowed_actions.can_pause).toBe(true);
  });
});
