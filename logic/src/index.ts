export {
  createBridgeServer,
} from "./server/bridge-server.js";

export {
  isFeatureFlagEnabled,
  loadRuntimeConfig,
} from "./config/runtime-config.js";

export {
  createDiagnosticsLogSink,
  createModuleLogger,
  DiagnosticsLogStore,
} from "./diagnostics/logger.js";

export {
  isRuntimeEvaluationEnabled,
  runWhenModeIsRunning,
} from "./runtime/mode-gate.js";

export {
  createDefaultSystemState,
} from "./system-state/default-system-state.js";

export const LOGIC_WORKSPACE_NAME = "@ineedabossagent/logic";

export const isLogicWorkspaceReady = (): boolean => true;
