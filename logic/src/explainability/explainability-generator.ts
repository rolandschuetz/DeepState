import type { ExplainabilityItem } from "@ineedabossagent/shared-contracts";

import type { ClassificationExplainability } from "../classifier/focus-classifier.js";

const sortByStrength = (
  items: ClassificationExplainability[],
): ClassificationExplainability[] =>
  [...items].sort((left, right) => Math.abs(right.weight) - Math.abs(left.weight));

/**
 * Maps classifier reason tuples into 2–3 dashboard-safe bullets plus diagnostics hints.
 */
export const buildExplainabilityForDashboard = ({
  confidenceRatio,
  raw,
}: {
  confidenceRatio: number | null;
  raw: ClassificationExplainability[];
}): ExplainabilityItem[] => {
  const sorted = sortByStrength(raw);
  const positives = sorted.filter((item) => item.weight >= 0).slice(0, 2);
  const negatives = sorted.filter((item) => item.weight < 0).slice(0, 2);

  const primary =
    positives[0] ??
    ({
      code: "insufficient_evidence",
      detail: "Not enough stable signals yet to explain this state.",
      weight: 0,
    } satisfies ClassificationExplainability);

  const secondary =
    positives[1] ??
    negatives[0] ?? {
      code: "confidence_summary",
      detail:
        confidenceRatio === null
          ? "Confidence is still being established."
          : `Model confidence is about ${Math.round(confidenceRatio * 100)}%.`,
      weight: confidenceRatio ?? 0,
    };

  const counterfactualHint: ExplainabilityItem = {
    code: "what_would_change_this",
    detail:
      negatives.length > 0
        ? `Stronger match would require reducing: ${negatives[0]?.detail ?? "conflicting signals"}.`
        : "If the active window clearly matched task keywords, confidence would increase.",
    weight: -0.01,
  };

  const items: ExplainabilityItem[] = [
    {
      code: primary.code,
      detail: primary.detail,
      weight: primary.weight,
    },
    {
      code: secondary.code,
      detail: secondary.detail,
      weight: secondary.weight,
    },
    counterfactualHint,
  ];

  return items.slice(0, 3);
};
