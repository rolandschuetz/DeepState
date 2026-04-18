import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  appMigrations,
  openDatabase,
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
  const tempDirectory = mkdtempSync(join(tmpdir(), "ineedabossagent-planning-schema-"));
  const database = openDatabase({
    dbPath: join(tempDirectory, "logic.sqlite"),
  });

  openConnections.push(database);
  return database;
};

describe("planningAppMigrations", () => {
  it("creates the planning tables", () => {
    const database = createDatabase();

    runStartupMigrations(database, appMigrations);

    const tables = database
      .prepare(
        `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
            AND name IN ('daily_plans', 'goal_contracts', 'task_contracts', 'focus_blocks', 'import_audit_log')
          ORDER BY name ASC
        `,
      )
      .all() as Array<{ name: string }>;

    expect(tables.map((table) => table.name)).toEqual([
      "daily_plans",
      "focus_blocks",
      "goal_contracts",
      "import_audit_log",
      "task_contracts",
    ]);
  });

  it("creates task_contracts with JSON text columns for support-work lists", () => {
    const database = createDatabase();

    runStartupMigrations(database, appMigrations);

    const taskColumns = database
      .prepare("PRAGMA table_info(task_contracts)")
      .all() as Array<{ name: string; type: string }>;

    expect(taskColumns.map((column) => [column.name, column.type])).toEqual([
      ["task_id", "TEXT"],
      ["plan_id", "TEXT"],
      ["goal_id", "TEXT"],
      ["title", "TEXT"],
      ["success_definition", "TEXT"],
      ["total_remaining_effort_seconds", "INTEGER"],
      ["intended_work_seconds_today", "INTEGER"],
      ["progress_kind", "TEXT"],
      ["allowed_support_work_json", "TEXT"],
      ["likely_detours_json", "TEXT"],
      ["sort_order", "INTEGER"],
      ["created_at", "TEXT"],
    ]);
  });

  it("creates import and planning indexes", () => {
    const database = createDatabase();

    runStartupMigrations(database, appMigrations);

    const indexes = database
      .prepare(
        `
          SELECT name
          FROM sqlite_master
          WHERE type = 'index'
            AND name IN (
              'goal_contracts_plan_sort_idx',
              'task_contracts_plan_sort_idx',
              'focus_blocks_plan_starts_idx',
              'import_audit_log_imported_at_idx'
            )
          ORDER BY name ASC
        `,
      )
      .all() as Array<{ name: string }>;

    expect(indexes.map((index) => index.name)).toEqual([
      "focus_blocks_plan_starts_idx",
      "goal_contracts_plan_sort_idx",
      "import_audit_log_imported_at_idx",
      "task_contracts_plan_sort_idx",
    ]);
  });
});
