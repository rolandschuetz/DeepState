import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import BetterSqlite3 from "better-sqlite3";

export const DEFAULT_SQLITE_BUSY_TIMEOUT_MS = 5_000;

export type SqliteDatabase = InstanceType<typeof BetterSqlite3>;

export type OpenDatabaseOptions = {
  busyTimeoutMs?: number;
  dbPath: string;
};

export const openDatabase = ({
  busyTimeoutMs = DEFAULT_SQLITE_BUSY_TIMEOUT_MS,
  dbPath,
}: OpenDatabaseOptions): SqliteDatabase => {
  mkdirSync(dirname(dbPath), { recursive: true });

  const database = new BetterSqlite3(dbPath);

  database.pragma("journal_mode = WAL");
  database.pragma(`busy_timeout = ${busyTimeoutMs}`);

  return database;
};
