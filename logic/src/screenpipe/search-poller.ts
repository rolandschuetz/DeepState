export type ScreenpipeSearchCursor = {
  lastSuccessfulIngestAt: string | null;
  recentRecordKeys: string[];
};

export type ScreenpipeSearchPoller = {
  poll: (
    options?: ScreenpipeSearchPollOptions,
  ) => Promise<ScreenpipeSearchPollResult>;
};

export type ScreenpipeSearchPollOptions = {
  cursor?: ScreenpipeSearchCursor;
  endAt?: string;
};

export type ScreenpipeSearchPollResult = {
  cursor: ScreenpipeSearchCursor;
  deduplicatedCount: number;
  rawCount: number;
  records: unknown[];
  requestWindow: {
    endAt: string;
    startAt: string;
  };
};

export type CreateScreenpipeSearchPollerOptions = {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  initialLookbackMs?: number;
  limit?: number;
  overlapMs?: number;
  recentKeyCapacity?: number;
};

const DEFAULT_INITIAL_LOOKBACK_MS = 5 * 60 * 1000;
const DEFAULT_LIMIT = 250;
const DEFAULT_OVERLAP_MS = 15 * 1000;
const DEFAULT_RECENT_KEY_CAPACITY = 1_000;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseResponsePayload = async (response: Response): Promise<unknown> =>
  response.headers.get("content-type")?.includes("application/json")
    ? await response.json()
    : await response.text();

const extractSearchRecords = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isPlainObject(payload)) {
    return [];
  }

  for (const key of ["data", "results", "items", "records"]) {
    const value = payload[key];

    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
};

const findTimestamp = (record: unknown): string | null => {
  if (!isPlainObject(record)) {
    return null;
  }

  for (const key of [
    "timestamp",
    "observed_at",
    "observedAt",
    "created_at",
    "createdAt",
    "start_at",
    "startAt",
  ]) {
    const value = record[key];

    if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
      return new Date(value).toISOString();
    }
  }

  return null;
};

const buildRecordKey = (record: unknown): string => {
  if (isPlainObject(record)) {
    for (const key of ["id", "frame_id", "frameId", "event_id", "eventId"]) {
      const value = record[key];

      if (typeof value === "string" || typeof value === "number") {
        return `${key}:${value}`;
      }
    }
  }

  return JSON.stringify(record);
};

const subtractMs = (timestamp: string, durationMs: number): string =>
  new Date(Date.parse(timestamp) - durationMs).toISOString();

export const createScreenpipeSearchPoller = ({
  baseUrl,
  fetch: fetchImpl = globalThis.fetch,
  initialLookbackMs = DEFAULT_INITIAL_LOOKBACK_MS,
  limit = DEFAULT_LIMIT,
  overlapMs = DEFAULT_OVERLAP_MS,
  recentKeyCapacity = DEFAULT_RECENT_KEY_CAPACITY,
}: CreateScreenpipeSearchPollerOptions): ScreenpipeSearchPoller => {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");

  return {
    poll: async ({
      cursor = {
        lastSuccessfulIngestAt: null,
        recentRecordKeys: [],
      },
      endAt = new Date().toISOString(),
    }: ScreenpipeSearchPollOptions = {}): Promise<ScreenpipeSearchPollResult> => {
      const startAt =
        cursor.lastSuccessfulIngestAt === null
          ? subtractMs(endAt, initialLookbackMs)
          : subtractMs(cursor.lastSuccessfulIngestAt, overlapMs);
      const query = new URLSearchParams({
        end_time: endAt,
        limit: String(limit),
        start_time: startAt,
      });
      const response = await fetchImpl(
        `${normalizedBaseUrl}/search?${query.toString()}`,
        { method: "GET" },
      );

      if (!response.ok) {
        throw new Error(`Screenpipe /search failed with HTTP ${response.status}.`);
      }

      const payload = await parseResponsePayload(response);
      const rawRecords = extractSearchRecords(payload);
      const seenKeys = new Set(cursor.recentRecordKeys);
      const nextRecords: unknown[] = [];
      let deduplicatedCount = 0;
      let latestTimestamp = cursor.lastSuccessfulIngestAt;

      for (const record of rawRecords) {
        const recordKey = buildRecordKey(record);
        const recordTimestamp = findTimestamp(record);

        if (recordTimestamp !== null) {
          latestTimestamp =
            latestTimestamp === null || recordTimestamp > latestTimestamp
              ? recordTimestamp
              : latestTimestamp;
        }

        if (seenKeys.has(recordKey)) {
          deduplicatedCount += 1;
          continue;
        }

        seenKeys.add(recordKey);
        nextRecords.push(record);
      }

      return {
        cursor: {
          lastSuccessfulIngestAt: latestTimestamp,
          recentRecordKeys: [...seenKeys].slice(-recentKeyCapacity),
        },
        deduplicatedCount,
        rawCount: rawRecords.length,
        records: nextRecords,
        requestWindow: {
          endAt,
          startAt,
        },
      };
    },
  };
};
