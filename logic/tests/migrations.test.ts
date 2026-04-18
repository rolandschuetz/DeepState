import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  listAppliedMigrations,
  openDatabase,
  runMigrations,
  type SqliteDatabase,
  type SqliteMigration,
} from "../src/index.js";

const openConnections: SqliteDatabase[] = [];

afterEach(() => {
  for (const database of openConnections.splice(0)) {
    database.close();
  }
});

const createDatabase = (): SqliteDatabase => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ineedabossagent-migrations-"));
  const database = openDatabase({
    dbPath: join(tempDirectory, "logic.sqlite"),
  });

  openConnections.push(database);
  return database;
};

describe("runMigrations", () => {
  it("applies pending migrations in version order and records them", () => {
    const database = createDatabase();
    const migrations: SqliteMigration[] = [
      {
        name: "create plans table",
        up: (db) => {
          db.exec("CREATE TABLE daily_plans (id TEXT PRIMARY KEY)");
        },
        version: 2,
      },
      {
        name: "create settings table",
        up: (db) => {
          db.exec("CREATE TABLE app_settings (id INTEGER PRIMARY KEY)");
        },
        version: 1,
      },
    ];

    const appliedMigrations = runMigrations(database, migrations);
    const tables = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC",
      )
      .all() as Array<{ name: string }>;

    expect(appliedMigrations.map((migration) => migration.version)).toEqual([1, 2]);
    expect(tables.map((table) => table.name)).toEqual([
      "app_settings",
      "daily_plans",
      "schema_migrations",
    ]);
  });

  it("skips migrations that are already recorded", () => {
    const database = createDatabase();
    let runCount = 0;
    const migrations: SqliteMigration[] = [
      {
        name: "create settings table",
        up: (db) => {
          runCount += 1;
          db.exec("CREATE TABLE app_settings (id INTEGER PRIMARY KEY)");
        },
        version: 1,
      },
    ];

    runMigrations(database, migrations);
    runMigrations(database, migrations);

    expect(runCount).toBe(1);
    expect(listAppliedMigrations(database)).toHaveLength(1);
  });

  it("rejects duplicate migration versions", () => {
    const database = createDatabase();

    expect(() =>
      runMigrations(database, [
        {
          name: "first",
          up: () => {},
          version: 1,
        },
        {
          name: "duplicate",
          up: () => {},
          version: 1,
        },
      ]),
    ).toThrow(/Duplicate migration version/);
  });
});
