export {
  buildStartupSystemState,
} from "./bootstrap/startup-state.js";
export {
  createContextAggregator,
} from "./context/context-aggregator.js";
export {
  buildEpisodesFromClassifiedWindows,
} from "./context/episode-builder.js";
export type {
  ClassifiedWindowInput,
  EpisodeBuilderOptions,
} from "./context/episode-builder.js";
export {
  applyClassificationHysteresis,
  classifyContextWindow,
} from "./classifier/focus-classifier.js";

export {
  DEFAULT_PRIVACY_EXCLUSIONS,
  seedDefaultPrivacyExclusions,
} from "./privacy/default-privacy-exclusions.js";
export {
  createPrivacyFilter,
} from "./privacy/privacy-filter.js";
export {
  sanitizeEvidenceForPersistence,
} from "./privacy/evidence-sanitizer.js";

export {
  createBridgeServer,
} from "./server/bridge-server.js";

export {
  applyScreenpipeHealthToSystemState,
  createScreenpipeClient,
} from "./screenpipe/client.js";

export type {
  ScreenpipeClient,
  ScreenpipeCapabilities,
  ScreenpipeHealthProbe,
} from "./screenpipe/client.js";

export {
  createScreenpipeSearchPoller,
  normalizeScreenpipeRecordTimestamps,
  ScreenpipeSchedulerBudgetExceededError,
} from "./screenpipe/search-poller.js";

export {
  normalizeScreenpipeRecordToEvidence,
  normalizeScreenpipeRecordsToEvidence,
} from "./screenpipe/evidence-normalizer.js";

export type {
  ScreenpipeSearchCursor,
  ScreenpipeSearchPoller,
  ScreenpipeSearchPollOptions,
  ScreenpipeSearchPollResult,
} from "./screenpipe/search-poller.js";
export type {
  ClassificationTickResult,
  ClassifierTaskProfile,
  ClassificationExplainability,
  DeterministicClassification,
  HysteresisMemory,
} from "./classifier/focus-classifier.js";
export type {
  AggregatedContextWindow,
  ContextAggregator,
  ContextWindowSummary,
  SequenceNeighborContext,
} from "./context/context-aggregator.js";

export type {
  NormalizedScreenpipeEvidence,
} from "./screenpipe/evidence-normalizer.js";
export type {
  PrivacyFilter,
  PrivacyFilterAudit,
  PrivacyFilterResult,
} from "./privacy/privacy-filter.js";
export type {
  EvidenceSanitizerAudit,
  EvidenceSanitizerResult,
} from "./privacy/evidence-sanitizer.js";

export {
  isFeatureFlagEnabled,
  loadRuntimeConfig,
} from "./config/runtime-config.js";

export {
  appMigrations,
  baseAppMigrations,
  DEFAULT_OBSERVATION_RETENTION_DAYS,
  DEFAULT_STALE_CONTEXT_WINDOW_RETENTION_HOURS,
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
  backupSqliteDatabase,
  exportAppDataAsJson,
  purgeAllAppData,
} from "./db/data-lifecycle.js";

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

export {
  compactObservationPayload,
  getRetentionPolicy,
  runRetentionMaintenance,
} from "./db/retention.js";

export type {
  RetentionMaintenanceResult,
  RetentionPolicy,
} from "./db/retention.js";

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
  CoachingExchangeParseError,
  parseCoachingExchange,
} from "./planning/coaching-exchange-parse.js";

export {
  buildEveningDebriefPacket,
  buildReviewQueueFromDatabase,
  explainabilityBulletsForEpisode,
  generateEveningPrompt,
  hasAcceptedEveningDebriefForLocalDate,
  importEveningDebriefExchange,
  parseEveningDebriefExchange,
  planExistsForLocalDate,
} from "./planning/evening-flow.js";

export {
  buildMorningContextPacket,
  createMorningFlowState,
  generateMorningPrompt,
  handleMorningFlowCommand,
  importMorningPlanExchange,
  parseMorningPlanExchange,
  shouldTriggerMorningFlow,
} from "./planning/morning-flow.js";

export {
  ClassificationRepo,
  CorrectionRepo,
  DailyPlanRepo,
  FocusBlockRepo,
  GoalContractRepo,
  ImportAuditLogRepo,
  InterventionRepo,
  MemoryRepo,
  ObservationRepo,
  PendingClarificationRepo,
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
  ImportAuditLogRecord,
  InterventionActionRecord,
  InterventionOutcomeRecord,
  InterventionRecord,
  ObservationRecord,
  PendingClarificationRecord,
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
  createLogicRuntime,
} from "./runtime/logic-runtime.js";
export type {
  LogicRuntime,
  LogicRuntimeOptions,
} from "./runtime/logic-runtime.js";

export {
  createAsyncWorkQueue,
} from "./runtime/work-queue.js";

export {
  mergeSchedulerHealth,
  mergeDatabaseHealthProbe,
  deriveOverallHealthStatus,
  recordHealthTransition,
  recordTransitionIfChanged,
} from "./runtime/health-recorder.js";
export type {
  HealthComponent,
  HealthTransition,
} from "./runtime/health-recorder.js";

export {
  applyResumeToSystemState,
} from "./runtime/resume-state.js";

export {
  mergeObserveOnlySettings,
} from "./runtime/system-health-merge.js";

export {
  runFastTickIngest,
  isSchedulerBudgetExceeded,
} from "./runtime/fast-tick-ingest.js";
export {
  createInitialPhase5Memory,
  runPhase5SlowTick,
} from "./runtime/phase5-orchestrator.js";
export type {
  Phase5OrchestratorMemory,
  Phase5SlowTickResult,
  RunPhase5SlowTickParams,
} from "./runtime/phase5-orchestrator.js";
export {
  createInitialAmbiguityPolicyMemory,
  fingerprintForContextWindow,
  markHudShownForFingerprint,
  NEW_CONTEXT_GUARD_MS,
  STABLE_UNCERTAIN_DWELL_MS,
  tickAmbiguityPolicy,
} from "./ambiguity/ambiguity-policy.js";
export type { AmbiguityPolicyMemory } from "./ambiguity/ambiguity-policy.js";
export {
  buildClarificationHud,
  evidenceSnapshotFromWindow,
} from "./ambiguity/build-clarification-hud.js";
export type {
  ClarificationHudModel,
  EvidenceSnapshot,
} from "./ambiguity/build-clarification-hud.js";
export {
  applyEvidenceSignalBumps,
  buildConditionalRuleText,
  createDurableRuleFromResolution,
  upsertSignalWeight,
} from "./ambiguity/learning-from-resolution.js";
export {
  applyResolveAmbiguityToSystemState,
  handleResolveAmbiguityCommand,
} from "./ambiguity/resolve-ambiguity.js";
export type { ResolveAmbiguityResult } from "./ambiguity/resolve-ambiguity.js";

export {
  applyPauseToSystemState,
  decideInterventionGate,
  decideLocalAiFallback,
  retrieveRelevantDurableRules,
  shouldSurfaceAmbiguityPrompt,
} from "./runtime/runtime-guards.js";
export type {
  InterventionGateDecision,
  LocalAiFallbackDecision,
} from "./runtime/runtime-guards.js";

export {
  buildExplainabilityForDashboard,
} from "./explainability/explainability-generator.js";

export {
  computeProgressEstimatesForPlan,
  inferMilestoneCandidate,
} from "./progress/progress-estimator.js";
export type {
  MilestoneCandidateEstimate,
  ProgressEstimateDraft,
} from "./progress/progress-estimator.js";
export {
  buildLatestStatusText,
  evaluateRiskSignals,
  riskLevelFromSignals,
  rollupEpisodesByTask,
} from "./progress/risk-detector.js";
export type {
  RiskSignals,
  TaskEpisodeRollup,
} from "./progress/risk-detector.js";

export {
  alignedStreakDurationMs,
  createInitialPraisePolicyMemory,
  nextPraisePolicyMemory,
  pickPraiseFocusBlockKey,
  PRAISE_MIN_ALIGNED_MS,
} from "./interventions/praise-engine.js";
export type { PraisePolicyMemory } from "./interventions/praise-engine.js";

export { messages } from "./interventions/messages.js";
export {
  handleNotificationActionCommand,
} from "./interventions/intervention-outcomes.js";
export {
  decideIntervention,
  HARD_DRIFT_COOLDOWN_MS,
  MILESTONE_CONFIDENCE_THRESHOLD,
} from "./interventions/intervention-engine.js";
export type {
  InterventionDecision,
  InterventionDecisionInput,
  MilestoneCandidateInput,
} from "./interventions/intervention-engine.js";

export {
  createDefaultSystemState,
} from "./system-state/default-system-state.js";

export const LOGIC_WORKSPACE_NAME = "@ineedabossagent/logic";

export const isLogicWorkspaceReady = (): boolean => true;
