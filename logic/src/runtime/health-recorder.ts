import { randomUUID } from "node:crypto";

import type { HealthStatus, SystemState } from "@ineedabossagent/shared-contracts";

import type { SqliteDatabase } from "../db/database.js";

export type HealthComponent = "screenpipe" | "database" | "bridge" | "scheduler" | "local_ai";

export type HealthTransition = {
  component: HealthComponent;
  /** Optional when using `recordTransitionIfChanged`, which fills `from` from the prior state. */
  from?: HealthStatus | null;
  message: string | null;
  metadata?: unknown;
  to: HealthStatus;
};

export const deriveOverallHealthStatus = (
  databaseStatus: HealthStatus,
  screenpipeStatus: HealthStatus,
): HealthStatus => {
  if (databaseStatus === "down") {
    return "down";
  }

  if (databaseStatus === "degraded" || screenpipeStatus !== "ok") {
    return "degraded";
  }

  return "ok";
};

export const recordHealthTransition = (
  database: SqliteDatabase,
  transition: HealthTransition,
  recordedAt = new Date().toISOString(),
): void => {
  database
    .prepare(
      `
        INSERT INTO runtime_health_events (
          event_id,
          component,
          status,
          message,
          metadata_json,
          recorded_at
        )
        VALUES (@event_id, @component, @status, @message, @metadata_json, @recorded_at)
      `,
    )
    .run({
      component: transition.component,
      event_id: randomUUID(),
      message: transition.message,
      metadata_json: JSON.stringify({
        from: transition.from ?? null,
        metadata: transition.metadata ?? null,
      }),
      recorded_at: recordedAt,
      status: transition.to,
    });
};

export const recordTransitionIfChanged = ({
  database,
  lastByComponent,
  transition,
}: {
  database: SqliteDatabase;
  lastByComponent: Map<HealthComponent, HealthStatus>;
  transition: HealthTransition;
}): void => {
  const previous = lastByComponent.get(transition.component) ?? null;

  if (previous === transition.to) {
    return;
  }

  lastByComponent.set(transition.component, transition.to);
  recordHealthTransition(database, {
    ...transition,
    from: previous,
  });
};

export const mergeSchedulerHealth = (
  systemState: SystemState,
  fastTickLastRanAt: string | null,
  slowTickLastRanAt: string | null,
): SystemState => ({
  ...systemState,
  system_health: {
    ...systemState.system_health,
    scheduler: {
      fast_tick_last_ran_at: fastTickLastRanAt,
      slow_tick_last_ran_at: slowTickLastRanAt,
    },
  },
});

export const mergeDatabaseHealthProbe = (
  systemState: SystemState,
  status: HealthStatus,
  probedAt: string,
): SystemState => {
  const screenpipeStatus = systemState.system_health.screenpipe.status;
  const overall = deriveOverallHealthStatus(status, screenpipeStatus);

  return {
    ...systemState,
    mode: status === "down" ? "logic_error" : systemState.mode,
    system_health: {
      ...systemState.system_health,
      overall_status: overall,
      database: {
        last_error_at: status === "ok" ? null : probedAt,
        last_ok_at: status === "ok" ? probedAt : systemState.system_health.database.last_ok_at,
        message:
          status === "ok"
            ? "Database responsive."
            : "Database is not responsive.",
        status,
      },
    },
  };
};
