import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isSqliteBusyError,
  openDatabase,
  runWalCheckpoint,
  withSqliteBusyRetry,
  type SqliteDatabase,
} from "../src/index.js";

const openConnections: SqliteDatabase[] = [];

afterEach(() => {
  for (const database of openConnections.splice(0)) {
    database.close();
  }
});

const createDatabase = (): SqliteDatabase => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ineedabossagent-maintenance-"));
  const database = openDatabase({
    dbPath: join(tempDirectory, "logic.sqlite"),
  });

  openConnections.push(database);
  return database;
};

describe("runWalCheckpoint", () => {
  it("returns checkpoint statistics", () => {
    const database = createDatabase();

    database.exec(`
      CREATE TABLE wal_test (id INTEGER PRIMARY KEY, value TEXT);
      INSERT INTO wal_test (value) VALUES ('a'), ('b'), ('c');
    `);

    const result = runWalCheckpoint(database, "PASSIVE");

    expect(result.busy).toBeTypeOf("number");
    expect(result.checkpointedFrames).toBeTypeOf("number");
    expect(result.logFrames).toBeTypeOf("number");
  });
});

describe("withSqliteBusyRetry", () => {
  it("retries SQLITE_BUSY errors with backoff", async () => {
    const sleep = vi.fn(async () => {});
    const operation = vi
      .fn<() => string>()
      .mockImplementationOnce(() => {
        const error = new Error("SQLITE_BUSY: database is locked") as Error & {
          code?: string;
        };
        error.code = "SQLITE_BUSY";
        throw error;
      })
      .mockImplementationOnce(() => "ok");

    await expect(
      withSqliteBusyRetry(operation, {
        initialDelayMs: 10,
        maxAttempts: 3,
        sleep,
      }),
    ).resolves.toBe("ok");

    expect(operation).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(10);
  });

  it("does not swallow non-busy errors", async () => {
    const error = new Error("boom");

    await expect(
      withSqliteBusyRetry(() => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(isSqliteBusyError(error)).toBe(false);
  });
});
