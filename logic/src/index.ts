export {
  createBridgeServer,
} from "./server/bridge-server.js";

export {
  isFeatureFlagEnabled,
  loadRuntimeConfig,
} from "./config/runtime-config.js";

export {
  DEFAULT_SQLITE_BUSY_TIMEOUT_MS,
  openDatabase,
} from "./db/database.js";

export type {
  SqliteDatabase,
} from "./db/database.js";

export {
  listAppliedMigrations,
  runMigrations,
  runStartupMigrations,
  withMigrationLock,
} from "./db/migrations.js";

export type {
  AppliedMigration,
  SqliteMigration,
} from "./db/migrations.js";

export {
  migrationSmokeTestFixtureMigrations,
} from "./db/migration-smoke-test-fixture.js";

export {
  MigrationExecutionError,
  MigrationLockedError,
} from "./db/migrations.js";

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
