export {
  buildStartupSystemState,
} from "./bootstrap/startup-state.js";

export {
  DEFAULT_PRIVACY_EXCLUSIONS,
  seedDefaultPrivacyExclusions,
} from "./privacy/default-privacy-exclusions.js";

export {
  createBridgeServer,
} from "./server/bridge-server.js";

export {
  isFeatureFlagEnabled,
  loadRuntimeConfig,
} from "./config/runtime-config.js";

export {
  appMigrations,
  baseAppMigrations,
  learningAppMigrations,
  observationAppMigrations,
  planningAppMigrations,
} from "./db/app-migrations.js";

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

export {
  isSqliteBusyError,
  runWalCheckpoint,
  withSqliteBusyRetry,
} from "./db/maintenance.js";

export type {
  WalCheckpointMode,
  WalCheckpointResult,
} from "./db/maintenance.js";

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
  ClassificationRepo,
  CorrectionRepo,
  DailyPlanRepo,
  FocusBlockRepo,
  GoalContractRepo,
  InterventionRepo,
  MemoryRepo,
  ObservationRepo,
  PrivacyExclusionsRepo,
  ProgressRepo,
  RuleProposalRepo,
  SettingsRepo,
  TaskRepo,
  EpisodeRepo,
} from "./repos/sqlite-repositories.js";

export type {
  AppSettingsRecord,
  ClassificationRecord,
  DailyMemoryNoteRecord,
  DailyPlanRecord,
  DurableRuleRecord,
  EpisodeRecord,
  FocusBlockRecord,
  GoalContractRecord,
  InterventionActionRecord,
  InterventionOutcomeRecord,
  InterventionRecord,
  ObservationRecord,
  PrivacyExclusionRecord,
  ProgressEstimateRecord,
  RuleProposalRecord,
  SignalWeightRecord,
  TaskContractRecord,
  UserCorrectionRecord,
} from "./repos/sqlite-repositories.js";

export {
  isRuntimeEvaluationEnabled,
  runWhenModeIsRunning,
} from "./runtime/mode-gate.js";

export {
  createDefaultSystemState,
} from "./system-state/default-system-state.js";

export const LOGIC_WORKSPACE_NAME = "@ineedabossagent/logic";

export const isLogicWorkspaceReady = (): boolean => true;
