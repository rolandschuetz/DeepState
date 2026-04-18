import { randomUUID } from "node:crypto";

import {
  eveningDebriefExchangeSchema,
  type EveningDebriefExchange,
  type SystemState,
} from "@ineedabossagent/shared-contracts";

import { buildStartupSystemState } from "../bootstrap/startup-state.js";
import type { SqliteDatabase } from "../db/database.js";
import {
  DailyPlanRepo,
  ImportAuditLogRepo,
  MemoryRepo,
  RuleProposalRepo,
} from "../repos/sqlite-repositories.js";

import {
  CoachingExchangeParseError,
  parseCoachingExchange,
} from "./coaching-exchange-parse.js";

export {
  buildEveningDebriefPacket,
  buildReviewQueueFromDatabase,
  explainabilityBulletsForEpisode,
  generateEveningPrompt,
  hasAcceptedEveningDebriefForLocalDate,
  nextLocalDateUtc,
  planExistsForLocalDate,
} from "./evening-debrief-context.js";

const EVENING_DEBRIEF_SOURCE_PREFIX = "evening_debrief:";

const buildEveningMemorySummaryText = (exchange: EveningDebriefExchange): string =>
  [
    `Overall: ${exchange.overall_day_summary}`,
    exchange.carry_forward_to_tomorrow === null
      ? null
      : `Carry forward: ${exchange.carry_forward_to_tomorrow}`,
    exchange.coaching_note_for_tomorrow === null
      ? null
      : `Coaching note for tomorrow: ${exchange.coaching_note_for_tomorrow}`,
    exchange.tomorrow_suggestions === undefined || exchange.tomorrow_suggestions.length === 0
      ? null
      : [
          "Tomorrow suggestions:",
          ...exchange.tomorrow_suggestions.map((suggestion) => `- ${suggestion}`),
        ].join("\n"),
    exchange.milestone_relevance_summary === undefined ||
    exchange.milestone_relevance_summary === null ||
    exchange.milestone_relevance_summary.trim().length === 0
      ? null
      : `Milestone relevance: ${exchange.milestone_relevance_summary}`,
    exchange.task_outcomes
      .map(
        (outcome) =>
          `- ${outcome.task_title}: ${outcome.did_progress_occur} — progress: ${outcome.what_counted_as_real_progress ?? "n/a"}`,
      )
      .join("\n"),
  ]
    .filter((line): line is string => line !== null)
    .join("\n\n");

export const parseEveningDebriefExchange = (rawText: string): EveningDebriefExchange => {
  const parsed = parseCoachingExchange(rawText);

  if (parsed.exchange_type !== "evening_debrief") {
    throw new CoachingExchangeParseError(
      `Expected an evening_debrief payload but received ${parsed.exchange_type}.`,
    );
  }

  return eveningDebriefExchangeSchema.parse(parsed);
};

export const importEveningDebriefExchange = ({
  commandId = null,
  database,
  exchange,
  importedAt = new Date().toISOString(),
  runtimeSessionId,
  source,
}: {
  commandId?: string | null;
  database: SqliteDatabase;
  exchange: EveningDebriefExchange;
  importedAt?: string;
  runtimeSessionId?: string;
  source: "clipboard" | "manual_paste";
}): SystemState => {
  const dailyPlanRepo = new DailyPlanRepo(database);
  const plansForDate = dailyPlanRepo.listAll().filter((plan) => plan.localDate === exchange.local_date);

  if (plansForDate.length === 0) {
    throw new CoachingExchangeParseError(
      `No imported daily plan exists for local_date ${exchange.local_date}. Import a morning plan first.`,
    );
  }

  const memoryRepo = new MemoryRepo(database);
  const ruleProposalRepo = new RuleProposalRepo(database);
  const importAuditLogRepo = new ImportAuditLogRepo(database);

  database.transaction(() => {
    for (const note of memoryRepo.listDailyMemoryNotes()) {
      if (note.localDate === exchange.local_date && note.source === "evening_debrief") {
        memoryRepo.deleteDailyMemoryNote(note.noteId);
      }
    }

    for (const proposal of ruleProposalRepo.listAll()) {
      if (
        proposal.status === "pending" &&
        proposal.source === `${EVENING_DEBRIEF_SOURCE_PREFIX}${exchange.local_date}`
      ) {
        ruleProposalRepo.delete(proposal.proposalId);
      }
    }

    memoryRepo.createDailyMemoryNote({
      createdAt: importedAt,
      localDate: exchange.local_date,
      noteId: randomUUID(),
      source: "evening_debrief",
      summaryText: buildEveningMemorySummaryText(exchange),
    });

    const sourceTag = `${EVENING_DEBRIEF_SOURCE_PREFIX}${exchange.local_date}`;
    const correctedAmbiguityLabels = exchange.corrected_ambiguity_labels ?? [];

    for (const pattern of exchange.new_support_patterns_to_remember) {
      const trimmed = pattern.trim();
      if (trimmed.length === 0) {
        continue;
      }

      ruleProposalRepo.create({
        createdAt: importedAt,
        proposalId: randomUUID(),
        proposalText: trimmed,
        rationale: "Suggested during evening debrief as support work to remember for classification.",
        reviewedAt: null,
        source: sourceTag,
        status: "pending",
      });
    }

    for (const pattern of exchange.patterns_to_not_remember) {
      const trimmed = pattern.trim();
      if (trimmed.length === 0) {
        continue;
      }

      ruleProposalRepo.create({
        createdAt: importedAt,
        proposalId: randomUUID(),
        proposalText: `Do not remember as durable rule: ${trimmed}`,
        rationale:
          "User indicated during evening debrief that this pattern should not be promoted to durable memory.",
        reviewedAt: null,
        source: sourceTag,
        status: "pending",
      });
    }

    const boundary = exchange.corrections_for_task_boundaries?.trim() ?? "";
    if (boundary.length > 0) {
      ruleProposalRepo.create({
        createdAt: importedAt,
        proposalId: randomUUID(),
        proposalText: boundary,
        rationale: "Task boundary corrections captured during evening debrief.",
        reviewedAt: null,
        source: sourceTag,
        status: "pending",
      });
    }

    for (const correction of correctedAmbiguityLabels) {
      const trimmed = correction.trim();
      if (trimmed.length === 0) {
        continue;
      }

      ruleProposalRepo.create({
        createdAt: importedAt,
        proposalId: randomUUID(),
        proposalText: trimmed,
        rationale:
          "Ambiguity relabeling correction captured during evening debrief for future classification review.",
        reviewedAt: null,
        source: sourceTag,
        status: "pending",
      });
    }

    importAuditLogRepo.create({
      accepted: true,
      auditId: randomUUID(),
      exchangeType: "evening_debrief",
      importedAt,
      localDate: exchange.local_date,
      note: null,
      payload: exchange,
      schemaVersion: exchange.schema_version,
      source,
    });
  })();

  const nextState = buildStartupSystemState({
    database,
    emittedAt: importedAt,
    ...(runtimeSessionId === undefined ? {} : { runtimeSessionId }),
  });

  return {
    ...nextState,
    caused_by_command_id: commandId,
    dashboard: {
      ...nextState.dashboard,
      header: {
        ...nextState.dashboard.header,
        summary_text: "Evening debrief imported. Review pending rule proposals.",
      },
      evening_exchange: {
        debrief_packet_text: null,
        prompt_text: null,
        status: "completed",
      },
    },
    menu_bar: {
      ...nextState.menu_bar,
      primary_label: exchange.overall_day_summary.slice(0, 64),
    },
  };
};
