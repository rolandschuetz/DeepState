import type { PrivacyFilterAudit } from "./privacy-filter.js";
import type { PrivacyFilter } from "./privacy-filter.js";
import type { NormalizedScreenpipeEvidence } from "../screenpipe/evidence-normalizer.js";

export type EvidenceSanitizerAudit = {
  droppedPrivateContextCount: number;
  privacyFilter: PrivacyFilterAudit;
  redactedFieldCount: number;
};

export type EvidenceSanitizerResult = {
  audit: EvidenceSanitizerAudit;
  persistable: NormalizedScreenpipeEvidence[];
};

type TextRedactionRule = {
  placeholder:
    | "[redacted_email]"
    | "[redacted_card]"
    | "[redacted_token]"
    | "[redacted_secret]";
  regex: RegExp;
};

const TEXT_REDACTION_RULES: TextRedactionRule[] = [
  {
    placeholder: "[redacted_email]",
    regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  },
  {
    placeholder: "[redacted_card]",
    regex: /\b(?:\d[ -]*?){13,19}\b/g,
  },
  {
    placeholder: "[redacted_token]",
    regex:
      /\b(?:(?:sk|rk|pk)[_-][A-Za-z0-9_-]{8,}|(?:ghp|github_pat)_[A-Za-z0-9_-]{8,})\b/g,
  },
  {
    placeholder: "[redacted_secret]",
    regex:
      /\b(?:password|passcode|otp|cvv|secret)\s*[:=]\s*\S+\b/gi,
  },
];

const PRIVATE_CONTEXT_PATTERNS = [
  /\bincognito\b/i,
  /\bprivate browsing\b/i,
  /\bprivate window\b/i,
  /\binprivate\b/i,
];

const redactText = (
  value: string | null,
): { redacted: boolean; value: string | null } => {
  if (value === null) {
    return { redacted: false, value };
  }

  let nextValue = value;
  let redacted = false;

  for (const rule of TEXT_REDACTION_RULES) {
    const replacedValue = nextValue.replace(rule.regex, rule.placeholder);

    if (replacedValue !== nextValue) {
      redacted = true;
      nextValue = replacedValue;
    }
  }

  return {
    redacted,
    value: nextValue,
  };
};

const redactTextArray = (
  values: string[],
): { redactedCount: number; values: string[] } => {
  let redactedCount = 0;
  const nextValues = values.map((value) => {
    const redacted = redactText(value);

    if (redacted.redacted) {
      redactedCount += 1;
    }

    return redacted.value ?? value;
  });

  return {
    redactedCount,
    values: nextValues,
  };
};

const isPrivateContext = (record: NormalizedScreenpipeEvidence): boolean =>
  [record.windowTitle, record.url, record.appName, record.accessibilityText].some(
    (value) =>
      value !== null &&
      PRIVATE_CONTEXT_PATTERNS.some((pattern) => pattern.test(value)),
  );

const sanitizeEvidenceRecord = (
  record: NormalizedScreenpipeEvidence,
): { record: NormalizedScreenpipeEvidence; redactedFieldCount: number } => {
  let redactedFieldCount = 0;

  const accessibilityText = redactText(record.accessibilityText);
  const ocrText = redactText(record.ocrText);
  const windowTitle = redactText(record.windowTitle);
  const uiText = redactTextArray(record.uiText);

  for (const field of [accessibilityText, ocrText, windowTitle]) {
    if (field.redacted) {
      redactedFieldCount += 1;
    }
  }

  redactedFieldCount += uiText.redactedCount;

  return {
    record: {
      ...record,
      accessibilityText: accessibilityText.value,
      ocrText: ocrText.value,
      uiText: uiText.values,
      windowTitle: windowTitle.value,
    },
    redactedFieldCount,
  };
};

export const sanitizeEvidenceForPersistence = (
  records: NormalizedScreenpipeEvidence[],
  privacyFilter: PrivacyFilter,
): EvidenceSanitizerResult => {
  const nonPrivateRecords: NormalizedScreenpipeEvidence[] = [];
  let droppedPrivateContextCount = 0;
  let redactedFieldCount = 0;

  for (const record of records) {
    if (isPrivateContext(record)) {
      droppedPrivateContextCount += 1;
      continue;
    }

    const sanitized = sanitizeEvidenceRecord(record);
    redactedFieldCount += sanitized.redactedFieldCount;
    nonPrivateRecords.push(sanitized.record);
  }

  const filtered = privacyFilter.filterEvidence(nonPrivateRecords);

  return {
    audit: {
      droppedPrivateContextCount,
      privacyFilter: filtered.audit,
      redactedFieldCount,
    },
    persistable: filtered.kept,
  };
};
