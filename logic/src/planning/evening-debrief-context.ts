import type { SystemState } from "@ineedabossagent/shared-contracts";

type DurableRuleReviewItem = SystemState["dashboard"]["review_queue"][number];

import { rollupEpisodesByTask } from "../progress/risk-detector.js";
import type { SqliteDatabase } from "../db/database.js";
import {
  CorrectionRepo,
  DailyPlanRepo,
  EpisodeRepo,
  GoalContractRepo,
  ImportAuditLogRepo,
  InterventionRepo,
  ProgressRepo,
  RuleProposalRepo,
  TaskRepo,
  type DailyPlanRecord,
  type EpisodeRecord,
  type ProgressEstimateRecord,
} from "../repos/sqlite-repositories.js";
import { buildExplainabilityForDashboard } from "../explainability/explainability-generator.js";

export const nextLocalDateUtc = (localDate: string): string => {
  const base = new Date(`${localDate}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + 1);
  return base.toISOString().slice(0, 10);
};

const utcDayRange = (localDate: string): { endExclusive: string; startInclusive: string } => ({
  startInclusive: `${localDate}T00:00:00.000Z`,
  endExclusive: `${nextLocalDateUtc(localDate)}T00:00:00.000Z`,
});

const isIsoInUtcDay = (iso: string, localDate: string): boolean => {
  const { endExclusive, startInclusive } = utcDayRange(localDate);
  return iso >= startInclusive && iso < endExclusive;
};

const episodeDurationSeconds = (episode: EpisodeRecord): number =>
  Math.max(
    0,
    Math.round((Date.parse(episode.endedAt) - Date.parse(episode.startedAt)) / 1_000),
  );

/**
 * Reuse the explainability formatter so exported episodes carry the same evidence/debugging shape as runtime UI diagnostics.
 */
export const explainabilityBulletsForEpisode = (episode: EpisodeRecord): string[] => {
  const fromEvidence = episode.topEvidence
    .filter((line) => line.trim().length > 0)
    .slice(0, 3)
    .map((detail, index) => ({
      code: "episode_evidence",
      detail,
      weight: Math.max(0.45, 0.9 - index * 0.1),
    }));

  const support = episode.isSupportWork ? "support work" : "primary work";
  const taskHint =
    episode.matchedTaskId === null ? "unmatched task" : `matched task ${episode.matchedTaskId}`;

  const synthetic = [
    {
      code: "episode_runtime_state",
      detail: `Runtime state ${episode.runtimeState} (${support}, ${taskHint}).`,
      weight: 0.54,
    },
    {
      code: "episode_duration",
      detail: `Window duration about ${episodeDurationSeconds(episode)}s.`,
      weight: 0.42,
    },
  ];

  return buildExplainabilityForDashboard({
    confidenceRatio: episode.confidenceRatio,
    raw: [...fromEvidence, ...synthetic],
  }).map((item) => item.detail);
};

export type EveningDebriefPacketInput = {
  database: SqliteDatabase;
  localDate: string;
  plan: DailyPlanRecord;
  planId: string;
};

/**
 * Builds a JSON debrief packet from canonical SQLite rows (plan, episodes, progress, corrections, interventions).
 * Missing Phase 5 richness surfaces as empty arrays / zeros rather than failing.
 */
export const buildEveningDebriefPacket = ({
  database,
  localDate,
  plan,
  planId,
}: EveningDebriefPacketInput): string => {
  const taskRepo = new TaskRepo(database);
  const goalRepo = new GoalContractRepo(database);
  const episodeRepo = new EpisodeRepo(database);
  const progressRepo = new ProgressRepo(database);
  const correctionRepo = new CorrectionRepo(database);
  const interventionRepo = new InterventionRepo(database);

  const tasks = taskRepo
    .listAll()
    .filter((task) => task.planId === planId)
    .sort((left, right) => left.sortOrder - right.sortOrder);

  const goals = goalRepo.listAll().filter((goal) => goal.planId === planId);

  const episodes = episodeRepo
    .listAll()
    .filter(
      (episode) => isIsoInUtcDay(episode.startedAt, localDate) || isIsoInUtcDay(episode.endedAt, localDate),
    );

  const rollup = rollupEpisodesByTask(episodes);

  const latestProgressByTask = new Map<string, ProgressEstimateRecord>();

  const progressRows = progressRepo
    .listAll()
    .filter((row) => row.planId === planId)
    .sort((left, right) => left.estimatedAt.localeCompare(right.estimatedAt));

  for (const row of progressRows) {
    if (row.taskId !== null) {
      latestProgressByTask.set(row.taskId, row);
    }
  }

  const corrections = correctionRepo
    .listAll()
    .filter((correction) => isIsoInUtcDay(correction.createdAt, localDate));

  const interventions = interventionRepo
    .listAll()
    .filter((intervention) => isIsoInUtcDay(intervention.createdAt, localDate));

  const estimateVsActual = tasks.map((task) => {
    const latest = latestProgressByTask.get(task.taskId);
    const rolled = rollup.get(task.taskId);
    const aligned = rolled?.alignedSeconds ?? 0;
    const support = rolled?.supportSeconds ?? 0;
    const drift = rolled?.driftSeconds ?? 0;

    return {
      aligned_seconds_observed: aligned,
      drift_seconds_observed: drift,
      intended_work_seconds_today: task.intendedWorkSecondsToday,
      latest_progress_snapshot: latest
        ? {
            confidence_ratio: latest.confidenceRatio,
            estimated_at: latest.estimatedAt,
            eta_remaining_seconds: latest.etaRemainingSeconds,
            latest_status_text: latest.latestStatusText,
            progress_ratio: latest.progressRatio,
            risk_level: latest.riskLevel,
          }
        : null,
      support_seconds_observed: support,
      task_id: task.taskId,
      task_title: task.title,
    };
  });

  const episodeSummaries = episodes.map((episode) => ({
    duration_seconds: episodeDurationSeconds(episode),
    ended_at: episode.endedAt,
    evidence_bullets: explainabilityBulletsForEpisode(episode),
    episode_id: episode.episodeId,
    is_support_work: episode.isSupportWork,
    matched_task_id: episode.matchedTaskId,
    runtime_state: episode.runtimeState,
    started_at: episode.startedAt,
  }));

  const driftBlocks = episodes.filter(
    (episode) =>
      episode.runtimeState === "soft_drift" ||
      episode.runtimeState === "hard_drift" ||
      episode.runtimeState === "uncertain",
  );

  const suggestedLearningCandidates: string[] = [];

  for (const episode of driftBlocks.slice(0, 10)) {
    suggestedLearningCandidates.push(
      `${episode.runtimeState} (${episodeDurationSeconds(episode)}s) — ${explainabilityBulletsForEpisode(episode)[0] ?? "see evidence"}`,
    );
  }

  const unresolvedAmbiguities: string[] = episodes
    .filter((episode) => episode.runtimeState === "uncertain")
    .map(
      (episode) =>
        `Uncertain episode ${episode.episodeId} (${episode.startedAt}–${episode.endedAt})`,
    );

  const payload = {
    corrections: corrections.map((correction) => ({
      correction_id: correction.correctionId,
      created_at: correction.createdAt,
      kind: correction.correctionKind,
      summary_text: correction.summaryText,
    })),
    drift_and_ambiguous_blocks: driftBlocks.map((episode) => ({
      duration_seconds: episodeDurationSeconds(episode),
      evidence_bullets: explainabilityBulletsForEpisode(episode),
      episode_id: episode.episodeId,
      runtime_state: episode.runtimeState,
      started_at: episode.startedAt,
    })),
    episode_summaries: episodeSummaries,
    estimate_vs_actual: estimateVsActual,
    goals: goals.map((goal) => ({
      goal_id: goal.goalId,
      success_definition: goal.successDefinition,
      title: goal.title,
    })),
    interventions: interventions.map((intervention) => ({
      body: intervention.body,
      created_at: intervention.createdAt,
      dedupe_key: intervention.dedupeKey,
      intervention_id: intervention.interventionId,
      kind: intervention.kind,
      title: intervention.title,
    })),
    local_date: localDate,
    packet_kind: "evening_debrief_context" as const,
    plan: {
      imported_at: plan.importedAt,
      notes_for_tracker: plan.notesForTracker,
      plan_id: plan.planId,
      total_intended_work_seconds: plan.totalIntendedWorkSeconds,
    },
    schema_version: "1.0.0" as const,
    suggested_learning_candidates: suggestedLearningCandidates,
    tasks: tasks.map((task) => ({
      allowed_support_work: task.allowedSupportWork,
      intended_work_seconds_today: task.intendedWorkSecondsToday,
      likely_detours_that_still_count: task.likelyDetours,
      progress_kind: task.progressKind,
      success_definition: task.successDefinition,
      task_id: task.taskId,
      title: task.title,
      total_remaining_effort_seconds: task.totalRemainingEffortSeconds,
    })),
    unresolved_ambiguities: unresolvedAmbiguities,
  };

  return JSON.stringify(payload, null, 2);
};

export const generateEveningPrompt = (debriefPacketText: string): string =>
  [
    "You are preparing a structured evening debrief for a local focus coaching app.",
    "Return strict JSON only. Do not include markdown fences or any prose before or after the JSON.",
    'The JSON must validate against schema_version "1.0.0" and exchange_type "evening_debrief".',
    "Reflect on the debrief packet: what moved forward, what was support work, what was ambiguous, and what should be remembered or not remembered.",
    "task_outcomes must include 1 to 3 items whose task_title values align with the plan tasks when possible.",
    "Use empty arrays for new_support_patterns_to_remember or patterns_to_not_remember when there is nothing to store.",
    "Use corrected_ambiguity_labels for durable relabeling suggestions about work that looked ambiguous or drift-like but should be classified differently next time.",
    "Use tomorrow_suggestions for concrete next-day guidance; use milestone_relevance_summary when a milestone deserves explicit carry-forward context, otherwise set it to null.",
    "Debrief packet JSON:",
    debriefPacketText,
  ].join("\n\n");

const reviewTitleFromProposal = (proposalText: string): string => {
  const trimmed = proposalText.trim();
  if (trimmed.length <= 96) {
    return trimmed;
  }

  return `${trimmed.slice(0, 93)}...`;
};

export const buildReviewQueueFromDatabase = (database: SqliteDatabase): DurableRuleReviewItem[] => {
  const ruleProposalRepo = new RuleProposalRepo(database);

  return ruleProposalRepo
    .listAll()
    .filter((proposal) => proposal.status === "pending")
    .map(
      (proposal): DurableRuleReviewItem => ({
        created_at: proposal.createdAt,
        proposed_rule_text: proposal.proposalText,
        rationale: proposal.rationale,
        review_item_id: proposal.proposalId,
        title: reviewTitleFromProposal(proposal.proposalText),
      }),
    );
};

export const hasAcceptedEveningDebriefForLocalDate = (
  database: SqliteDatabase,
  localDate: string,
): boolean => {
  const importAuditLogRepo = new ImportAuditLogRepo(database);

  return importAuditLogRepo
    .listAll()
    .some(
      (entry) =>
        entry.accepted &&
        entry.exchangeType === "evening_debrief" &&
        entry.localDate === localDate,
    );
};

/** @internal Exported for tests that seed plans without using DailyPlanRepo. */
export const planExistsForLocalDate = (database: SqliteDatabase, localDate: string): boolean => {
  const dailyPlanRepo = new DailyPlanRepo(database);
  return dailyPlanRepo.listAll().some((plan) => plan.localDate === localDate);
};
