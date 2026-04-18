import {
  systemStateSchema,
  type SystemState,
} from "@ineedabossagent/shared-contracts";

import { buildStartupSystemState } from "../bootstrap/startup-state.js";
import type { SqliteDatabase } from "../db/database.js";
import type { ScreenpipeHealthProbe } from "../screenpipe/client.js";

/**
 * Rebuilds canonical state from SQLite after resume, preserving notification permission
 * and incrementing stream sequence.
 */
export const applyResumeToSystemState = ({
  causedByCommandId,
  currentState,
  database,
  screenpipeHealth,
}: {
  causedByCommandId: string | null;
  currentState: SystemState;
  database: SqliteDatabase;
  screenpipeHealth?: ScreenpipeHealthProbe;
}): SystemState => {
  const base = buildStartupSystemState({
    database,
    ...(screenpipeHealth === undefined ? {} : { screenpipeHealth }),
  });

  return systemStateSchema.parse({
    ...base,
    caused_by_command_id: causedByCommandId,
    stream_sequence: currentState.stream_sequence + 1,
    system_health: {
      ...base.system_health,
      notifications: currentState.system_health.notifications,
    },
  });
};
