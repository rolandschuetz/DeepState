import { randomUUID } from "node:crypto";

import type { Command } from "@ineedabossagent/shared-contracts";

type CommandActionResultBase = {
  correlation_id: string;
  command_id: string | null;
  message: string;
};

export type CommandActionSuccess = CommandActionResultBase & {
  kind: Command["kind"];
  status: "success";
};

export type CommandActionValidationError = CommandActionResultBase & {
  issues: string[];
  status: "validation_error";
};

export type CommandActionRetryableFailure = CommandActionResultBase & {
  status: "retryable_failure";
};

export type CommandActionFatalFailure = CommandActionResultBase & {
  status: "fatal_failure";
};

export type CommandActionResult =
  | CommandActionSuccess
  | CommandActionValidationError
  | CommandActionRetryableFailure
  | CommandActionFatalFailure;

export class RetryableCommandError extends Error {}

export const createCommandCorrelationId = (): string => randomUUID();
