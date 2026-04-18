import { randomUUID } from "node:crypto";

import type { Mode } from "@ineedabossagent/shared-contracts";

import { createContextAggregator } from "../context/context-aggregator.js";
import type { SqliteDatabase } from "../db/database.js";
import { createPrivacyFilter } from "../privacy/privacy-filter.js";
import { sanitizeEvidenceForPersistence } from "../privacy/evidence-sanitizer.js";
import { ObservationRepo, PrivacyExclusionsRepo } from "../repos/sqlite-repositories.js";
import {
  normalizeScreenpipeRecordsToEvidence,
} from "../screenpipe/evidence-normalizer.js";
import type { ScreenpipeSearchCursor } from "../screenpipe/search-poller.js";
import type { ScreenpipeSearchPoller } from "../screenpipe/search-poller.js";
import { ScreenpipeSchedulerBudgetExceededError } from "../screenpipe/search-poller.js";

export type FastTickIngestResult = {
  contextWindowsCreated: number;
  cursor: ScreenpipeSearchCursor;
  ingestError: Error | null;
  observationsCreated: number;
  polledRecordCount: number;
};

const buildScreenpipeRef = (record: {
  screenpipeRefs: { recordIds: Array<number | string> };
}): unknown => ({
  record_ids: record.screenpipeRefs.recordIds,
});

const persistContextWindows = ({
  database,
  observationIdsByRecord,
  persistableEvidence,
}: {
  database: SqliteDatabase;
  observationIdsByRecord: Map<object, string>;
  persistableEvidence: Parameters<ReturnType<typeof createContextAggregator>["aggregate"]>[0];
}): number => {
  const windows = createContextAggregator().aggregate(persistableEvidence);

  if (windows.length === 0) {
    return 0;
  }

  const selectLatestWindow = database.prepare(
    `
      SELECT context_window_id
      FROM context_windows
      ORDER BY started_at DESC, context_window_id DESC
      LIMIT 1
    `,
  );
  const insertWindow = database.prepare(
    `
      INSERT INTO context_windows (
        context_window_id,
        started_at,
        ended_at,
        summary_json,
        source_observation_ids_json,
        previous_window_id,
        next_window_id
      )
      VALUES (
        @context_window_id,
        @started_at,
        @ended_at,
        @summary_json,
        @source_observation_ids_json,
        @previous_window_id,
        @next_window_id
      )
    `,
  );
  const updateNextWindow = database.prepare(
    `
      UPDATE context_windows
      SET next_window_id = @next_window_id
      WHERE context_window_id = @context_window_id
    `,
  );

  let previousWindowId =
    ((selectLatestWindow.get() as { context_window_id?: string } | undefined)
      ?.context_window_id ?? null);
  let createdCount = 0;

  for (const window of windows) {
    const contextWindowId = randomUUID();
    const sourceObservationIds = window.sourceRecords
      .map((record) => observationIdsByRecord.get(record))
      .filter((value): value is string => value !== undefined);

    insertWindow.run({
      context_window_id: contextWindowId,
      ended_at: window.endedAt,
      next_window_id: null,
      previous_window_id: previousWindowId,
      source_observation_ids_json: JSON.stringify(sourceObservationIds),
      started_at: window.startedAt,
      summary_json: JSON.stringify(window.summary),
    });

    if (previousWindowId !== null) {
      updateNextWindow.run({
        context_window_id: previousWindowId,
        next_window_id: contextWindowId,
      });
    }

    previousWindowId = contextWindowId;
    createdCount += 1;
  }

  return createdCount;
};

export const runFastTickIngest = async ({
  cursor,
  database,
  mode,
  nowIso = new Date().toISOString(),
  poller,
}: {
  cursor: ScreenpipeSearchCursor;
  database: SqliteDatabase;
  mode: Mode;
  nowIso?: string;
  poller: ScreenpipeSearchPoller;
}): Promise<FastTickIngestResult> => {
  if (mode !== "running" && mode !== "degraded_screenpipe") {
    return {
      contextWindowsCreated: 0,
      cursor,
      ingestError: null,
      observationsCreated: 0,
      polledRecordCount: 0,
    };
  }

  if (mode === "degraded_screenpipe") {
    return {
      contextWindowsCreated: 0,
      cursor,
      ingestError: null,
      observationsCreated: 0,
      polledRecordCount: 0,
    };
  }

  const exclusions = new PrivacyExclusionsRepo(database).listAll();
  const privacyFilter = createPrivacyFilter(exclusions);
  const observationRepo = new ObservationRepo(database);

  try {
    const pollResult = await poller.poll({
      cursor,
      endAt: nowIso,
    });

    const evidence = normalizeScreenpipeRecordsToEvidence(pollResult.records);
    const sanitized = sanitizeEvidenceForPersistence(evidence, privacyFilter);

    const observationIdsByRecord = new Map<object, string>();
    let observationsCreated = 0;

    for (const record of sanitized.persistable) {
      if (record.observedAt === null) {
        continue;
      }

      const observationId = randomUUID();
      observationRepo.create({
        appIdentifier: record.appIdentifier,
        observationId,
        observedAt: record.observedAt,
        payload: record,
        screenpipeRef: buildScreenpipeRef(record),
        source: record.source,
        url: record.url,
        windowTitle: record.windowTitle,
      });
      observationIdsByRecord.set(record, observationId);
      observationsCreated += 1;
    }

    const contextWindowsCreated = persistContextWindows({
      database,
      observationIdsByRecord,
      persistableEvidence: sanitized.persistable,
    });

    return {
      contextWindowsCreated,
      cursor: pollResult.cursor,
      ingestError: null,
      observationsCreated,
      polledRecordCount: pollResult.records.length,
    };
  } catch (error) {
    return {
      contextWindowsCreated: 0,
      cursor,
      ingestError: error instanceof Error ? error : new Error(String(error)),
      observationsCreated: 0,
      polledRecordCount: 0,
    };
  }
};

export const isSchedulerBudgetExceeded = (error: unknown): boolean =>
  error instanceof ScreenpipeSchedulerBudgetExceededError;
