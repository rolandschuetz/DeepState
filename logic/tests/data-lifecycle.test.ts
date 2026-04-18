import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  appMigrations,
  backupSqliteDatabase,
  buildStartupSystemState,
  DailyPlanRepo,
  exportAppDataAsJson,
  openDatabase,
  purgeAllAppData,
  runStartupMigrations,
  seedDefaultPrivacyExclusions,
  type SqliteDatabase,
} from "../src/index.js";

const openConnections: SqliteDatabase[] = [];

afterEach(() => {
  for (const database of openConnections.splice(0)) {
    database.close();
  }
});

const createDatabase = (): { database: SqliteDatabase; directory: string } => {
  const directory = mkdtempSync(join(tmpdir(), "ineedabossagent-data-lifecycle-"));
  const database = openDatabase({
    dbPath: join(directory, "logic.sqlite"),
  });

  runStartupMigrations(database, appMigrations);
  openConnections.push(database);
  return { database, directory };
};

describe("data lifecycle utilities", () => {
  it("exports app-owned tables as JSON", () => {
    const { database } = createDatabase();

    new DailyPlanRepo(database).create({
      importedAt: "2026-04-18T08:00:00Z",
      localDate: "2026-04-18",
      notesForTracker: "Tracker note",
      planId: "plan_1",
      totalIntendedWorkSeconds: 14_400,
    });

    const exported = exportAppDataAsJson(
      database,
      "2026-04-18T12:00:00Z",
    );

    expect(exported.exportedAt).toBe("2026-04-18T12:00:00Z");
    expect(exported.schemaVersion).toBe("1.0.0");
    expect(exported.tables.daily_plans).toHaveLength(1);
    expect(exported.tables.privacy_exclusions).toHaveLength(0);
  });

  it("creates a SQLite backup file", () => {
    const { database, directory } = createDatabase();
    const backupPath = join(directory, "backup", "logic-backup.sqlite");

    expect(backupSqliteDatabase(database, backupPath)).toBe(backupPath);
    expect(existsSync(backupPath)).toBe(true);
  });

  it("purges app-owned data and reseeds privacy exclusions", () => {
    const { database } = createDatabase();
    const dailyPlanRepo = new DailyPlanRepo(database);

    dailyPlanRepo.create({
      importedAt: "2026-04-18T08:00:00Z",
      localDate: "2026-04-18",
      notesForTracker: "Tracker note",
      planId: "plan_1",
      totalIntendedWorkSeconds: 14_400,
    });
    seedDefaultPrivacyExclusions(database, "2026-04-18T09:00:00Z");

    purgeAllAppData(database, "2026-04-18T10:00:00Z");

    const startupState = buildStartupSystemState({
      database,
      emittedAt: "2026-04-18T10:05:00Z",
    });
    const exported = exportAppDataAsJson(
      database,
      "2026-04-18T10:06:00Z",
    );

    expect(startupState.mode).toBe("no_plan");
    expect(exported.tables.daily_plans).toHaveLength(0);
    expect(exported.tables.rule_proposals).toHaveLength(0);
    expect(exported.tables.privacy_exclusions).toHaveLength(4);
    expect(exported.tables.app_settings).toHaveLength(1);
  });
});
