import type { SqliteMigration } from "./migrations.js";

const SQLITE_NOW_UTC = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

export const baseAppMigrations: SqliteMigration[] = [
  {
    name: "create app_settings table",
    up: (database) => {
      database.exec(`
        CREATE TABLE app_settings (
          settings_id INTEGER PRIMARY KEY CHECK (settings_id = 1),
          observe_only_ticks_remaining INTEGER NOT NULL DEFAULT 0
            CHECK (observe_only_ticks_remaining >= 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        INSERT INTO app_settings (
          settings_id,
          observe_only_ticks_remaining,
          created_at,
          updated_at
        )
        VALUES (1, 0, ${SQLITE_NOW_UTC}, ${SQLITE_NOW_UTC});
      `);
    },
    version: 100,
  },
  {
    name: "create privacy_exclusions table",
    up: (database) => {
      database.exec(`
        CREATE TABLE privacy_exclusions (
          exclusion_id TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          match_type TEXT NOT NULL
            CHECK (match_type IN ('app', 'domain', 'url_regex', 'window_title_regex')),
          pattern TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
          source TEXT NOT NULL
            CHECK (source IN ('system_seed', 'user_defined')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX privacy_exclusions_enabled_idx
          ON privacy_exclusions (enabled);
      `);
    },
    version: 110,
  },
  {
    name: "create runtime_health_events table",
    up: (database) => {
      database.exec(`
        CREATE TABLE runtime_health_events (
          event_id TEXT PRIMARY KEY,
          component TEXT NOT NULL
            CHECK (component IN ('screenpipe', 'database', 'bridge', 'scheduler', 'local_ai')),
          status TEXT NOT NULL
            CHECK (status IN ('ok', 'degraded', 'down')),
          message TEXT,
          metadata_json TEXT,
          recorded_at TEXT NOT NULL
        );

        CREATE INDEX runtime_health_events_component_recorded_idx
          ON runtime_health_events (component, recorded_at DESC);
      `);
    },
    version: 120,
  },
];

export const appMigrations: SqliteMigration[] = [...baseAppMigrations];
