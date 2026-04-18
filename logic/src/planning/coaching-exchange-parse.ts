import { coachingExchangeSchema, type CoachingExchange } from "@ineedabossagent/shared-contracts";

type ParseCoachingExchangeOptions = {
  fallbackLocalDate?: string;
};

const looksLikeTranscript = (rawText: string): boolean => {
  const trimmed = rawText.trim();
  if (!trimmed.startsWith("{")) {
    return true;
  }

  return /```|^\s*[A-Z][A-Za-z ]+:\s/m.test(trimmed);
};

export class CoachingExchangeParseError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[] = []) {
    super(message);
    this.name = "CoachingExchangeParseError";
    this.issues = issues;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && Array.isArray(value) === false;

const normalizeKey = (key: string): string =>
  key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toLowerCase();

const normalizeKeysDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeKeysDeep(item));
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [normalizeKey(key), normalizeKeysDeep(nestedValue)]),
  );
};

const applyImportFallbacks = (
  value: unknown,
  options: ParseCoachingExchangeOptions,
): unknown => {
  if (!isRecord(value)) {
    return value;
  }

  const normalized = { ...value };

  if (normalized.exchange_type === undefined) {
    if (Array.isArray(normalized.tasks)) {
      normalized.exchange_type = "morning_plan";
    } else if (
      Array.isArray(normalized.task_outcomes)
      || typeof normalized.overall_day_summary === "string"
    ) {
      normalized.exchange_type = "evening_debrief";
    }
  }

  if (normalized.schema_version === undefined && typeof normalized.exchange_type === "string") {
    normalized.schema_version = "1.0.0";
  }

  if (normalized.local_date === undefined && options.fallbackLocalDate !== undefined) {
    normalized.local_date = options.fallbackLocalDate;
  }

  return normalized;
};

export const parseCoachingExchange = (
  rawText: string,
  options: ParseCoachingExchangeOptions = {},
): CoachingExchange => {
  if (looksLikeTranscript(rawText)) {
    throw new CoachingExchangeParseError(
      "Import payload must be strict JSON only, not a transcript-like exchange.",
    );
  }

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(rawText);
  } catch (error) {
    throw new CoachingExchangeParseError("Import payload contains malformed JSON.", [
      error instanceof Error ? error.message : "Malformed JSON.",
    ]);
  }

  const normalizedJson = applyImportFallbacks(normalizeKeysDeep(parsedJson), options);
  const parsed = coachingExchangeSchema.safeParse(normalizedJson);

  if (!parsed.success) {
    throw new CoachingExchangeParseError(
      "Import payload failed schema validation.",
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`),
    );
  }

  return parsed.data;
};
