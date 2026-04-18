import type { SqliteDatabase } from "./database.js";

export type WalCheckpointMode = "PASSIVE" | "RESTART" | "TRUNCATE";

export type WalCheckpointResult = {
  busy: number;
  checkpointedFrames: number;
  logFrames: number;
};

export type SqliteBusyRetryOptions = {
  initialDelayMs?: number;
  maxAttempts?: number;
  sleep?: (delayMs: number) => Promise<void>;
};

const defaultSleep = async (delayMs: number): Promise<void> =>
  await new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });

export const runWalCheckpoint = (
  database: SqliteDatabase,
  mode: WalCheckpointMode = "PASSIVE",
): WalCheckpointResult => {
  const result = database
    .prepare(`PRAGMA wal_checkpoint(${mode})`)
    .get() as
    | {
        busy: number;
        checkpointed: number;
        log: number;
      }
    | undefined;

  if (result === undefined) {
    throw new Error("SQLite did not return a WAL checkpoint result.");
  }

  return {
    busy: result.busy,
    checkpointedFrames: result.checkpointed,
    logFrames: result.log,
  };
};

export const isSqliteBusyError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.message.includes("SQLITE_BUSY") ||
    (typeof (error as unknown as { code?: unknown }).code === "string" &&
      (error as unknown as { code: string }).code === "SQLITE_BUSY"));

export const withSqliteBusyRetry = async <T>(
  operation: () => T | Promise<T>,
  {
    initialDelayMs = 25,
    maxAttempts = 3,
    sleep = defaultSleep,
  }: SqliteBusyRetryOptions = {},
): Promise<T> => {
  let attempt = 0;
  let delayMs = initialDelayMs;

  while (true) {
    attempt += 1;

    try {
      return await operation();
    } catch (error) {
      if (!isSqliteBusyError(error) || attempt >= maxAttempts) {
        throw error;
      }

      await sleep(delayMs);
      delayMs *= 2;
    }
  }
};
