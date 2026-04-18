import { randomUUID } from "node:crypto";

import type { MemoryRepo } from "../repos/sqlite-repositories.js";

import type { EvidenceSnapshot } from "./build-clarification-hud.js";

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const DEFAULT_RULE_CONFIDENCE = 0.55;
const SIGNAL_DELTA = 0.06;
const DECAY_FACTOR = 0.995;

export const buildConditionalRuleText = ({
  evidence,
  rememberAsWorkGroup,
  semantics,
  taskId,
  taskTitle,
}: {
  evidence: EvidenceSnapshot;
  rememberAsWorkGroup: boolean;
  semantics: string;
  taskId: string | null;
  taskTitle: string | null;
}): string => {
  const parts: string[] = [];

  if (evidence.activeApps.length > 0) {
    parts.push(`apps=${evidence.activeApps.join(",")}`);
  }

  if (evidence.urls.length > 0) {
    parts.push(`urls=${evidence.urls.join(",")}`);
  }

  if (evidence.windowTitles.length > 0) {
    parts.push(`titles=${evidence.windowTitles.join(",")}`);
  }

  if (evidence.keywords.length > 0) {
    parts.push(`keywords=${evidence.keywords.join(",")}`);
  }

  const when = parts.length > 0 ? parts.join(" AND ") : "context=unknown";

  if (rememberAsWorkGroup) {
    return `WHEN (${when}) THEN map to work-group pattern (ambiguous multi-goal work); confirm in review.`;
  }

  if (semantics === "task" && taskTitle !== null && taskId !== null) {
    return `WHEN (${when}) THEN lean toward task "${taskTitle}" [${taskId}] (conditional; not a global app rule).`;
  }

  if (semantics === "support_work") {
    return `WHEN (${when}) THEN lean toward support work for the active plan (conditional).`;
  }

  return `WHEN (${when}) THEN user labeled context as ${semantics} (conditional).`;
};

export const upsertSignalWeight = ({
  delta,
  memoryRepo,
  nowIso,
  signalKey,
}: {
  delta: number;
  memoryRepo: MemoryRepo;
  nowIso: string;
  signalKey: string;
}): void => {
  const existing = memoryRepo.getSignalWeightById(signalKey);
  const prior = existing?.weight ?? 0;
  const next = clamp(prior * DECAY_FACTOR + delta, -1, 1);

  const record = {
    signalKey,
    updatedAt: nowIso,
    weight: next,
  };

  if (existing === null) {
    memoryRepo.createSignalWeight(record);
  } else {
    memoryRepo.updateSignalWeight(record);
  }
};

export const applyEvidenceSignalBumps = ({
  evidence,
  memoryRepo,
  nowIso,
  positive,
}: {
  evidence: EvidenceSnapshot;
  memoryRepo: MemoryRepo;
  nowIso: string;
  positive: boolean;
}): void => {
  const delta = positive ? SIGNAL_DELTA : -SIGNAL_DELTA;

  for (const app of evidence.activeApps.slice(0, 2)) {
    upsertSignalWeight({
      delta,
      memoryRepo,
      nowIso,
      signalKey: `sig:app:${app}`,
    });
  }

  for (const url of evidence.urls.slice(0, 2)) {
    upsertSignalWeight({
      delta,
      memoryRepo,
      nowIso,
      signalKey: `sig:url:${url.slice(0, 120)}`,
    });
  }
};

export const createDurableRuleFromResolution = ({
  evidence,
  memoryRepo,
  nowIso,
  rememberAsWorkGroup,
  ruleText,
}: {
  evidence: EvidenceSnapshot;
  memoryRepo: MemoryRepo;
  nowIso: string;
  rememberAsWorkGroup: boolean;
  ruleText: string;
}): void => {
  memoryRepo.createDurableRule({
    confidence: DEFAULT_RULE_CONFIDENCE,
    createdAt: nowIso,
    lastValidatedAt: nowIso,
    recency: Math.min(
      10,
      evidence.keywords.length + evidence.activeApps.length,
    ),
    ruleId: randomUUID(),
    ruleText,
    source: rememberAsWorkGroup
      ? "ambiguity_remember_work_group"
      : "ambiguity_remember_task",
  });
};
