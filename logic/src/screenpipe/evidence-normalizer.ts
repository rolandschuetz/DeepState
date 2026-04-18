import { normalizeScreenpipeRecordTimestamps } from "./search-poller.js";

type InteractionSummary = {
  appSwitches: number;
  clickCount: number;
  scrollEvents: number;
  typingSeconds: number;
};

export type NormalizedScreenpipeEvidence = {
  accessibilityText: string | null;
  appName: string | null;
  interactionSummary: InteractionSummary;
  keywords: string[];
  observedAt: string | null;
  ocrText: string | null;
  screenpipeRefs: {
    elementIds: Array<number | string>;
    frameIds: Array<number | string>;
    recordIds: Array<number | string>;
  };
  source: "screenpipe_search";
  uiText: string[];
  url: string | null;
  windowTitle: string | null;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const collectNestedValues = (
  value: unknown,
  candidateKeys: string[],
): unknown[] => {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectNestedValues(entry, candidateKeys));
  }

  if (!isPlainObject(value)) {
    return [];
  }

  const directMatches = candidateKeys.flatMap((candidateKey) =>
    candidateKey in value ? [value[candidateKey]] : [],
  );
  const nestedMatches = Object.values(value).flatMap((entry) =>
    collectNestedValues(entry, candidateKeys),
  );

  return [...directMatches, ...nestedMatches];
};

const firstString = (values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
};

const collectStrings = (values: unknown[]): string[] => {
  const flattened = values.flatMap((value) => {
    if (typeof value === "string") {
      return [value.trim()];
    }

    if (Array.isArray(value)) {
      return value.flatMap((entry) =>
        typeof entry === "string" ? [entry.trim()] : [],
      );
    }

    return [];
  });

  return [...new Set(flattened.filter((value) => value.length > 0))];
};

const collectIds = (values: unknown[]): Array<number | string> => {
  const ids = values.flatMap((value) => {
    if (typeof value === "string" || typeof value === "number") {
      return [value];
    }

    if (Array.isArray(value)) {
      return value.flatMap((entry) =>
        typeof entry === "string" || typeof entry === "number" ? [entry] : [],
      );
    }

    return [];
  });

  return [...new Set(ids)];
};

const firstNumber = (values: unknown[]): number | null => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
};

export const normalizeScreenpipeRecordToEvidence = (
  rawRecord: unknown,
): NormalizedScreenpipeEvidence => {
  const record = normalizeScreenpipeRecordTimestamps(rawRecord);

  return {
    accessibilityText: firstString(
      collectNestedValues(record, [
        "accessibility_text",
        "accessibilityText",
        "a11y_text",
      ]),
    ),
    appName: firstString(
      collectNestedValues(record, [
        "app_name",
        "appName",
        "application_name",
        "applicationName",
      ]),
    ),
    interactionSummary: {
      appSwitches:
        firstNumber(collectNestedValues(record, ["app_switches", "appSwitches"])) ?? 0,
      clickCount:
        firstNumber(
          collectNestedValues(record, ["click_count", "clickCount", "mouse_clicks"]),
        ) ?? 0,
      scrollEvents:
        firstNumber(collectNestedValues(record, ["scroll_events", "scrollEvents"])) ?? 0,
      typingSeconds:
        firstNumber(
          collectNestedValues(record, [
            "typing_seconds",
            "typingSeconds",
            "typed_duration_seconds",
          ]),
        ) ?? 0,
    },
    keywords: collectStrings(collectNestedValues(record, ["keywords", "tags"])),
    observedAt: firstString(
      collectNestedValues(record, [
        "timestamp",
        "observed_at",
        "observedAt",
        "created_at",
        "createdAt",
      ]),
    ),
    ocrText: firstString(
      collectNestedValues(record, ["ocr_text", "ocrText", "text"]),
    ),
    screenpipeRefs: {
      elementIds: collectIds(
        collectNestedValues(record, [
          "element_id",
          "elementId",
          "element_ids",
          "elementIds",
        ]),
      ),
      frameIds: collectIds(
        collectNestedValues(record, ["frame_id", "frameId", "frame_ids", "frameIds"]),
      ),
      recordIds: collectIds(
        collectNestedValues(record, ["id", "record_id", "recordId", "event_id", "eventId"]),
      ),
    },
    source: "screenpipe_search",
    uiText: collectStrings(
      collectNestedValues(record, ["ui_text", "uiText", "text_lines", "textLines"]),
    ),
    url: firstString(
      collectNestedValues(record, ["url", "page_url", "pageUrl"]),
    ),
    windowTitle: firstString(
      collectNestedValues(record, ["window_title", "windowTitle", "title"]),
    ),
  };
};

export const normalizeScreenpipeRecordsToEvidence = (
  records: unknown[],
): NormalizedScreenpipeEvidence[] =>
  records.map((record) => normalizeScreenpipeRecordToEvidence(record));
