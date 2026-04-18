import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { SqliteDatabase } from "./database.js";
import { runWalCheckpoint } from "./maintenance.js";
import { seedDefaultPrivacyExclusions } from "../privacy/default-privacy-exclusions.js";

const APP_OWNED_TABLES_IN_EXPORT_ORDER = [
  "app_settings",
  "privacy_exclusions",
  "runtime_health_events",
  "daily_plans",
  "goal_contracts",
  "task_contracts",
  "focus_blocks",
  "import_audit_log",
  "observations",
  "context_windows",
  "episodes",
  "classifications",
  "progress_estimates",
  "interventions",
  "intervention_outcomes",
  "daily_memory_notes",
  "durable_rules",
  "user_corrections",
  "signal_weights",
  "rule_proposals",
] as const;

const APP_OWNED_TABLES_IN_PURGE_ORDER = [
  "intervention_outcomes",
  "interventions",
  "progress_estimates",
  "classifications",
  "episodes",
  "context_windows",
  "observations",
  "focus_blocks",
  "task_contracts",
  "goal_contracts",
  "daily_plans",
  "import_audit_log",
  "daily_memory_notes",
  "durable_rules",
  "user_corrections",
  "signal_weights",
  "rule_proposals",
  "runtime_health_events",
  "privacy_exclusions",
  "app_settings",
] as const;

export type AppDataExport = {
  exportedAt: string;
  schemaVersion: "1.0.0";
  tables: Record<string, unknown[]>;
};

const sqlStringLiteral = (value: string): string => `'${value.replaceAll("'", "''")}'`;

export const exportAppDataAsJson = (
  database: SqliteDatabase,
  exportedAt = new Date().toISOString(),
): AppDataExport => ({
  exportedAt,
  schemaVersion: "1.0.0",
  tables: Object.fromEntries(
    APP_OWNED_TABLES_IN_EXPORT_ORDER.map((table) => [
      table,
      database.prepare(`SELECT * FROM ${table}`).all(),
    ]),
  ),
});

export const backupSqliteDatabase = (
  database: SqliteDatabase,
  outputPath: string,
): string => {
  const resolvedOutputPath = resolve(outputPath);

  mkdirSync(dirname(resolvedOutputPath), { recursive: true });
  runWalCheckpoint(database, "RESTART");
  database.exec(`VACUUM INTO ${sqlStringLiteral(resolvedOutputPath)}`);

  return resolvedOutputPath;
};

export const purgeAllAppData = (
  database: SqliteDatabase,
  purgedAt = new Date().toISOString(),
): void => {
  const purgeTransaction = database.transaction(() => {
    for (const table of APP_OWNED_TABLES_IN_PURGE_ORDER) {
      database.exec(`DELETE FROM ${table}`);
    }

    database.exec(`
      INSERT INTO app_settings (
        settings_id,
        observe_only_ticks_remaining,
        created_at,
        updated_at
      )
      VALUES (1, 0, ${sqlStringLiteral(purgedAt)}, ${sqlStringLiteral(purgedAt)})
    `);
  });

  purgeTransaction();
  seedDefaultPrivacyExclusions(database, purgedAt);
};
