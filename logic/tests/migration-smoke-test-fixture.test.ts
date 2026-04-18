import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { openDatabase, type SqliteDatabase } from "../src/index.js";

const openConnections: SqliteDatabase[] = [];

afterEach(() => {
  for (const database of openConnections.splice(0)) {
    database.close();
  }
});

describe("migration smoke-test fixture database", () => {
  it("contains the expected migrated schema and seed rows", () => {
    const database = openDatabase({
      dbPath: resolve(
        process.cwd(),
        "../fixtures/databases/migration-smoke-test.sqlite",
      ),
    });
    openConnections.push(database);

    const appliedVersions = database
      .prepare(
        "SELECT version FROM schema_migrations ORDER BY version ASC",
      )
      .all() as Array<{ version: number }>;
    const fixtureName = database
      .prepare(
        "SELECT value FROM smoke_fixture_settings WHERE key = ?",
      )
      .get("fixture_name") as { value: string } | undefined;
    const fixtureEvent = database
      .prepare(
        "SELECT label FROM smoke_fixture_events ORDER BY event_id ASC LIMIT 1",
      )
      .get() as { label: string } | undefined;

    expect(appliedVersions.map((row) => row.version)).toEqual([1, 2]);
    expect(fixtureName?.value).toBe("migration-smoke-test");
    expect(fixtureEvent?.label).toBe("fixture_ready");
  });
});
