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
  const tempDirectory = mkdtempSync(join(tmpdir(), "ineedabossagent-observation-schema-"));
  const database = openDatabase({
    dbPath: join(tempDirectory, "logic.sqlite"),
  });

  openConnections.push(database);
  return database;
};

describe("observationAppMigrations", () => {
  it("creates the observation and intervention tables", () => {
    const database = createDatabase();

    runStartupMigrations(database, appMigrations);

    const tables = database
      .prepare(
        `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
            AND name IN (
              'observations',
              'context_windows',
              'episodes',
              'classifications',
              'progress_estimates',
              'interventions',
              'intervention_outcomes'
            )
          ORDER BY name ASC
        `,
      )
      .all() as Array<{ name: string }>;

    expect(tables.map((table) => table.name)).toEqual([
      "classifications",
      "context_windows",
      "episodes",
      "intervention_outcomes",
      "interventions",
      "observations",
      "progress_estimates",
    ]);
  });

  it("creates classifications with the explainability JSON column", () => {
    const database = createDatabase();

    runStartupMigrations(database, appMigrations);

    const classificationColumns = database
      .prepare("PRAGMA table_info(classifications)")
      .all() as Array<{ name: string }>;

    expect(classificationColumns.map((column) => column.name)).toEqual([
      "classification_id",
      "context_window_id",
      "classified_at",
      "runtime_state",
      "is_support",
      "confidence_ratio",
      "matched_goal_id",
      "matched_task_id",
      "last_good_context",
      "explainability",
    ]);
  });

  it("creates the observation-layer indexes", () => {
    const database = createDatabase();

    runStartupMigrations(database, appMigrations);

    const indexes = database
      .prepare(
        `
          SELECT name
          FROM sqlite_master
          WHERE type = 'index'
            AND name IN (
              'observations_observed_at_idx',
              'context_windows_started_at_idx',
              'episodes_started_at_idx',
              'classifications_context_window_idx',
              'classifications_classified_at_idx',
              'progress_estimates_plan_task_idx',
              'interventions_created_at_idx',
              'intervention_outcomes_intervention_idx'
            )
          ORDER BY name ASC
        `,
      )
      .all() as Array<{ name: string }>;

    expect(indexes.map((index) => index.name)).toEqual([
      "classifications_classified_at_idx",
      "classifications_context_window_idx",
      "context_windows_started_at_idx",
      "episodes_started_at_idx",
      "intervention_outcomes_intervention_idx",
      "interventions_created_at_idx",
      "observations_observed_at_idx",
      "progress_estimates_plan_task_idx",
    ]);
  });
});
