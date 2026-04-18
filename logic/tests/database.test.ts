import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_SQLITE_BUSY_TIMEOUT_MS,
  openDatabase,
  type SqliteDatabase,
} from "../src/index.js";

const openConnections: SqliteDatabase[] = [];

afterEach(() => {
  for (const database of openConnections.splice(0)) {
    database.close();
  }
});

describe("openDatabase", () => {
  it("creates a database with WAL journal mode and the default busy timeout", () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "ineedabossagent-db-"));
    const database = openDatabase({
      dbPath: join(tempDirectory, "logic.sqlite"),
    });
    openConnections.push(database);

    const journalMode = database.pragma("journal_mode", {
      simple: true,
    });
    const busyTimeout = database.pragma("busy_timeout", {
      simple: true,
    });

    expect(journalMode).toBe("wal");
    expect(busyTimeout).toBe(DEFAULT_SQLITE_BUSY_TIMEOUT_MS);
  });

  it("allows the busy timeout to be overridden", () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "ineedabossagent-db-"));
    const database = openDatabase({
      busyTimeoutMs: 8_500,
      dbPath: join(tempDirectory, "logic.sqlite"),
    });
    openConnections.push(database);

    expect(
      database.pragma("busy_timeout", {
        simple: true,
      }),
    ).toBe(8_500);
  });
});
