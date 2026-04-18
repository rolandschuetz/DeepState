import { coachingExchangeSchema, type CoachingExchange } from "@ineedabossagent/shared-contracts";

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

export const parseCoachingExchange = (rawText: string): CoachingExchange => {
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

  const parsed = coachingExchangeSchema.safeParse(parsedJson);

  if (!parsed.success) {
    throw new CoachingExchangeParseError(
      "Import payload failed schema validation.",
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`),
    );
  }

  return parsed.data;
};
