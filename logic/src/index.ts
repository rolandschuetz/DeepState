export {
  createBridgeServer,
} from "./server/bridge-server.js";

export {
  createDefaultSystemState,
} from "./system-state/default-system-state.js";

export const LOGIC_WORKSPACE_NAME = "@ineedabossagent/logic";

export const isLogicWorkspaceReady = (): boolean => true;
