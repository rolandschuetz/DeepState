import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  baseAppMigrations,
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

  it("creates app_settings with observe_only_ticks_remaining seeded", () => {
    const database = createDatabase();

    runStartupMigrations(database, baseAppMigrations);

    const appSettingsColumns = database
      .prepare("PRAGMA table_info(app_settings)")
      .all() as Array<{ name: string }>;
    const appSettingsRow = database
      .prepare(
        `
          SELECT settings_id, observe_only_ticks_remaining
          FROM app_settings
          WHERE settings_id = 1
        `,
      )
      .get() as
      | {
          observe_only_ticks_remaining: number;
          settings_id: number;
        }
      | undefined;

    expect(appSettingsColumns.map((column) => column.name)).toEqual([
      "settings_id",
      "observe_only_ticks_remaining",
      "created_at",
      "updated_at",
    ]);
    expect(appSettingsRow).toEqual({
      observe_only_ticks_remaining: 0,
      settings_id: 1,
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
