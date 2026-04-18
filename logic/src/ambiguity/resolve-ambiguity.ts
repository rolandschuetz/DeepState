import { randomUUID } from "node:crypto";

import type {
  ResolveAmbiguityCommand,
  SystemState,
} from "@ineedabossagent/shared-contracts";

import type { SqliteDatabase } from "../db/database.js";
import {
  CorrectionRepo,
  MemoryRepo,
  PendingClarificationRepo,
} from "../repos/sqlite-repositories.js";

import type { ClarificationHudModel, EvidenceSnapshot } from "./build-clarification-hud.js";
import {
  applyEvidenceSignalBumps,
  buildConditionalRuleText,
  createDurableRuleFromResolution,
} from "./learning-from-resolution.js";

export type ResolveAmbiguityResult =
  | {
      message: string;
      status: "not_found";
    }
  | {
      message: string;
      status: "validation_error";
    }
  | {
      clarificationId: string;
      correctionId: string;
      status: "success";
      summaryText: string;
    };

const parseHud = (hudJson: string): ClarificationHudModel => {
  const parsed = JSON.parse(hudJson) as ClarificationHudModel;

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof parsed.clarification_id !== "string" ||
    !Array.isArray(parsed.choices)
  ) {
    throw new Error("Invalid stored clarification HUD.");
  }

  return parsed;
};

const parseEvidence = (evidenceJson: string): EvidenceSnapshot => {
  const parsed = JSON.parse(evidenceJson) as EvidenceSnapshot;

  return {
    activeApps: Array.isArray(parsed.activeApps) ? parsed.activeApps : [],
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
    urls: Array.isArray(parsed.urls) ? parsed.urls : [],
    windowTitles: Array.isArray(parsed.windowTitles) ? parsed.windowTitles : [],
  };
};

export const handleResolveAmbiguityCommand = ({
  command,
  database,
  nowIso,
}: {
  command: ResolveAmbiguityCommand;
  database: SqliteDatabase;
  nowIso: string;
}): ResolveAmbiguityResult => {
  const pendingRepo = new PendingClarificationRepo(database);
  const correctionRepo = new CorrectionRepo(database);
  const memoryRepo = new MemoryRepo(database);

  const { clarification_id: clarificationId, answer_id: answerId } = command.payload;

  const row = pendingRepo.getById(clarificationId);

  if (row === null || row.status !== "pending") {
    return {
      message: "No pending clarification matches this id.",
      status: "not_found",
    };
  }

  let hud: ClarificationHudModel;

  try {
    hud = parseHud(row.hudJson);
  } catch {
    return {
      message: "Stored clarification data is invalid.",
      status: "validation_error",
    };
  }

  if (hud.clarification_id !== clarificationId) {
    return {
      message: "Clarification id mismatch.",
      status: "validation_error",
    };
  }

  const choice = hud.choices.find((c) => c.answer_id === answerId);

  if (choice === undefined) {
    return {
      message: "Answer id is not valid for this clarification.",
      status: "validation_error",
    };
  }

  const evidence = parseEvidence(row.evidenceJson);

  const taskTitle = choice.semantics === "task" ? choice.label : null;

  const summaryText = `Clarification: ${choice.label} (${choice.semantics}).`;

  const payload = {
    answer_id: answerId,
    clarification_id: clarificationId,
    evidence,
    remember_choice: command.payload.remember_choice,
    semantics: choice.semantics,
    task_id: choice.task_id,
    user_note: command.payload.user_note,
  };

  const correctionId = randomUUID();

  correctionRepo.create({
    correctionId,
    correctionKind: "clarification",
    createdAt: nowIso,
    payload,
    relatedEntityId: clarificationId,
    summaryText,
  });

  const remember = command.payload.remember_choice;

  if (remember === "remember_as_task" || remember === "remember_as_work_group") {
    const ruleText = buildConditionalRuleText({
      evidence,
      rememberAsWorkGroup: remember === "remember_as_work_group",
      semantics: choice.semantics,
      taskId: choice.task_id,
      taskTitle,
    });

    createDurableRuleFromResolution({
      evidence,
      memoryRepo,
      nowIso,
      rememberAsWorkGroup: remember === "remember_as_work_group",
      ruleText,
    });
  }

  applyEvidenceSignalBumps({
    evidence,
    memoryRepo,
    nowIso,
    positive: true,
  });

  pendingRepo.delete(clarificationId);

  return {
    clarificationId,
    correctionId,
    status: "success",
    summaryText,
  };
};

export const applyResolveAmbiguityToSystemState = ({
  command,
  currentState,
  result,
  resolvedAt,
}: {
  command: ResolveAmbiguityCommand;
  currentState: SystemState;
  resolvedAt: string;
  result: Extract<ResolveAmbiguityResult, { status: "success" }>;
}): SystemState => ({
  ...currentState,
  caused_by_command_id: command.command_id,
  clarification_hud:
    currentState.clarification_hud?.clarification_id === result.clarificationId
      ? null
      : currentState.clarification_hud,
  dashboard: {
    ...currentState.dashboard,
    ambiguity_queue: currentState.dashboard.ambiguity_queue.map((item) =>
      item.ambiguity_id === result.clarificationId
        ? {
            ...item,
            resolution_summary: result.summaryText,
            status: "resolved",
          }
        : item,
    ),
    header: {
      ...currentState.dashboard.header,
      summary_text: result.summaryText,
    },
  },
  emitted_at: resolvedAt,
  stream_sequence: currentState.stream_sequence + 1,
});
