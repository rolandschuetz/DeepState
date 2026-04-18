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
  diagnostics: {
    exceededSchedulerBudget: boolean;
    missingFrameContextCount: number;
    partialReason: "missing_frame_context" | "screenpipe_marked_partial" | null;
  };
  rawCount: number;
  records: unknown[];
  requestWindow: {
    endAt: string;
    startAt: string;
  };
};

export type CreateScreenpipeSearchPollerOptions = {
  authToken?: string | null;
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  initialLookbackMs?: number;
  limit?: number;
  overlapMs?: number;
  recentKeyCapacity?: number;
  schedulerBudgetMs?: number;
};

const DEFAULT_INITIAL_LOOKBACK_MS = 5 * 60 * 1000;
const DEFAULT_LIMIT = 250;
const DEFAULT_OVERLAP_MS = 15 * 1000;
const DEFAULT_RECENT_KEY_CAPACITY = 1_000;
const TIMESTAMP_KEYS = new Set([
  "timestamp",
  "observed_at",
  "observedAt",
  "created_at",
  "createdAt",
  "start_at",
  "startAt",
  "end_at",
  "endAt",
]);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasTruthyBooleanField = (value: unknown, keys: string[]): boolean =>
  isPlainObject(value) &&
  keys.some((key) => {
    const candidate = value[key];

    return candidate === true;
  });

const parseResponsePayload = async (response: Response): Promise<unknown> =>
  response.headers.get("content-type")?.includes("application/json")
    ? await response.json()
    : await response.text();

const buildAuthHeaders = (
  authToken: string | null | undefined,
): Record<string, string> =>
  authToken === null || authToken === undefined || authToken.length === 0
    ? {}
    : { Authorization: `Bearer ${authToken}` };

const extractErrorMessage = (payload: unknown): string | null => {
  if (typeof payload === "string") {
    const trimmed = payload.trim();

    return trimmed.length > 0 ? trimmed : null;
  }

  if (!isPlainObject(payload)) {
    return null;
  }

  for (const key of ["error", "message", "detail"]) {
    const value = payload[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
};

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

const hasFrameReference = (record: unknown): boolean => {
  if (!isPlainObject(record)) {
    return false;
  }

  for (const key of ["frame_id", "frameId", "frame_ids", "frameIds"]) {
    const value = record[key];

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      (Array.isArray(value) && value.length > 0)
    ) {
      return true;
    }
  }

  return false;
};

const hasFrameContextPayload = (record: unknown): boolean => {
  if (!isPlainObject(record)) {
    return false;
  }

  for (const key of [
    "frame_context",
    "frameContext",
    "ocr_text",
    "ocrText",
    "accessibility_text",
    "accessibilityText",
    "text",
    "ui_text",
    "uiText",
    "text_lines",
    "textLines",
    "window_title",
    "windowTitle",
    "title",
    "url",
    "page_url",
    "pageUrl",
  ]) {
    const value = record[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return true;
    }

    if (Array.isArray(value) && value.length > 0) {
      return true;
    }

    if (isPlainObject(value) && Object.keys(value).length > 0) {
      return true;
    }
  }

  return false;
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

export const normalizeScreenpipeRecordTimestamps = (record: unknown): unknown => {
  if (Array.isArray(record)) {
    return record.map((entry) => normalizeScreenpipeRecordTimestamps(entry));
  }

  if (!isPlainObject(record)) {
    return record;
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => {
      if (
        TIMESTAMP_KEYS.has(key) &&
        typeof value === "string" &&
        !Number.isNaN(Date.parse(value))
      ) {
        return [key, new Date(value).toISOString()] as const;
      }

      return [key, normalizeScreenpipeRecordTimestamps(value)] as const;
    }),
  );
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

export class ScreenpipeSchedulerBudgetExceededError extends Error {
  constructor(budgetMs: number) {
    super(`Screenpipe /search exceeded scheduler budget of ${budgetMs}ms.`);
    this.name = "ScreenpipeSchedulerBudgetExceededError";
  }
}

export const createScreenpipeSearchPoller = ({
  authToken = null,
  baseUrl,
  fetch: fetchImpl = globalThis.fetch,
  initialLookbackMs = DEFAULT_INITIAL_LOOKBACK_MS,
  limit = DEFAULT_LIMIT,
  overlapMs = DEFAULT_OVERLAP_MS,
  recentKeyCapacity = DEFAULT_RECENT_KEY_CAPACITY,
  schedulerBudgetMs,
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
      const abortController =
        schedulerBudgetMs === undefined ? null : new AbortController();
      const budgetTimeout =
        abortController === null
          ? null
          : setTimeout(() => abortController.abort(), schedulerBudgetMs);
      let response: Response;

      try {
        response = await fetchImpl(`${normalizedBaseUrl}/search?${query.toString()}`, {
          headers: buildAuthHeaders(authToken),
          method: "GET",
          ...(abortController === null ? {} : { signal: abortController.signal }),
        });
      } catch (error) {
        if (
          schedulerBudgetMs !== undefined &&
          error instanceof Error &&
          error.name === "AbortError"
        ) {
          throw new ScreenpipeSchedulerBudgetExceededError(schedulerBudgetMs);
        }

        throw error;
      } finally {
        if (budgetTimeout !== null) {
          clearTimeout(budgetTimeout);
        }
      }

      const payload = await parseResponsePayload(response);

      if (!response.ok) {
        const errorMessage = extractErrorMessage(payload);
        throw new Error(
          errorMessage === null
            ? `Screenpipe /search failed with HTTP ${response.status}.`
            : `Screenpipe /search failed with HTTP ${response.status}: ${errorMessage}`,
        );
      }

      const partialFromPayload = hasTruthyBooleanField(payload, [
        "partial",
        "is_partial",
        "isPartial",
        "truncated",
        "has_more",
        "hasMore",
      ]);
      const rawRecords = extractSearchRecords(payload).map((record) =>
        normalizeScreenpipeRecordTimestamps(record),
      );
      const missingFrameContextCount = rawRecords.filter(
        (record) => hasFrameReference(record) && !hasFrameContextPayload(record),
      ).length;
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

        if (
          recordTimestamp !== null &&
          (recordTimestamp < startAt || recordTimestamp > endAt)
        ) {
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
        diagnostics: {
          exceededSchedulerBudget: false,
          missingFrameContextCount,
          partialReason: partialFromPayload
            ? "screenpipe_marked_partial"
            : missingFrameContextCount > 0
              ? "missing_frame_context"
              : null,
        },
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
