import type { NormalizedScreenpipeEvidence } from "../screenpipe/evidence-normalizer.js";

export type ContextWindowSummary = {
  activeApps: string[];
  activitySummary: {
    isActive: boolean;
    totalInteractions: number;
    typingSeconds: number;
    scrollEvents: number;
    clickCount: number;
    appSwitches: number;
  };
  keywords: string[];
  screenpipeRefs: {
    elementIds: Array<number | string>;
    frameIds: Array<number | string>;
    recordIds: Array<number | string>;
  };
  uiText: string[];
  urls: string[];
  windowTitles: string[];
};

export type AggregatedContextWindow = {
  endedAt: string;
  sourceRecordIds: Array<number | string>;
  sourceRecords: NormalizedScreenpipeEvidence[];
  startedAt: string;
  summary: ContextWindowSummary;
};

export type CreateContextAggregatorOptions = {
  windowDurationSeconds?: number;
};

export type ContextAggregator = {
  aggregate: (records: NormalizedScreenpipeEvidence[]) => AggregatedContextWindow[];
};

const DEFAULT_WINDOW_DURATION_SECONDS = 90;

const unique = <T>(values: T[]): T[] => [...new Set(values)];

const hasTimestamp = (
  record: NormalizedScreenpipeEvidence,
): record is NormalizedScreenpipeEvidence & { observedAt: string } =>
  record.observedAt !== null && !Number.isNaN(Date.parse(record.observedAt));

const summarizeWindow = (
  records: NormalizedScreenpipeEvidence[],
): ContextWindowSummary => ({
  activeApps: unique(
    records
      .map((record) => record.appName)
      .filter((value): value is string => value !== null),
  ),
  activitySummary: {
    appSwitches: records.reduce(
      (total, record) => total + record.interactionSummary.appSwitches,
      0,
    ),
    clickCount: records.reduce(
      (total, record) => total + record.interactionSummary.clickCount,
      0,
    ),
    isActive: records.some((record) => record.activitySummary.isActive),
    scrollEvents: records.reduce(
      (total, record) => total + record.interactionSummary.scrollEvents,
      0,
    ),
    totalInteractions: records.reduce(
      (total, record) => total + record.activitySummary.totalInteractions,
      0,
    ),
    typingSeconds: records.reduce(
      (total, record) => total + record.interactionSummary.typingSeconds,
      0,
    ),
  },
  keywords: unique(records.flatMap((record) => record.keywords)),
  screenpipeRefs: {
    elementIds: unique(records.flatMap((record) => record.screenpipeRefs.elementIds)),
    frameIds: unique(records.flatMap((record) => record.screenpipeRefs.frameIds)),
    recordIds: unique(records.flatMap((record) => record.screenpipeRefs.recordIds)),
  },
  uiText: unique(records.flatMap((record) => record.uiText)),
  urls: unique(
    records
      .map((record) => record.url)
      .filter((value): value is string => value !== null),
  ),
  windowTitles: unique(
    records
      .map((record) => record.windowTitle)
      .filter((value): value is string => value !== null),
  ),
});

export const createContextAggregator = ({
  windowDurationSeconds = DEFAULT_WINDOW_DURATION_SECONDS,
}: CreateContextAggregatorOptions = {}): ContextAggregator => {
  const windowDurationMs = windowDurationSeconds * 1_000;

  return {
    aggregate: (records: NormalizedScreenpipeEvidence[]): AggregatedContextWindow[] => {
      const datedRecords = records
        .filter(hasTimestamp)
        .sort((left, right) => left.observedAt.localeCompare(right.observedAt));
      const windows: AggregatedContextWindow[] = [];

      for (const record of datedRecords) {
        const currentWindow = windows.at(-1);

        if (currentWindow === undefined) {
          windows.push({
            endedAt: record.observedAt,
            sourceRecordIds: [...record.screenpipeRefs.recordIds],
            sourceRecords: [record],
            startedAt: record.observedAt,
            summary: summarizeWindow([record]),
          });
          continue;
        }

        const currentWindowStartMs = Date.parse(currentWindow.startedAt);
        const recordObservedAtMs = Date.parse(record.observedAt);

        if (recordObservedAtMs - currentWindowStartMs < windowDurationMs) {
          const nextSourceRecords = [...currentWindow.sourceRecords, record];

          currentWindow.endedAt = record.observedAt;
          currentWindow.sourceRecords = nextSourceRecords;
          currentWindow.sourceRecordIds = unique(
            nextSourceRecords.flatMap((entry) => entry.screenpipeRefs.recordIds),
          );
          currentWindow.summary = summarizeWindow(nextSourceRecords);
          continue;
        }

        windows.push({
          endedAt: record.observedAt,
          sourceRecordIds: [...record.screenpipeRefs.recordIds],
          sourceRecords: [record],
          startedAt: record.observedAt,
          summary: summarizeWindow([record]),
        });
      }

      return windows;
    },
  };
};
