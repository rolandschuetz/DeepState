import type { PrivacyExclusionRecord } from "../repos/sqlite-repositories.js";
import type { NormalizedScreenpipeEvidence } from "../screenpipe/evidence-normalizer.js";

export type PrivacyFilterAudit = {
  filteredCount: number;
  keptCount: number;
  totalCount: number;
  totalsByMatchType: Record<PrivacyExclusionRecord["matchType"], number>;
};

export type PrivacyFilterResult = {
  audit: PrivacyFilterAudit;
  kept: NormalizedScreenpipeEvidence[];
};

export type PrivacyFilter = {
  filterEvidence: (
    records: NormalizedScreenpipeEvidence[],
  ) => PrivacyFilterResult;
  shouldExclude: (record: NormalizedScreenpipeEvidence) => boolean;
};

type CompiledExclusion = {
  exclusion: PrivacyExclusionRecord;
  regex: RegExp | null;
};

const emptyAuditTotals = (): PrivacyFilterAudit["totalsByMatchType"] => ({
  app: 0,
  domain: 0,
  url_regex: 0,
  window_title_regex: 0,
});

const tryCompileRegex = (pattern: string): RegExp | null => {
  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
};

const normalizeComparableText = (value: string | null): string | null =>
  value === null ? null : value.trim().toLowerCase();

const matchesExclusion = (
  record: NormalizedScreenpipeEvidence,
  compiledExclusion: CompiledExclusion,
): boolean => {
  const { exclusion, regex } = compiledExclusion;

  switch (exclusion.matchType) {
    case "app": {
      const pattern = normalizeComparableText(exclusion.pattern);
      const appIdentifier = normalizeComparableText(record.appIdentifier);
      const appName = normalizeComparableText(record.appName);

      return pattern !== null && (appIdentifier === pattern || appName === pattern);
    }
    case "domain": {
      const pattern = normalizeComparableText(exclusion.pattern);
      const host = normalizeComparableText(record.urlSummary.host);

      return pattern !== null && host !== null && (host === pattern || host.endsWith(`.${pattern}`));
    }
    case "url_regex":
      return regex !== null && record.url !== null && regex.test(record.url);
    case "window_title_regex":
      return regex !== null && record.windowTitle !== null && regex.test(record.windowTitle);
  }
};

export const createPrivacyFilter = (
  exclusions: PrivacyExclusionRecord[],
): PrivacyFilter => {
  const compiledExclusions = exclusions
    .filter((exclusion) => exclusion.enabled)
    .map((exclusion) => ({
      exclusion,
      regex:
        exclusion.matchType === "url_regex" ||
        exclusion.matchType === "window_title_regex"
          ? tryCompileRegex(exclusion.pattern)
          : null,
    }));

  return {
    filterEvidence: (
      records: NormalizedScreenpipeEvidence[],
    ): PrivacyFilterResult => {
      const totalsByMatchType = emptyAuditTotals();
      const kept: NormalizedScreenpipeEvidence[] = [];

      for (const record of records) {
        const matchedExclusion = compiledExclusions.find((compiledExclusion) =>
          matchesExclusion(record, compiledExclusion),
        );

        if (matchedExclusion === undefined) {
          kept.push(record);
          continue;
        }

        totalsByMatchType[matchedExclusion.exclusion.matchType] += 1;
      }

      return {
        audit: {
          filteredCount: records.length - kept.length,
          keptCount: kept.length,
          totalCount: records.length,
          totalsByMatchType,
        },
        kept,
      };
    },
    shouldExclude: (record: NormalizedScreenpipeEvidence): boolean =>
      compiledExclusions.some((compiledExclusion) =>
        matchesExclusion(record, compiledExclusion),
      ),
  };
};
