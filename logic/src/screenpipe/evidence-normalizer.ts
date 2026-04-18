import { normalizeScreenpipeRecordTimestamps } from "./search-poller.js";

type InteractionSummary = {
  appSwitches: number;
  clickCount: number;
  scrollEvents: number;
  typingSeconds: number;
};

type ActivitySummary = {
  dominantSignal: "idle" | "typing" | "scrolling" | "clicking" | "switching";
  isActive: boolean;
  totalInteractions: number;
};

type UrlSummary = {
  host: string | null;
  normalizedUrl: string | null;
  pathTokens: string[];
};

export type NormalizedScreenpipeEvidence = {
  accessibilityText: string | null;
  activitySummary: ActivitySummary;
  appIdentifier: string | null;
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
  urlSummary: UrlSummary;
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

const stripControlCharacters = (value: string): string =>
  Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0);

      return codePoint !== undefined && codePoint >= 32 && codePoint !== 127;
    })
    .join("");

const sanitizeWhitespace = (value: string): string =>
  stripControlCharacters(value).replace(/\s+/g, " ").trim();

const sanitizeTitle = (value: string | null): string | null => {
  if (value === null) {
    return null;
  }

  const sanitized = sanitizeWhitespace(value)
    .replace(/[|•·]+/g, " - ")
    .replace(/\s+-\s+/g, " - ");

  return sanitized.length > 0 ? sanitized : null;
};

const canonicalizeAppIdentifier = (value: string | null): string | null => {
  if (value === null) {
    return null;
  }

  const canonical = sanitizeWhitespace(value)
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .toLowerCase()
    .replace(/\.(app|exe)$/g, "")
    .replace(/[_\s.-]+/g, ".");

  return canonical.length > 0 ? canonical : null;
};

const normalizeUrlSummary = (value: string | null): UrlSummary => {
  if (value === null) {
    return {
      host: null,
      normalizedUrl: null,
      pathTokens: [],
    };
  }

  try {
    const parsed = new URL(value);
    const normalizedUrl = `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "") || parsed.origin;
    const pathTokens = parsed.pathname
      .split("/")
      .map((segment) => segment.trim().toLowerCase())
      .filter((segment) => segment.length > 0)
      .map((segment) => {
        try {
          return decodeURIComponent(segment);
        } catch {
          return segment;
        }
      })
      .flatMap((segment) =>
        segment
          .split(/[^a-z0-9]+/i)
          .map((token) => token.trim().toLowerCase())
          .filter((token) => token.length > 0),
      );

    return {
      host: parsed.hostname.toLowerCase(),
      normalizedUrl,
      pathTokens: [...new Set(pathTokens)],
    };
  } catch {
    return {
      host: null,
      normalizedUrl: sanitizeWhitespace(value),
      pathTokens: [],
    };
  }
};

const summarizeActivity = (
  interactionSummary: InteractionSummary,
): ActivitySummary => {
  const orderedSignals: Array<{
    key: ActivitySummary["dominantSignal"];
    value: number;
  }> = [
    { key: "typing", value: interactionSummary.typingSeconds },
    { key: "scrolling", value: interactionSummary.scrollEvents },
    { key: "clicking", value: interactionSummary.clickCount },
    { key: "switching", value: interactionSummary.appSwitches },
  ];

  const dominantSignal =
    orderedSignals.find((entry) => entry.value > 0)?.key ?? "idle";
  const totalInteractions = orderedSignals.reduce(
    (total, entry) => total + entry.value,
    0,
  );

  return {
    dominantSignal,
    isActive: totalInteractions > 0,
    totalInteractions,
  };
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
  const appName = firstString(
    collectNestedValues(record, [
      "app_name",
      "appName",
      "application_name",
      "applicationName",
    ]),
  );
  const interactionSummary = {
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
  };
  const rawUrl = firstString(
    collectNestedValues(record, ["url", "page_url", "pageUrl"]),
  );
  const urlSummary = normalizeUrlSummary(rawUrl);
  const windowTitle = sanitizeTitle(
    firstString(collectNestedValues(record, ["window_title", "windowTitle", "title"])),
  );

  return {
    accessibilityText: firstString(
      collectNestedValues(record, [
        "accessibility_text",
        "accessibilityText",
        "a11y_text",
      ]),
    ),
    activitySummary: summarizeActivity(interactionSummary),
    appIdentifier: canonicalizeAppIdentifier(appName),
    appName,
    interactionSummary,
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
    url: urlSummary.normalizedUrl,
    urlSummary,
    windowTitle,
  };
};

export const normalizeScreenpipeRecordsToEvidence = (
  records: unknown[],
): NormalizedScreenpipeEvidence[] =>
  records.map((record) => normalizeScreenpipeRecordToEvidence(record));
