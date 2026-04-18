import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  appMigrations,
  createDefaultSystemState,
  handleNotificationActionCommand,
  openDatabase,
  runStartupMigrations,
  type SqliteDatabase,
} from "../src/index.js";
import { InterventionRepo } from "../src/repos/sqlite-repositories.js";

const openConnections: SqliteDatabase[] = [];

afterEach(() => {
  for (const database of openConnections.splice(0)) {
    database.close();
  }
});

const createDatabase = (): SqliteDatabase => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ineedabossagent-intervention-outcomes-"));
  const database = openDatabase({
    dbPath: join(tempDirectory, "logic.sqlite"),
  });

  runStartupMigrations(database, appMigrations);
  openConnections.push(database);
  return database;
};

describe("handleNotificationActionCommand", () => {
  it("persists intervention outcomes and clears the active intervention when acted on", () => {
    const database = createDatabase();
    const interventionRepo = new InterventionRepo(database);

    interventionRepo.create({
      actions: [
        {
          actionId: "action_1",
          label: "Return now",
          semanticAction: "return_now",
        },
      ],
      body: "Return to the task.",
      createdAt: "2026-04-18T10:00:00Z",
      dedupeKey: "hard_drift:task_1",
      expiresAt: null,
      interventionId: "intervention_1",
      kind: "hard_drift",
      presentation: "both",
      severity: "warning",
      sourceClassificationId: null,
      suppressNativeNotification: false,
      suppressionReason: null,
      title: "Check. Refocus now?",
    });

    const baseState = createDefaultSystemState();

    const nextState = handleNotificationActionCommand({
      command: {
        command_id: "cccccccc-1111-4222-8333-dddddddddddd",
        kind: "notification_action",
        payload: {
          action_id: "action_1",
          intervention_id: "intervention_1",
        },
        schema_version: "1.0.0",
        sent_at: "2026-04-18T10:01:00Z",
      },
      currentState: {
        ...baseState,
        intervention: {
          actions: [
            {
              action_id: "action_1",
              label: "Return now",
              semantic_action: "return_now",
            },
          ],
          body: "Return to the task.",
          created_at: "2026-04-18T10:00:00Z",
          dedupe_key: "hard_drift:task_1",
          expires_at: null,
          intervention_id: "intervention_1",
          kind: "hard_drift",
          presentation: "both",
          severity: "warning",
          suppress_native_notification: false,
          suppression_reason: null,
          title: "Check. Refocus now?",
        },
        dashboard: {
          ...baseState.dashboard,
          header: {
            ...baseState.dashboard.header,
            mode: "running",
            summary_text: "Waiting for response.",
          },
        },
        mode: "running",
      },
      database,
      recordedAt: "2026-04-18T10:01:00Z",
    });

    const outcomes = interventionRepo.listOutcomes();

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.outcomeKind).toBe("return_now");
    expect(nextState.intervention).toBeNull();
    expect(nextState.dashboard.header.summary_text).toContain("Return-now action recorded");
  });
});
