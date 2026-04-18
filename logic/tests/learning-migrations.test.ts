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
  const tempDirectory = mkdtempSync(join(tmpdir(), "ineedabossagent-learning-schema-"));
  const database = openDatabase({
    dbPath: join(tempDirectory, "logic.sqlite"),
  });

  openConnections.push(database);
  return database;
};

describe("learningAppMigrations", () => {
  it("creates the reduced MVP learning tables", () => {
    const database = createDatabase();

    runStartupMigrations(database, appMigrations);

    const tables = database
      .prepare(
        `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
            AND name IN (
              'daily_memory_notes',
              'durable_rules',
              'user_corrections',
              'signal_weights',
              'rule_proposals'
            )
          ORDER BY name ASC
        `,
      )
      .all() as Array<{ name: string }>;

    expect(tables.map((table) => table.name)).toEqual([
      "daily_memory_notes",
      "durable_rules",
      "rule_proposals",
      "signal_weights",
      "user_corrections",
    ]);
  });

  it("creates the reviewable rule_proposals status column", () => {
    const database = createDatabase();

    runStartupMigrations(database, appMigrations);

    const ruleProposalColumns = database
      .prepare("PRAGMA table_info(rule_proposals)")
      .all() as Array<{ name: string }>;

    expect(ruleProposalColumns.map((column) => column.name)).toEqual([
      "proposal_id",
      "proposal_text",
      "rationale",
      "status",
      "source",
      "created_at",
      "reviewed_at",
    ]);
  });

  it("creates the learning indexes without vector tables", () => {
    const database = createDatabase();

    runStartupMigrations(database, appMigrations);

    const indexes = database
      .prepare(
        `
          SELECT name
          FROM sqlite_master
          WHERE type = 'index'
            AND name IN (
              'daily_memory_notes_local_date_idx',
              'durable_rules_last_validated_idx',
              'user_corrections_created_at_idx',
              'rule_proposals_status_created_idx'
            )
          ORDER BY name ASC
        `,
      )
      .all() as Array<{ name: string }>;
    const vectorTables = database
      .prepare(
        `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
            AND name LIKE '%vector%'
          ORDER BY name ASC
        `,
      )
      .all() as Array<{ name: string }>;

    expect(indexes.map((index) => index.name)).toEqual([
      "daily_memory_notes_local_date_idx",
      "durable_rules_last_validated_idx",
      "rule_proposals_status_created_idx",
      "user_corrections_created_at_idx",
    ]);
    expect(vectorTables).toEqual([]);
  });
});
