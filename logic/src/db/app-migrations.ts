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

export const planningAppMigrations: SqliteMigration[] = [
  {
    name: "create daily_plans table",
    up: (database) => {
      database.exec(`
        CREATE TABLE daily_plans (
          plan_id TEXT PRIMARY KEY,
          local_date TEXT NOT NULL UNIQUE,
          imported_at TEXT NOT NULL,
          total_intended_work_seconds INTEGER NOT NULL
            CHECK (total_intended_work_seconds > 0),
          notes_for_tracker TEXT
        );
      `);
    },
    version: 200,
  },
  {
    name: "create goal_contracts table",
    up: (database) => {
      database.exec(`
        CREATE TABLE goal_contracts (
          goal_id TEXT PRIMARY KEY,
          plan_id TEXT NOT NULL,
          title TEXT NOT NULL,
          success_definition TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          FOREIGN KEY (plan_id) REFERENCES daily_plans (plan_id) ON DELETE CASCADE
        );

        CREATE INDEX goal_contracts_plan_sort_idx
          ON goal_contracts (plan_id, sort_order ASC);
      `);
    },
    version: 210,
  },
  {
    name: "create task_contracts table",
    up: (database) => {
      database.exec(`
        CREATE TABLE task_contracts (
          task_id TEXT PRIMARY KEY,
          plan_id TEXT NOT NULL,
          goal_id TEXT,
          title TEXT NOT NULL,
          success_definition TEXT NOT NULL,
          total_remaining_effort_seconds INTEGER
            CHECK (total_remaining_effort_seconds IS NULL OR total_remaining_effort_seconds >= 0),
          intended_work_seconds_today INTEGER NOT NULL
            CHECK (intended_work_seconds_today >= 0),
          progress_kind TEXT NOT NULL
            CHECK (progress_kind IN ('time_based', 'milestone_based', 'artifact_based', 'hybrid')),
          allowed_support_work_json TEXT NOT NULL,
          likely_detours_json TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          FOREIGN KEY (plan_id) REFERENCES daily_plans (plan_id) ON DELETE CASCADE,
          FOREIGN KEY (goal_id) REFERENCES goal_contracts (goal_id) ON DELETE SET NULL
        );

        CREATE INDEX task_contracts_plan_sort_idx
          ON task_contracts (plan_id, sort_order ASC);
      `);
    },
    version: 220,
  },
  {
    name: "create focus_blocks table",
    up: (database) => {
      database.exec(`
        CREATE TABLE focus_blocks (
          focus_block_id TEXT PRIMARY KEY,
          plan_id TEXT NOT NULL,
          task_id TEXT,
          title TEXT NOT NULL,
          starts_at TEXT NOT NULL,
          ends_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          CHECK (ends_at > starts_at),
          FOREIGN KEY (plan_id) REFERENCES daily_plans (plan_id) ON DELETE CASCADE,
          FOREIGN KEY (task_id) REFERENCES task_contracts (task_id) ON DELETE SET NULL
        );

        CREATE INDEX focus_blocks_plan_starts_idx
          ON focus_blocks (plan_id, starts_at ASC);
      `);
    },
    version: 230,
  },
  {
    name: "create import_audit_log table",
    up: (database) => {
      database.exec(`
        CREATE TABLE import_audit_log (
          audit_id TEXT PRIMARY KEY,
          source TEXT NOT NULL,
          exchange_type TEXT NOT NULL
            CHECK (exchange_type IN ('morning_plan', 'evening_debrief')),
          schema_version TEXT NOT NULL,
          local_date TEXT NOT NULL,
          accepted INTEGER NOT NULL CHECK (accepted IN (0, 1)),
          payload_json TEXT NOT NULL,
          imported_at TEXT NOT NULL,
          note TEXT
        );

        CREATE INDEX import_audit_log_imported_at_idx
          ON import_audit_log (imported_at DESC);
      `);
    },
    version: 240,
  },
];

export const appMigrations: SqliteMigration[] = [
  ...baseAppMigrations,
  ...planningAppMigrations,
];
