import type { SqliteMigration } from "./migrations.js";

const SQLITE_NOW_UTC = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

export const DEFAULT_OBSERVATION_RETENTION_DAYS = 14;
export const DEFAULT_STALE_CONTEXT_WINDOW_RETENTION_HOURS = 12;

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
  {
    name: "add retention policy settings",
    up: (database) => {
      database.exec(`
        ALTER TABLE app_settings
          ADD COLUMN observation_retention_days INTEGER NOT NULL DEFAULT ${DEFAULT_OBSERVATION_RETENTION_DAYS}
          CHECK (observation_retention_days >= 1 AND observation_retention_days <= 365);

        ALTER TABLE app_settings
          ADD COLUMN stale_context_window_retention_hours INTEGER NOT NULL DEFAULT ${DEFAULT_STALE_CONTEXT_WINDOW_RETENTION_HOURS}
          CHECK (stale_context_window_retention_hours >= 1 AND stale_context_window_retention_hours <= 168);
      `);
    },
    version: 130,
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

export const observationAppMigrations: SqliteMigration[] = [
  {
    name: "create observations table",
    up: (database) => {
      database.exec(`
        CREATE TABLE observations (
          observation_id TEXT PRIMARY KEY,
          observed_at TEXT NOT NULL,
          source TEXT NOT NULL,
          app_identifier TEXT,
          window_title TEXT,
          url TEXT,
          screenpipe_ref_json TEXT NOT NULL,
          payload_json TEXT NOT NULL
        );

        CREATE INDEX observations_observed_at_idx
          ON observations (observed_at DESC);
      `);
    },
    version: 300,
  },
  {
    name: "create context_windows table",
    up: (database) => {
      database.exec(`
        CREATE TABLE context_windows (
          context_window_id TEXT PRIMARY KEY,
          started_at TEXT NOT NULL,
          ended_at TEXT NOT NULL,
          summary_json TEXT NOT NULL,
          source_observation_ids_json TEXT NOT NULL,
          previous_window_id TEXT,
          next_window_id TEXT,
          CHECK (ended_at >= started_at),
          FOREIGN KEY (previous_window_id) REFERENCES context_windows (context_window_id) ON DELETE SET NULL,
          FOREIGN KEY (next_window_id) REFERENCES context_windows (context_window_id) ON DELETE SET NULL
        );

        CREATE INDEX context_windows_started_at_idx
          ON context_windows (started_at DESC);
      `);
    },
    version: 310,
  },
  {
    name: "create episodes table",
    up: (database) => {
      database.exec(`
        CREATE TABLE episodes (
          episode_id TEXT PRIMARY KEY,
          started_at TEXT NOT NULL,
          ended_at TEXT NOT NULL,
          runtime_state TEXT NOT NULL
            CHECK (runtime_state IN ('aligned', 'uncertain', 'soft_drift', 'hard_drift', 'paused')),
          matched_task_id TEXT,
          is_support_work INTEGER NOT NULL DEFAULT 0 CHECK (is_support_work IN (0, 1)),
          confidence_ratio REAL,
          top_evidence_json TEXT NOT NULL,
          context_window_ids_json TEXT NOT NULL,
          CHECK (ended_at >= started_at),
          FOREIGN KEY (matched_task_id) REFERENCES task_contracts (task_id) ON DELETE SET NULL
        );

        CREATE INDEX episodes_started_at_idx
          ON episodes (started_at DESC);
      `);
    },
    version: 320,
  },
  {
    name: "create classifications table",
    up: (database) => {
      database.exec(`
        CREATE TABLE classifications (
          classification_id TEXT PRIMARY KEY,
          context_window_id TEXT NOT NULL,
          classified_at TEXT NOT NULL,
          runtime_state TEXT NOT NULL
            CHECK (runtime_state IN ('aligned', 'uncertain', 'soft_drift', 'hard_drift', 'paused')),
          is_support INTEGER NOT NULL DEFAULT 0 CHECK (is_support IN (0, 1)),
          confidence_ratio REAL,
          matched_goal_id TEXT,
          matched_task_id TEXT,
          last_good_context TEXT,
          FOREIGN KEY (context_window_id) REFERENCES context_windows (context_window_id) ON DELETE CASCADE,
          FOREIGN KEY (matched_goal_id) REFERENCES goal_contracts (goal_id) ON DELETE SET NULL,
          FOREIGN KEY (matched_task_id) REFERENCES task_contracts (task_id) ON DELETE SET NULL
        );

        CREATE INDEX classifications_context_window_idx
          ON classifications (context_window_id);
        CREATE INDEX classifications_classified_at_idx
          ON classifications (classified_at DESC);
      `);
    },
    version: 330,
  },
  {
    name: "create progress_estimates table",
    up: (database) => {
      database.exec(`
        CREATE TABLE progress_estimates (
          progress_estimate_id TEXT PRIMARY KEY,
          plan_id TEXT NOT NULL,
          task_id TEXT,
          estimated_at TEXT NOT NULL,
          progress_ratio REAL,
          confidence_ratio REAL,
          aligned_seconds INTEGER NOT NULL DEFAULT 0 CHECK (aligned_seconds >= 0),
          support_seconds INTEGER NOT NULL DEFAULT 0 CHECK (support_seconds >= 0),
          drift_seconds INTEGER NOT NULL DEFAULT 0 CHECK (drift_seconds >= 0),
          eta_remaining_seconds INTEGER
            CHECK (eta_remaining_seconds IS NULL OR eta_remaining_seconds >= 0),
          latest_status_text TEXT NOT NULL,
          FOREIGN KEY (plan_id) REFERENCES daily_plans (plan_id) ON DELETE CASCADE,
          FOREIGN KEY (task_id) REFERENCES task_contracts (task_id) ON DELETE SET NULL
        );

        CREATE INDEX progress_estimates_plan_task_idx
          ON progress_estimates (plan_id, estimated_at DESC);
      `);
    },
    version: 340,
  },
  {
    name: "create interventions and intervention_outcomes tables",
    up: (database) => {
      database.exec(`
        CREATE TABLE interventions (
          intervention_id TEXT PRIMARY KEY,
          created_at TEXT NOT NULL,
          kind TEXT NOT NULL,
          presentation TEXT NOT NULL,
          severity TEXT NOT NULL,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          actions_json TEXT NOT NULL,
          suppress_native_notification INTEGER NOT NULL CHECK (suppress_native_notification IN (0, 1)),
          suppression_reason TEXT,
          dedupe_key TEXT NOT NULL,
          expires_at TEXT,
          source_classification_id TEXT,
          FOREIGN KEY (source_classification_id) REFERENCES classifications (classification_id) ON DELETE SET NULL
        );

        CREATE TABLE intervention_outcomes (
          outcome_id TEXT PRIMARY KEY,
          intervention_id TEXT NOT NULL,
          action_id TEXT,
          outcome_kind TEXT NOT NULL,
          recorded_at TEXT NOT NULL,
          note TEXT,
          FOREIGN KEY (intervention_id) REFERENCES interventions (intervention_id) ON DELETE CASCADE
        );

        CREATE INDEX interventions_created_at_idx
          ON interventions (created_at DESC);
        CREATE INDEX intervention_outcomes_intervention_idx
          ON intervention_outcomes (intervention_id, recorded_at DESC);
      `);
    },
    version: 350,
  },
  {
    name: "add explainability column to classifications",
    up: (database) => {
      database.exec(`
        ALTER TABLE classifications
        ADD COLUMN explainability TEXT NOT NULL DEFAULT '[]'
          CHECK (json_valid(explainability));
      `);
    },
    version: 360,
  },
  {
    name: "add risk_level to progress_estimates",
    up: (database) => {
      database.exec(`
        ALTER TABLE progress_estimates
        ADD COLUMN risk_level TEXT
          CHECK (risk_level IS NULL OR risk_level IN ('low', 'medium', 'high'));
      `);
    },
    version: 370,
  },
  {
    name: "seed observe-only grace ticks once",
    up: (database) => {
      database.exec(`
        ALTER TABLE app_settings
        ADD COLUMN observe_only_seed_version INTEGER NOT NULL DEFAULT 0;

        UPDATE app_settings
        SET
          observe_only_ticks_remaining = 75,
          observe_only_seed_version = 1
        WHERE settings_id = 1
          AND observe_only_seed_version = 0;
      `);
    },
    version: 380,
  },
];

export const learningAppMigrations: SqliteMigration[] = [
  {
    name: "create daily_memory_notes table",
    up: (database) => {
      database.exec(`
        CREATE TABLE daily_memory_notes (
          note_id TEXT PRIMARY KEY,
          local_date TEXT NOT NULL,
          summary_text TEXT NOT NULL,
          source TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE INDEX daily_memory_notes_local_date_idx
          ON daily_memory_notes (local_date DESC);
      `);
    },
    version: 400,
  },
  {
    name: "create durable_rules table",
    up: (database) => {
      database.exec(`
        CREATE TABLE durable_rules (
          rule_id TEXT PRIMARY KEY,
          source TEXT NOT NULL,
          rule_text TEXT NOT NULL,
          confidence REAL NOT NULL,
          recency INTEGER NOT NULL DEFAULT 0 CHECK (recency >= 0),
          last_validated_at TEXT,
          created_at TEXT NOT NULL
        );

        CREATE INDEX durable_rules_last_validated_idx
          ON durable_rules (last_validated_at DESC);
      `);
    },
    version: 410,
  },
  {
    name: "create user_corrections table",
    up: (database) => {
      database.exec(`
        CREATE TABLE user_corrections (
          correction_id TEXT PRIMARY KEY,
          correction_kind TEXT NOT NULL,
          related_entity_id TEXT,
          summary_text TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE INDEX user_corrections_created_at_idx
          ON user_corrections (created_at DESC);
      `);
    },
    version: 420,
  },
  {
    name: "create signal_weights table",
    up: (database) => {
      database.exec(`
        CREATE TABLE signal_weights (
          signal_key TEXT PRIMARY KEY,
          weight REAL NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
    },
    version: 430,
  },
  {
    name: "create rule_proposals table",
    up: (database) => {
      database.exec(`
        CREATE TABLE rule_proposals (
          proposal_id TEXT PRIMARY KEY,
          proposal_text TEXT NOT NULL,
          rationale TEXT NOT NULL,
          status TEXT NOT NULL
            CHECK (status IN ('pending', 'accepted', 'dismissed')),
          source TEXT NOT NULL,
          created_at TEXT NOT NULL,
          reviewed_at TEXT
        );

        CREATE INDEX rule_proposals_status_created_idx
          ON rule_proposals (status, created_at DESC);
      `);
    },
    version: 440,
  },
  {
    name: "create pending_clarifications table",
    up: (database) => {
      database.exec(`
        CREATE TABLE pending_clarifications (
          clarification_id TEXT PRIMARY KEY,
          plan_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          expires_at TEXT,
          status TEXT NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'resolved', 'dismissed')),
          hud_json TEXT NOT NULL,
          evidence_json TEXT NOT NULL
        );

        CREATE INDEX pending_clarifications_plan_status_idx
          ON pending_clarifications (plan_id, status, created_at DESC);
      `);
    },
    version: 450,
  },
  {
    name: "add morning flow trigger tracking to app settings",
    up: (database) => {
      database.exec(`
        ALTER TABLE app_settings
          ADD COLUMN morning_flow_last_triggered_local_date TEXT;

        ALTER TABLE app_settings
          ADD COLUMN morning_flow_last_triggered_at TEXT;
      `);
    },
    version: 460,
  },
];

export const appMigrations: SqliteMigration[] = [
  ...baseAppMigrations,
  ...planningAppMigrations,
  ...observationAppMigrations,
  ...learningAppMigrations,
];
