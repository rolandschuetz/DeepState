import { randomUUID } from "node:crypto";

import type { Command, SystemState } from "@ineedabossagent/shared-contracts";

import type { SqliteDatabase } from "../db/database.js";
import { InterventionRepo } from "../repos/sqlite-repositories.js";

const buildSummaryText = (semanticAction: string): string => {
  switch (semanticAction) {
    case "return_now":
      return "Return-now action recorded.";
    case "intentional_detour":
      return "Intentional detour recorded.";
    case "pause_10_minutes":
      return "Pause-for-10-minutes action recorded.";
    case "open_dashboard":
      return "Dashboard-open action recorded.";
    case "dismiss":
      return "Intervention dismissal recorded.";
    case "confirm_milestone":
      return "Milestone confirmation recorded.";
    case "dismiss_milestone":
      return "Milestone dismissal recorded.";
    default:
      return "Intervention action recorded.";
  }
};

/**
 * Persists user responses to interventions so prompts and their outcomes stay reviewable.
 */
export const handleNotificationActionCommand = ({
  command,
  currentState,
  database,
  recordedAt = new Date().toISOString(),
}: {
  command: Extract<Command, { kind: "notification_action" }>;
  currentState: SystemState;
  database: SqliteDatabase;
  recordedAt?: string;
}): SystemState => {
  const interventionRepo = new InterventionRepo(database);
  const intervention = interventionRepo.getById(command.payload.intervention_id);

  if (intervention === null) {
    throw new Error(`Intervention ${command.payload.intervention_id} was not found.`);
  }

  const action = intervention.actions.find(
    (candidate) => candidate.actionId === command.payload.action_id,
  );

  if (action === undefined) {
    throw new Error(
      `Action ${command.payload.action_id} was not found on intervention ${command.payload.intervention_id}.`,
    );
  }

  interventionRepo.createOutcome({
    actionId: action.actionId,
    interventionId: intervention.interventionId,
    note: null,
    outcomeId: randomUUID(),
    outcomeKind: action.semanticAction,
    recordedAt,
  });

  return {
    ...currentState,
    caused_by_command_id: command.command_id,
    dashboard: {
      ...currentState.dashboard,
      header: {
        ...currentState.dashboard.header,
        summary_text: buildSummaryText(action.semanticAction),
      },
    },
    intervention:
      currentState.intervention?.intervention_id === intervention.interventionId
        ? null
        : currentState.intervention,
    emitted_at: recordedAt,
    stream_sequence: currentState.stream_sequence + 1,
  };
};
