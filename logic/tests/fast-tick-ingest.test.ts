import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  appMigrations,
  openDatabase,
  runFastTickIngest,
  runStartupMigrations,
  seedDefaultPrivacyExclusions,
  type ScreenpipeSearchPoller,
  type SqliteDatabase,
} from "../src/index.js";

const openConnections: SqliteDatabase[] = [];

afterEach(() => {
  for (const database of openConnections.splice(0)) {
    database.close();
  }
});

const createDatabase = (): SqliteDatabase => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ineedabossagent-fast-tick-"));
  const database = openDatabase({
    dbPath: join(tempDirectory, "logic.sqlite"),
  });

  runStartupMigrations(database, appMigrations);
  seedDefaultPrivacyExclusions(database);
  openConnections.push(database);

  return database;
};

describe("runFastTickIngest", () => {
  it("persists observations and raw context windows while running", async () => {
    const database = createDatabase();
    const poller: ScreenpipeSearchPoller = {
      poll: () =>
        Promise.resolve({
          cursor: {
            lastSuccessfulIngestAt: "2026-04-18T10:00:00.000Z",
            recentRecordKeys: ["event_1"],
          },
          deduplicatedCount: 0,
          diagnostics: {
            exceededSchedulerBudget: false,
            missingFrameContextCount: 0,
            partialReason: null,
          },
          rawCount: 1,
          records: [
            {
              app_name: "Cursor",
              id: "event_1",
              timestamp: "2026-04-18T10:00:00Z",
              window_title: "logic-runtime.ts - repo",
            },
          ],
          requestWindow: {
            endAt: "2026-04-18T10:00:00.000Z",
            startAt: "2026-04-18T09:55:00.000Z",
          },
        }),
    };

    const result = await runFastTickIngest({
      cursor: {
        lastSuccessfulIngestAt: null,
        recentRecordKeys: [],
      },
      database,
      mode: "running",
      nowIso: "2026-04-18T10:00:00.000Z",
      poller,
    });

    expect(result.ingestError).toBeNull();
    expect(result.observationsCreated).toBe(1);
    expect(result.contextWindowsCreated).toBe(1);

    const observationCount = database
      .prepare("SELECT COUNT(*) AS count FROM observations")
      .get() as { count: number };
    const contextWindowCount = database
      .prepare("SELECT COUNT(*) AS count FROM context_windows")
      .get() as { count: number };

    expect(observationCount.count).toBe(1);
    expect(contextWindowCount.count).toBe(1);
  });
});
