import type { SystemState } from "@ineedabossagent/shared-contracts";

import type { AppSettingsRecord } from "../repos/sqlite-repositories.js";

export const mergeObserveOnlySettings = (
  systemState: SystemState,
  settings: AppSettingsRecord | null,
): SystemState => {
  if (settings === null) {
    return systemState;
  }

  const active = settings.observeOnlyTicksRemaining > 0;

  return {
    ...systemState,
    system_health: {
      ...systemState.system_health,
      observe_only: {
        active,
        ticks_remaining: active ? settings.observeOnlyTicksRemaining : null,
      },
    },
  };
};
