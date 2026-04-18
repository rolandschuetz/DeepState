import type { SqliteDatabase } from "./database.js";

import {
  DEFAULT_OBSERVATION_RETENTION_DAYS,
  DEFAULT_STALE_CONTEXT_WINDOW_RETENTION_HOURS,
} from "./app-migrations.js";

export type RetentionPolicy = {
  observationRetentionDays: number;
  staleContextWindowRetentionHours: number;
};

export type RetentionMaintenanceResult = {
  compactedObservations: number;
  deletedContextWindows: number;
  deletedObservations: number;
  policy: RetentionPolicy;
};

const HEAVY_SCREENPIPE_PAYLOAD_KEYS = new Set([
  "audio",
  "audioBase64",
  "audioBytes",
  "audioData",
  "audioTranscriptChunks",
  "base64",
  "blob",
  "contentBytes",
  "frameImage",
  "frameImageBase64",
  "image",
  "imageBase64",
  "imageBytes",
  "imageData",
  "rawMedia",
  "rawPayload",
  "screenshot",
  "screenshotBase64",
  "thumbnailBase64",
  "video",
  "videoBase64",
  "videoBytes",
]);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const compactPayloadValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => compactPayloadValue(item));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const compactedEntries = Object.entries(value)
    .filter(([key]) => !HEAVY_SCREENPIPE_PAYLOAD_KEYS.has(key))
    .map(([key, nestedValue]) => [key, compactPayloadValue(nestedValue)] as const);

  return Object.fromEntries(compactedEntries);
};

const parseJsonColumn = <T>(value: string): T => JSON.parse(value) as T;

export const compactObservationPayload = (payload: unknown): unknown =>
  compactPayloadValue(payload);

export const getRetentionPolicy = (database: SqliteDatabase): RetentionPolicy => {
  const row = database
    .prepare(
      `
        SELECT observation_retention_days, stale_context_window_retention_hours
        FROM app_settings
        WHERE settings_id = 1
      `,
    )
    .get() as
    | {
        observation_retention_days: number;
        stale_context_window_retention_hours: number;
      }
    | undefined;

  if (row === undefined) {
    return {
      observationRetentionDays: DEFAULT_OBSERVATION_RETENTION_DAYS,
      staleContextWindowRetentionHours: DEFAULT_STALE_CONTEXT_WINDOW_RETENTION_HOURS,
    };
  }

  return {
    observationRetentionDays: row.observation_retention_days,
    staleContextWindowRetentionHours: row.stale_context_window_retention_hours,
  };
};

const subtractHours = (timestamp: string, hours: number): string =>
  new Date(Date.parse(timestamp) - hours * 60 * 60 * 1000).toISOString();

const subtractDays = (timestamp: string, days: number): string =>
  subtractHours(timestamp, days * 24);

export const runRetentionMaintenance = (
  database: SqliteDatabase,
  now = new Date().toISOString(),
): RetentionMaintenanceResult => {
  const policy = getRetentionPolicy(database);
  const observationCutoff = subtractDays(now, policy.observationRetentionDays);
  const staleWindowCutoff = subtractHours(
    now,
    policy.staleContextWindowRetentionHours,
  );

  const selectObservations = database.prepare(
    `
      SELECT observation_id, payload_json
      FROM observations
      ORDER BY observed_at ASC
    `,
  );
  const updateObservationPayload = database.prepare(
    `
      UPDATE observations
      SET payload_json = @payload_json
      WHERE observation_id = @observation_id
    `,
  );
  const deleteOldObservations = database.prepare(
    `
      DELETE FROM observations
      WHERE observed_at < @observation_cutoff
        AND NOT EXISTS (
          SELECT 1
          FROM context_windows, json_each(context_windows.source_observation_ids_json)
          WHERE json_each.value = observations.observation_id
        )
    `,
  );
  const deleteStaleContextWindows = database.prepare(
    `
      DELETE FROM context_windows
      WHERE ended_at < @stale_window_cutoff
        AND NOT EXISTS (
          SELECT 1
          FROM classifications
          WHERE classifications.context_window_id = context_windows.context_window_id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM episodes, json_each(episodes.context_window_ids_json)
          WHERE json_each.value = context_windows.context_window_id
        )
    `,
  );

  const runMaintenance = database.transaction(() => {
    let compactedObservations = 0;
    const observations = selectObservations.all() as Array<{
      observation_id: string;
      payload_json: string;
    }>;

    for (const observation of observations) {
      const payload = parseJsonColumn<unknown>(observation.payload_json);
      const compactedPayload = compactObservationPayload(payload);
      const serializedOriginal = JSON.stringify(payload);
      const serializedCompacted = JSON.stringify(compactedPayload);

      if (serializedOriginal !== serializedCompacted) {
        updateObservationPayload.run({
          observation_id: observation.observation_id,
          payload_json: serializedCompacted,
        });
        compactedObservations += 1;
      }
    }

    const deletedObservations = deleteOldObservations.run({
      observation_cutoff: observationCutoff,
    }).changes;
    const deletedContextWindows = deleteStaleContextWindows.run({
      stale_window_cutoff: staleWindowCutoff,
    }).changes;

    return {
      compactedObservations,
      deletedContextWindows,
      deletedObservations,
      policy,
    };
  });

  return runMaintenance();
};
