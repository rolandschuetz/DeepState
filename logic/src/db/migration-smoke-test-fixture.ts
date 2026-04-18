import type { SqliteMigration } from "./migrations.js";

export const migrationSmokeTestFixtureMigrations: SqliteMigration[] = [
  {
    name: "create smoke fixture settings",
    up: (database) => {
      database.exec(`
        CREATE TABLE smoke_fixture_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);

      database
        .prepare(
          `
            INSERT INTO smoke_fixture_settings (key, value)
            VALUES (?, ?)
          `,
        )
        .run("fixture_name", "migration-smoke-test");
    },
    version: 1,
  },
  {
    name: "create smoke fixture events",
    up: (database) => {
      database.exec(`
        CREATE TABLE smoke_fixture_events (
          event_id INTEGER PRIMARY KEY,
          label TEXT NOT NULL
        )
      `);

      database
        .prepare(
          `
            INSERT INTO smoke_fixture_events (label)
            VALUES (?)
          `,
        )
        .run("fixture_ready");
    },
    version: 2,
  },
];
