import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  baseAppMigrations,
  DEFAULT_OBSERVATION_RETENTION_DAYS,
  DEFAULT_STALE_CONTEXT_WINDOW_RETENTION_HOURS,
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
  const tempDirectory = mkdtempSync(join(tmpdir(), "ineedabossagent-app-schema-"));
  const database = openDatabase({
    dbPath: join(tempDirectory, "logic.sqlite"),
  });

  openConnections.push(database);
  return database;
};

describe("baseAppMigrations", () => {
  it("creates the base persistence tables", () => {
    const database = createDatabase();

    runStartupMigrations(database, baseAppMigrations);

    const tables = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC",
      )
      .all() as Array<{ name: string }>;

    expect(tables.map((table) => table.name)).toEqual([
      "app_settings",
      "privacy_exclusions",
      "runtime_health_events",
      "schema_migration_lock",
      "schema_migrations",
    ]);
  });

  it("creates app_settings with retention defaults and observe_only_ticks_remaining seeded", () => {
    const database = createDatabase();

    runStartupMigrations(database, baseAppMigrations);

    const appSettingsColumns = database
      .prepare("PRAGMA table_info(app_settings)")
      .all() as Array<{ name: string }>;
    const appSettingsRow = database
      .prepare(
        `
          SELECT
            settings_id,
            observe_only_ticks_remaining,
            observation_retention_days,
            stale_context_window_retention_hours
          FROM app_settings
          WHERE settings_id = 1
        `,
      )
      .get() as
      | {
          observation_retention_days: number;
          observe_only_ticks_remaining: number;
          settings_id: number;
          stale_context_window_retention_hours: number;
        }
      | undefined;

    expect(appSettingsColumns.map((column) => column.name)).toEqual([
      "settings_id",
      "observe_only_ticks_remaining",
      "created_at",
      "updated_at",
      "observation_retention_days",
      "stale_context_window_retention_hours",
    ]);
    expect(appSettingsRow).toEqual({
      observation_retention_days: DEFAULT_OBSERVATION_RETENTION_DAYS,
      observe_only_ticks_remaining: 0,
      settings_id: 1,
      stale_context_window_retention_hours:
        DEFAULT_STALE_CONTEXT_WINDOW_RETENTION_HOURS,
    });
  });

  it("creates the privacy and health event indexes", () => {
    const database = createDatabase();

    runStartupMigrations(database, baseAppMigrations);

    const indexes = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL ORDER BY name ASC",
      )
      .all() as Array<{ name: string }>;

    expect(indexes.map((index) => index.name)).toEqual([
      "privacy_exclusions_enabled_idx",
      "runtime_health_events_component_recorded_idx",
    ]);
  });
});
