import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  appMigrations,
  compactObservationPayload,
  getRetentionPolicy,
  openDatabase,
  runRetentionMaintenance,
  runStartupMigrations,
  SettingsRepo,
  type SqliteDatabase,
} from "../src/index.js";

const openConnections: SqliteDatabase[] = [];

afterEach(() => {
  for (const database of openConnections.splice(0)) {
    database.close();
  }
});

const createDatabase = (): SqliteDatabase => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ineedabossagent-retention-"));
  const database = openDatabase({
    dbPath: join(tempDirectory, "logic.sqlite"),
  });

  runStartupMigrations(database, appMigrations);
  openConnections.push(database);
  return database;
};

const parsePayload = (payloadJson: string): Record<string, unknown> =>
  JSON.parse(payloadJson) as Record<string, unknown>;

describe("compactObservationPayload", () => {
  it("drops duplicated media-heavy fields while preserving useful metadata", () => {
    expect(
      compactObservationPayload({
        app: "Figma",
        audioBase64: "abc123",
        nested: {
          image: "raw-image",
          keep: "signal",
        },
        screenpipeHints: {
          frameId: 44,
        },
      }),
    ).toEqual({
      app: "Figma",
      nested: {
        keep: "signal",
      },
      screenpipeHints: {
        frameId: 44,
      },
    });
  });
});

describe("runRetentionMaintenance", () => {
  it("uses retention settings from app_settings", () => {
    const database = createDatabase();
    const settingsRepo = new SettingsRepo(database);
    const settings = settingsRepo.getById(1);

    expect(settings).not.toBeNull();

    settingsRepo.update({
      ...(settings as NonNullable<typeof settings>),
      observationRetentionDays: 30,
      staleContextWindowRetentionHours: 48,
      updatedAt: "2026-04-18T12:00:00Z",
    });

    expect(getRetentionPolicy(database)).toEqual({
      observationRetentionDays: 30,
      staleContextWindowRetentionHours: 48,
    });
  });

  it("compacts duplicated media and prunes stale unreferenced observations/windows", () => {
    const database = createDatabase();
    const settingsRepo = new SettingsRepo(database);
    const settings = settingsRepo.getById(1);

    settingsRepo.update({
      ...(settings as NonNullable<typeof settings>),
      observationRetentionDays: 3,
      staleContextWindowRetentionHours: 6,
      updatedAt: "2026-04-18T12:00:00Z",
    });

    database.exec(`
      INSERT INTO observations (
        observation_id,
        observed_at,
        source,
        app_identifier,
        window_title,
        url,
        screenpipe_ref_json,
        payload_json
      )
      VALUES
        (
          'obs_old_delete',
          '2026-04-10T07:00:00Z',
          'screenpipe_search',
          'com.figma.Desktop',
          'Old Figma',
          NULL,
          '{"frameId": 101}',
          '{"screenshotBase64":"large","signal":"old"}'
        ),
        (
          'obs_old_keep',
          '2026-04-10T07:05:00Z',
          'screenpipe_search',
          'com.figma.Desktop',
          'Old but referenced',
          NULL,
          '{"frameId": 102}',
          '{"image":"duplicated","signal":"referenced"}'
        ),
        (
          'obs_recent_compact',
          '2026-04-18T10:00:00Z',
          'screenpipe_search',
          'com.google.Chrome',
          'Docs',
          'https://docs.example.com',
          '{"frameId": 103}',
          '{"audioBase64":"large","signal":"recent"}'
        );

      INSERT INTO context_windows (
        context_window_id,
        started_at,
        ended_at,
        summary_json,
        source_observation_ids_json,
        previous_window_id,
        next_window_id
      )
      VALUES
        (
          'window_old_delete',
          '2026-04-18T01:00:00Z',
          '2026-04-18T02:00:00Z',
          '{}',
          '[]',
          NULL,
          NULL
        ),
        (
          'window_old_keep',
          '2026-04-18T01:30:00Z',
          '2026-04-18T02:30:00Z',
          '{}',
          '["obs_old_keep"]',
          NULL,
          NULL
        );

      INSERT INTO classifications (
        classification_id,
        context_window_id,
        classified_at,
        runtime_state,
        confidence_ratio,
        is_support,
        matched_goal_id,
        matched_task_id,
        last_good_context,
        explainability
      )
      VALUES (
        'classification_keep',
        'window_old_keep',
        '2026-04-18T02:31:00Z',
        'aligned',
        0.9,
        0,
        NULL,
        NULL,
        'Figma',
        '[]'
      );
    `);

    const result = runRetentionMaintenance(database, "2026-04-18T12:00:00Z");
    const remainingObservations = database
      .prepare(
        "SELECT observation_id, payload_json FROM observations ORDER BY observation_id ASC",
      )
      .all() as Array<{ observation_id: string; payload_json: string }>;
    const remainingContextWindows = database
      .prepare(
        "SELECT context_window_id FROM context_windows ORDER BY context_window_id ASC",
      )
      .all() as Array<{ context_window_id: string }>;

    expect(result).toEqual({
      compactedObservations: 3,
      deletedContextWindows: 1,
      deletedObservations: 1,
      policy: {
        observationRetentionDays: 3,
        staleContextWindowRetentionHours: 6,
      },
    });
    expect(remainingObservations.map((row) => row.observation_id)).toEqual([
      "obs_old_keep",
      "obs_recent_compact",
    ]);
    expect(remainingObservations.map((row) => parsePayload(row.payload_json))).toEqual([
      { signal: "referenced" },
      { signal: "recent" },
    ]);
    expect(remainingContextWindows.map((row) => row.context_window_id)).toEqual([
      "window_old_keep",
    ]);
  });
});
