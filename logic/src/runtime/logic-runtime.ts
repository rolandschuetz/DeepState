import { randomUUID } from "node:crypto";

import {
  systemStateSchema,
  type Command,
  type HealthStatus,
  type SystemState,
} from "@ineedabossagent/shared-contracts";

import {
  applyResolveAmbiguityToSystemState,
  handleResolveAmbiguityCommand,
} from "../ambiguity/resolve-ambiguity.js";
import { buildStartupSystemState } from "../bootstrap/startup-state.js";
import {
  applyClassificationHysteresis,
  classifyContextWindow,
  type DeterministicClassification,
  type HysteresisMemory,
} from "../classifier/focus-classifier.js";
import type { RuntimeConfig } from "../config/runtime-config.js";
import { loadRuntimeConfig } from "../config/runtime-config.js";
import type { AggregatedContextWindow } from "../context/context-aggregator.js";
import { openDatabase } from "../db/database.js";
import type { SqliteDatabase } from "../db/database.js";
import { purgeAllAppData } from "../db/data-lifecycle.js";
import { runRetentionMaintenance } from "../db/retention.js";
import { appMigrations } from "../db/app-migrations.js";
import { runWalCheckpoint, withSqliteBusyRetry } from "../db/maintenance.js";
import { runStartupMigrations } from "../db/migrations.js";
import { createDiagnosticsLogSink, createModuleLogger, DiagnosticsLogStore } from "../diagnostics/logger.js";
import { buildExplainabilityForDashboard } from "../explainability/explainability-generator.js";
import { handleNotificationActionCommand } from "../interventions/intervention-outcomes.js";
import { createOllamaClient } from "../local-ai/ollama-client.js";
import {
  buildAutomaticMorningContextPacket,
  createMorningFlowState,
  generateMorningPrompt,
  handleMorningFlowCommand,
  shouldTriggerMorningFlow,
} from "../planning/morning-flow.js";
import { seedDefaultPrivacyExclusions } from "../privacy/default-privacy-exclusions.js";
import {
  ClassificationRepo,
  DailyPlanRepo,
  FocusBlockRepo,
  MemoryRepo,
  PrivacyExclusionsRepo,
  SettingsRepo,
  TaskRepo,
} from "../repos/sqlite-repositories.js";
import { createBridgeServer } from "../server/bridge-server.js";
import {
  applyScreenpipeHealthToSystemState,
  createScreenpipeClient,
  type ScreenpipeHealthProbe,
} from "../screenpipe/client.js";
import { createScreenpipeSearchPoller } from "../screenpipe/search-poller.js";
import {
  decideLocalAiFallback,
  retrieveRelevantDurableRules,
  applyPauseToSystemState,
} from "./runtime-guards.js";
import { applyResumeToSystemState } from "./resume-state.js";
import {
  deriveOverallHealthStatus,
  mergeDatabaseHealthProbe,
  mergeSchedulerHealth,
  recordTransitionIfChanged,
  type HealthComponent,
} from "./health-recorder.js";
import {
  isSchedulerBudgetExceeded,
  runFastTickIngest,
} from "./fast-tick-ingest.js";
import { createDefaultSystemState } from "../system-state/default-system-state.js";
import { mergeObserveOnlySettings } from "./system-health-merge.js";
import { createAsyncWorkQueue } from "./work-queue.js";
import {
  createInitialPhase5Memory,
  runPhase5SlowTick,
  type Phase5OrchestratorMemory,
} from "./phase5-orchestrator.js";

export type LogicRuntimeOptions = {
  config?: RuntimeConfig;
  fetch?: typeof globalThis.fetch;
  host?: string;
  port?: number;
};

export type LogicRuntime = {
  close: () => Promise<void>;
  database: SqliteDatabase;
  diagnosticsLogStore: DiagnosticsLogStore;
  getState: () => SystemState;
  listen: (port?: number, host?: string) => Promise<{ host: string; port: number }>;
  requestRefresh: (
    reason: string,
    causedByCommandId?: string | null,
  ) => Promise<void>;
  start: () => void;
};

const probeDatabaseStatus = (database: SqliteDatabase): "ok" | "down" => {
  try {
    database.prepare("SELECT 1").get();

    return "ok";
  } catch {
    return "down";
  }
};

const finalizeSystemState = ({
  database,
  fastTickLastRanAt,
  screenpipeProbe,
  slowTickLastRanAt,
  systemState,
}: {
  database: SqliteDatabase;
  fastTickLastRanAt: string | null;
  screenpipeProbe: ScreenpipeHealthProbe;
  slowTickLastRanAt: string | null;
  systemState: SystemState;
}): SystemState => {
  const probedAt = new Date().toISOString();
  const dbStatus = probeDatabaseStatus(database);
  let next = applyScreenpipeHealthToSystemState(systemState, screenpipeProbe);
  next = mergeDatabaseHealthProbe(next, dbStatus, probedAt);
  next = mergeSchedulerHealth(next, fastTickLastRanAt, slowTickLastRanAt);
  const settings = new SettingsRepo(database).getById(1);
  next = mergeObserveOnlySettings(next, settings);
  next = {
    ...next,
    system_health: {
      ...next.system_health,
      overall_status: deriveOverallHealthStatus(
        next.system_health.database.status,
        next.system_health.screenpipe.status,
      ),
    },
  };

  return systemStateSchema.parse(next);
};

type PersistedContextWindowRow = {
  context_window_id: string;
  ended_at: string;
  started_at: string;
  summary_json: string;
};

type PersistedContextWindow = AggregatedContextWindow & {
  contextWindowId: string;
};

const buildTopEvidenceFromWindow = (window: AggregatedContextWindow): string[] =>
  [
    ...window.summary.windowTitles,
    ...window.summary.urls,
    ...window.summary.activeApps,
    ...window.summary.keywords,
    ...window.summary.uiText,
  ]
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 8);

const loadUnclassifiedContextWindows = (
  database: SqliteDatabase,
): PersistedContextWindow[] => {
  const rows = database
    .prepare(
      `
        SELECT
          cw.context_window_id,
          cw.started_at,
          cw.ended_at,
          cw.summary_json
        FROM context_windows cw
        LEFT JOIN classifications c
          ON c.context_window_id = cw.context_window_id
        WHERE c.context_window_id IS NULL
        ORDER BY cw.started_at ASC
      `,
    )
    .all() as PersistedContextWindowRow[];

  return rows.map((row) => {
    const summary = JSON.parse(row.summary_json) as AggregatedContextWindow["summary"];
    const dwellDurationSeconds = Math.max(
      0,
      Math.round((Date.parse(row.ended_at) - Date.parse(row.started_at)) / 1_000),
    );

    return {
      contextWindowId: row.context_window_id,
      dwellDurationSeconds,
      endedAt: row.ended_at,
      sequenceContext: {
        next: null,
        previous: null,
      },
      sourceRecordIds: summary.screenpipeRefs?.recordIds ?? [],
      sourceRecords: [],
      startedAt: row.started_at,
      summary,
    };
  });
};

const localDayStartMs = (localDate: string): number => Date.parse(`${localDate}T00:00:00`);

export const createLogicRuntime = (
  options: LogicRuntimeOptions = {},
): LogicRuntime => {
  const config = options.config ?? loadRuntimeConfig();
  const fetchImpl = options.fetch ?? globalThis.fetch;

  const diagnosticsLogStore = new DiagnosticsLogStore();
  const diagnosticsSink = createDiagnosticsLogSink(diagnosticsLogStore);
  const schedulerLogger = createModuleLogger({
    minLevel: config.logLevel,
    module: "scheduler",
    sink: diagnosticsSink,
  });
  const screenpipeLogger = createModuleLogger({
    minLevel: config.logLevel,
    module: "screenpipe",
    sink: diagnosticsSink,
  });
  const importLogger = createModuleLogger({
    minLevel: config.logLevel,
    module: "import",
    sink: diagnosticsSink,
  });
  const classifierLogger = createModuleLogger({
    minLevel: config.logLevel,
    module: "classifier",
    sink: diagnosticsSink,
  });
  const interventionLogger = createModuleLogger({
    minLevel: config.logLevel,
    module: "intervention",
    sink: diagnosticsSink,
  });
  const localAiLogger = createModuleLogger({
    minLevel: config.logLevel,
    module: "local_ai",
    sink: diagnosticsSink,
  });

  const database = openDatabase({ dbPath: config.dbPath });
  runStartupMigrations(database, appMigrations);
  seedDefaultPrivacyExclusions(database);

  const screenpipeClient = createScreenpipeClient({
    baseUrl: config.screenpipeBaseUrl,
    fetch: fetchImpl,
    healthTimeoutMs: config.healthTimeouts.screenpipeMs,
  });

  const searchPoller = createScreenpipeSearchPoller({
    baseUrl: config.screenpipeBaseUrl,
    fetch: fetchImpl,
    schedulerBudgetMs: config.scheduler.screenpipeSearchBudgetMs,
  });
  const ollamaClient = createOllamaClient({
    baseUrl: config.localAi.baseUrl,
    fetch: fetchImpl,
    model: config.localAi.model,
    timeoutMs: config.healthTimeouts.ollamaMs,
  });

  let pollCursor: { lastSuccessfulIngestAt: string | null; recentRecordKeys: string[] } =
    {
      lastSuccessfulIngestAt: null,
      recentRecordKeys: [],
    };
  let classificationMemory: HysteresisMemory = {
    driftStreak: 0,
    lastGoodContext: null,
    previousRuntimeState: "uncertain",
  };
  let phase5Memory: Phase5OrchestratorMemory = createInitialPhase5Memory("uncertain");

  let lastScreenpipeProbe: ScreenpipeHealthProbe = {
    checkedAt: new Date().toISOString(),
    details: null,
    httpStatus: null,
    lastErrorAt: null,
    lastOkAt: null,
    message: "Awaiting probe.",
    status: "down",
    url: `${config.screenpipeBaseUrl}/health`,
  };
  let bridgeStatus: "down" | "ok" = "down";
  let fastTickLastRanAt: string | null = null;
  let slowTickLastRanAt: string | null = null;
  let slowTickCounter = 0;

  const lastHealthByComponent = new Map<HealthComponent, HealthStatus>();

  const recordScreenpipeTransition = (
    probe: ScreenpipeHealthProbe,
    metadata?: unknown,
  ): void => {
    recordTransitionIfChanged({
      database,
      lastByComponent: lastHealthByComponent,
      transition: {
        component: "screenpipe",
        message: probe.message,
        metadata,
        to: probe.status,
      },
    });
  };

  const recordDatabaseTransition = (status: "ok" | "down", message: string): void => {
    recordTransitionIfChanged({
      database,
      lastByComponent: lastHealthByComponent,
      transition: {
        component: "database",
        message,
        to: status,
      },
    });
  };

  const recordSchedulerTransition = (
    status: "ok" | "degraded",
    message: string,
  ): void => {
    recordTransitionIfChanged({
      database,
      lastByComponent: lastHealthByComponent,
      transition: {
        component: "scheduler",
        message,
        to: status,
      },
    });
  };

  const recordBridgeTransition = (status: "down" | "ok", message: string): void => {
    bridgeStatus = status;
    recordTransitionIfChanged({
      database,
      lastByComponent: lastHealthByComponent,
      transition: {
        component: "bridge",
        message,
        to: status,
      },
    });
  };

  const recordLocalAiTransition = (status: "down" | "ok", message: string): void => {
    recordTransitionIfChanged({
      database,
      lastByComponent: lastHealthByComponent,
      transition: {
        component: "local_ai",
        message,
        to: status,
      },
    });
  };

  const maybeGenerateAmbiguitySubtitle = async ({
    classification,
    tasks,
    window,
  }: {
    classification: DeterministicClassification;
    tasks: ReturnType<TaskRepo["listAll"]>;
    window: AggregatedContextWindow;
  }): Promise<string | null> => {
    const durableRules = retrieveRelevantDurableRules({
      durableRules: new MemoryRepo(database).listDurableRules(),
      window,
    });
    const fallback = decideLocalAiFallback({
      classification,
      cooldownActive: false,
      durableRules,
      mode: currentState.mode,
      paused: currentState.mode === "paused",
      window,
    });

    if (!fallback.allow) {
      localAiLogger.debug("Skipped Ollama ambiguity fallback.", {
        reason: fallback.reason,
      });
      return null;
    }

    try {
      const hint = await ollamaClient.generateAmbiguityHint({
        activeApps: window.summary.activeApps,
        keywords: window.summary.keywords,
        taskTitles: tasks.map((task) => task.title),
        urls: window.summary.urls,
        windowTitles: window.summary.windowTitles,
      });
      recordLocalAiTransition("ok", `Ollama responded for ${config.localAi.model}.`);
      return hint;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Ollama generation failure.";
      localAiLogger.warn("Ollama ambiguity fallback failed.", { message });
      recordLocalAiTransition("down", message);
      return null;
    }
  };

  const classifyPendingWindows = async ({
    nowIso,
    planId,
  }: {
    nowIso: string;
    planId: string;
  }): Promise<{
    classifiedWindows: Array<{
      confidenceRatio: number | null;
      contextWindowId: string;
      dwellDurationSeconds: number;
      endedAt: string;
      isSupport: boolean;
      matchedGoalId: string | null;
      matchedTaskId: string | null;
      runtimeState: SystemState["dashboard"]["current_focus"]["runtime_state"];
      startedAt: string;
      topEvidence: string[];
    }>;
    latestClassificationId: string | null;
    latestRuntimeState: SystemState["dashboard"]["current_focus"]["runtime_state"];
    latestWindow: AggregatedContextWindow | null;
    subtitle: string | null;
  }> => {
    const windows = loadUnclassifiedContextWindows(database);
    const tasks = new TaskRepo(database).listAll().filter((task) => task.planId === planId);

    if (windows.length === 0 || tasks.length === 0) {
      return {
        classifiedWindows: [],
        latestClassificationId: null,
        latestRuntimeState: classificationMemory.previousRuntimeState,
        latestWindow: null,
        subtitle: null,
      };
    }

    const classificationRepo = new ClassificationRepo(database);
    const classifiedWindows: Array<{
        confidenceRatio: number | null;
        contextWindowId: string;
      dwellDurationSeconds: number;
      endedAt: string;
      isSupport: boolean;
      matchedGoalId: string | null;
      matchedTaskId: string | null;
      runtimeState: SystemState["dashboard"]["current_focus"]["runtime_state"];
      startedAt: string;
      topEvidence: string[];
    }> = [];
    let latestClassificationId: string | null = null;

    for (const window of windows) {
      const result = applyClassificationHysteresis({
        classification: classifyContextWindow({
          previousLastGoodContext: classificationMemory.lastGoodContext,
          tasks: tasks.map((task) => ({
            allowedSupportWork: task.allowedSupportWork,
            goalId: task.goalId,
            likelyDetours: task.likelyDetours,
            successDefinition: task.successDefinition,
            taskId: task.taskId,
            title: task.title,
          })),
          window,
        }),
        memory: classificationMemory,
      });
      classificationMemory = result.memory;
      const explainability = buildExplainabilityForDashboard({
        confidenceRatio: result.classification.confidenceRatio,
        raw: result.classification.explainability,
      });
      const classificationId = randomUUID();

        classificationRepo.create({
        classificationId,
        classifiedAt: nowIso,
        confidenceRatio: result.classification.confidenceRatio,
        contextWindowId: window.contextWindowId,
        explainability,
        isSupport: result.classification.isSupport,
        lastGoodContext: result.classification.lastGoodContext,
        matchedGoalId: result.classification.matchedGoalId,
        matchedTaskId: result.classification.matchedTaskId,
        runtimeState: result.classification.runtimeState,
      });

      classifierLogger.info("Context window classified.", {
        confidence_ratio: result.classification.confidenceRatio,
        context_window_id: window.contextWindowId,
        runtime_state: result.classification.runtimeState,
      });

      classifiedWindows.push({
        confidenceRatio: result.classification.confidenceRatio,
        contextWindowId: window.contextWindowId,
        dwellDurationSeconds: window.dwellDurationSeconds,
        endedAt: window.endedAt,
        isSupport: result.classification.isSupport,
        matchedGoalId: result.classification.matchedGoalId,
        matchedTaskId: result.classification.matchedTaskId,
        runtimeState: result.classification.runtimeState,
        startedAt: window.startedAt,
        topEvidence: buildTopEvidenceFromWindow(window),
      });
      latestClassificationId = classificationId;
    }

    const latestWindow = windows.at(-1) ?? null;
    const latestClassification = classifiedWindows.at(-1) ?? null;
    const subtitle =
      latestWindow === null || latestClassification === null
        ? null
        : await maybeGenerateAmbiguitySubtitle({
            classification: {
              confidenceRatio: latestClassification.confidenceRatio ?? 0.1,
              explainability: [],
              isSupport: latestClassification.isSupport,
              lastGoodContext: classificationMemory.lastGoodContext,
              matchedGoalId: latestClassification.matchedGoalId,
              matchedTaskId: latestClassification.matchedTaskId,
              runtimeState: latestClassification.runtimeState,
            },
            tasks,
            window: latestWindow,
          });

    return {
      classifiedWindows,
      latestClassificationId,
      latestRuntimeState: latestClassification?.runtimeState ?? classificationMemory.previousRuntimeState,
      latestWindow,
      subtitle,
    };
  };

  const buildInitialState = async (): Promise<SystemState> => {
    const base = buildStartupSystemState({ database });
    lastScreenpipeProbe = await screenpipeClient.probeHealth();
    const ollamaProbe = await ollamaClient.probe();
    void screenpipeClient.detectCapabilities(undefined, screenpipeLogger);
    recordScreenpipeTransition(lastScreenpipeProbe);
    recordLocalAiTransition(ollamaProbe.status, ollamaProbe.message);
    const dbStatus = probeDatabaseStatus(database);
    recordDatabaseTransition(
      dbStatus,
      dbStatus === "ok" ? "Database responsive." : "Database probe failed.",
    );
    classificationMemory = {
      driftStreak: 0,
      lastGoodContext: base.dashboard.current_focus.last_good_context,
      previousRuntimeState: base.dashboard.current_focus.runtime_state,
    };
    phase5Memory = createInitialPhase5Memory(base.dashboard.current_focus.runtime_state);

    return finalizeSystemState({
      database,
      fastTickLastRanAt: null,
      screenpipeProbe: lastScreenpipeProbe,
      slowTickLastRanAt: null,
      systemState: base,
    });
  };

  let currentState: SystemState = createDefaultSystemState();

  const workQueue = createAsyncWorkQueue();

  const bridge = createBridgeServer({
    diagnosticsProbe: () => ({
      bridge_status: bridgeStatus,
      diagnostics_log_tail: diagnosticsLogStore.list().slice(-25),
      fast_tick_last_ran_at: fastTickLastRanAt,
      last_screenpipe_probe: lastScreenpipeProbe,
      slow_tick_last_ran_at: slowTickLastRanAt,
      slow_tick_count: slowTickCounter,
    }),
    handleCommand: async (command: Command) => {
      await handleCommandInternal(command);
    },
    healthProbe: () => ({
      bridge: bridgeStatus,
      database: probeDatabaseStatus(database),
      overall_status: currentState.system_health.overall_status,
      screenpipe: lastScreenpipeProbe.status,
    }),
    heartbeatIntervalMs: 30_000,
    initialState: currentState,
  });

  const publish = (next: SystemState): void => {
    currentState = systemStateSchema.parse({
      ...next,
      emitted_at: new Date().toISOString(),
    });
    bridge.publishSystemState(currentState);
  };

  const runClassificationStep = (systemState: SystemState): Promise<SystemState> => {
    schedulerLogger.debug("Classification step executed.", {
      mode: systemState.mode,
    });

    return Promise.resolve(systemState);
  };

  const runProgressStep = (systemState: SystemState): Promise<SystemState> => {
    schedulerLogger.debug("Progress step executed.", {
      mode: systemState.mode,
    });

    return Promise.resolve(systemState);
  };

  const runInterventionStep = (systemState: SystemState): Promise<SystemState> => {
    schedulerLogger.debug("Intervention step executed.", {
      mode: systemState.mode,
    });

    return Promise.resolve(systemState);
  };

  const runFastTick = async (): Promise<void> => {
    const tickAt = new Date().toISOString();
    schedulerLogger.debug("Fast tick started.", { tick_at: tickAt });

    lastScreenpipeProbe = await screenpipeClient.probeHealth();
    recordScreenpipeTransition(lastScreenpipeProbe);

    const ingest = await runFastTickIngest({
      cursor: pollCursor,
      database,
      mode: currentState.mode,
      nowIso: tickAt,
      poller: searchPoller,
    });

    pollCursor = ingest.cursor;

    if (ingest.ingestError !== null) {
      if (isSchedulerBudgetExceeded(ingest.ingestError)) {
        schedulerLogger.warn("Fast tick skipped ingest due to scheduler budget.", {
          message: ingest.ingestError.message,
        });
        recordSchedulerTransition("degraded", "Screenpipe ingest exceeded scheduler budget.");
      } else {
        screenpipeLogger.warn("Fast tick ingest failed.", {
          message: ingest.ingestError.message,
        });
        lastScreenpipeProbe = await screenpipeClient.probeHealth();
        recordScreenpipeTransition(lastScreenpipeProbe, { ingest_error: ingest.ingestError.message });
      }
    } else {
      recordSchedulerTransition("ok", "Fast tick completed.");
    }

    fastTickLastRanAt = tickAt;

    const next = finalizeSystemState({
      database,
      fastTickLastRanAt,
      screenpipeProbe: lastScreenpipeProbe,
      slowTickLastRanAt,
      systemState: currentState,
    });

    publish({
      ...next,
      stream_sequence: currentState.stream_sequence + 1,
    });
  };

  const runMaintenance = (): void => {
    if (slowTickCounter % config.maintenanceEveryNSlowTicks !== 0) {
      return;
    }

    const retention = runRetentionMaintenance(database);
    schedulerLogger.info("Retention maintenance completed.", {
      compacted_observations: retention.compactedObservations,
      deleted_context_windows: retention.deletedContextWindows,
      deleted_observations: retention.deletedObservations,
    });
    runWalCheckpoint(database, "PASSIVE");
  };

  const runSlowTick = async (
    causedByCommandId: string | null = null,
  ): Promise<void> => {
    const tickAt = new Date().toISOString();
    schedulerLogger.info("Slow tick started.", { tick_at: tickAt });

    lastScreenpipeProbe = await screenpipeClient.probeHealth();
    recordScreenpipeTransition(lastScreenpipeProbe);

    const dbStatus = probeDatabaseStatus(database);
    recordDatabaseTransition(dbStatus, dbStatus === "ok" ? "Database responsive." : "Database probe failed.");

    slowTickLastRanAt = tickAt;
    slowTickCounter += 1;

    try {
      runMaintenance();
    } catch (error) {
      schedulerLogger.error("Maintenance failed.", {
        message: error instanceof Error ? error.message : String(error),
      });
    }

    let next = finalizeSystemState({
      database,
      fastTickLastRanAt,
      screenpipeProbe: lastScreenpipeProbe,
      slowTickLastRanAt,
      systemState: currentState,
    });

    if (currentState.mode === "running" && currentState.dashboard.plan !== null) {
      const classificationPass = await classifyPendingWindows({
        nowIso: tickAt,
        planId: currentState.dashboard.plan.plan_id,
      });
      const tasks = new TaskRepo(database)
        .listAll()
        .filter((task) => task.planId === currentState.dashboard.plan?.plan_id);
      const focusBlocks = new FocusBlockRepo(database)
        .listAll()
        .filter((block) => block.planId === currentState.dashboard.plan?.plan_id);

      if (classificationPass.classifiedWindows.length > 0) {
        const latestClassifiedWindow =
          classificationPass.classifiedWindows[classificationPass.classifiedWindows.length - 1] ?? null;
        const phase5Result = runPhase5SlowTick({
          classificationId: classificationPass.latestClassificationId,
          classificationRuntimeState: classificationPass.latestRuntimeState,
          classifiedWindows: classificationPass.classifiedWindows,
          database,
          estimatedAtIso: tickAt,
          focusBlocks,
          lastGoodContext: classificationMemory.lastGoodContext,
          localDayStartMs: localDayStartMs(currentState.dashboard.plan.local_date),
          memory: phase5Memory,
          milestoneScanEnabled: true,
          mode: currentState.mode,
          notificationPermissionGranted:
            currentState.system_health.notifications.os_permission === "granted",
          nowIso: tickAt,
          nowMs: Date.parse(tickAt),
          paused: false,
          planId: currentState.dashboard.plan.plan_id,
          taskForMilestoneInference:
            latestClassifiedWindow?.matchedTaskId === null
              ? null
              : (tasks.find((task) => task.taskId === latestClassifiedWindow?.matchedTaskId) ?? null),
          taskTitle:
            latestClassifiedWindow?.matchedTaskId === null
              ? null
              : (tasks.find((task) => task.taskId === latestClassifiedWindow?.matchedTaskId)?.title ?? null),
          tasks,
          phase7: {
            ambiguityCooldownActive: false,
            currentWindow: classificationPass.latestWindow,
            isLockedBoundary: false,
            relatedEpisodeId: null,
            slowTickDurationMs: config.scheduler.slowTickMs,
            tasksForHud: tasks.map((task) => ({
              taskId: task.taskId,
              title: task.title,
            })),
          },
        });
        phase5Memory = phase5Result.memory;

        if (phase5Result.decision.intervention !== null) {
          interventionLogger.info("Intervention created from live classification.", {
            kind: phase5Result.decision.intervention.kind,
            source_classification_id: phase5Result.decision.intervention.sourceClassificationId,
          });
        }

        if (classificationPass.subtitle !== null && phase5Result.pendingClarification !== null) {
          database.prepare(
            `
              UPDATE pending_clarifications
              SET hud_json = json_set(hud_json, '$.subtitle', ?)
              WHERE clarification_id = ?
            `,
          ).run(classificationPass.subtitle, phase5Result.pendingClarification.clarificationId);
        }
      }

      next = buildStartupSystemState({
        database,
        emittedAt: tickAt,
        runtimeSessionId: currentState.runtime_session_id,
        screenpipeHealth: lastScreenpipeProbe,
      });
      next = finalizeSystemState({
        database,
        fastTickLastRanAt,
        screenpipeProbe: lastScreenpipeProbe,
        slowTickLastRanAt,
        systemState: next,
      });
    }

    publish({
      ...next,
      caused_by_command_id: causedByCommandId,
      stream_sequence: currentState.stream_sequence + 1,
    });
  };

  const handleCommandInternal = async (command: Command): Promise<void> => {
    await withSqliteBusyRetry(async () => {
      switch (command.kind) {
        case "import_coaching_exchange": {
          importLogger.info("Coaching exchange import.", { command_id: command.command_id });
          const next = handleMorningFlowCommand({
            command,
            currentState,
            database,
            runtimeSessionId: currentState.runtime_session_id,
          });
          publish(next);
          await workQueue.enqueue(async () => {
            await runSlowTick(command.command_id);
          });
          return;
        }

        case "pause": {
          const pauseUntil =
            command.payload.duration_seconds === null
              ? null
              : new Date(
                  Date.now() + command.payload.duration_seconds * 1000,
                ).toISOString();
          let next = applyPauseToSystemState({
            causedByCommandId: command.command_id,
            currentState,
            pauseUntil,
          });
          next = {
            ...next,
            system_health: {
              ...next.system_health,
              notifications: {
                ...next.system_health.notifications,
                muted_by_logic: true,
                muted_reason: "paused",
              },
            },
          };
          publish(systemStateSchema.parse(next));
          await workQueue.enqueue(async () => {
            await runSlowTick(command.command_id);
          });
          return;
        }

        case "purge_all": {
          if (command.payload.confirm_phrase !== "DELETE ALL COACHING DATA") {
            throw new Error("purge_all confirmation phrase mismatch.");
          }

          purgeAllAppData(database);
          seedDefaultPrivacyExclusions(database);
          lastScreenpipeProbe = await screenpipeClient.probeHealth();
          let next = buildStartupSystemState({
            database,
            screenpipeHealth: lastScreenpipeProbe,
          });
          next = finalizeSystemState({
            database,
            fastTickLastRanAt: null,
            screenpipeProbe: lastScreenpipeProbe,
            slowTickLastRanAt: null,
            systemState: next,
          });
          next = {
            ...next,
            caused_by_command_id: command.command_id,
            stream_sequence: currentState.stream_sequence + 1,
          };
          publish(next);
          pollCursor = { lastSuccessfulIngestAt: null, recentRecordKeys: [] };
          fastTickLastRanAt = null;
          slowTickLastRanAt = null;
          slowTickCounter = 0;
          return;
        }

        case "report_notification_permission": {
          publish(
            systemStateSchema.parse({
              ...currentState,
              caused_by_command_id: command.command_id,
              stream_sequence: currentState.stream_sequence + 1,
              system_health: {
                ...currentState.system_health,
                notifications: {
                  ...currentState.system_health.notifications,
                  os_permission: command.payload.os_permission,
                },
              },
            }),
          );
          return;
        }

        case "request_morning_flow": {
          const settingsRepo = new SettingsRepo(database);
          const settings = settingsRepo.getById(1);

          if (settings === null) {
            throw new Error("app_settings row missing.");
          }

          const hasPlanForToday = new DailyPlanRepo(database)
            .listAll()
            .some((plan) => plan.localDate === command.payload.local_date);
          const shouldTrigger = shouldTriggerMorningFlow(
            {
              hasPlanForToday,
              hasTriggeredForDate: settings.morningFlowLastTriggeredLocalDate !== null,
              triggeredLocalDate: settings.morningFlowLastTriggeredLocalDate,
            },
            {
              localDate: command.payload.local_date,
              openedAt: command.payload.opened_at,
              reason: command.payload.reason,
            },
          );

          if (!shouldTrigger) {
            return;
          }

          const now = new Date().toISOString();
          settingsRepo.update({
            ...settings,
            morningFlowLastTriggeredAt: now,
            morningFlowLastTriggeredLocalDate: command.payload.local_date,
            updatedAt: now,
          });

          const contextPacketText = buildAutomaticMorningContextPacket({
            database,
            localDate: command.payload.local_date,
          });
          const promptText = generateMorningPrompt(contextPacketText);
          publish(
            createMorningFlowState(currentState, {
              causedByCommandId: command.command_id,
              contextPacketText,
              emittedAt: now,
              localDate: command.payload.local_date,
              promptText,
            }),
          );
          return;
        }

        case "resume": {
          lastScreenpipeProbe = await screenpipeClient.probeHealth();
          let next = applyResumeToSystemState({
            causedByCommandId: command.command_id,
            currentState,
            database,
            screenpipeHealth: lastScreenpipeProbe,
          });
          next = finalizeSystemState({
            database,
            fastTickLastRanAt,
            screenpipeProbe: lastScreenpipeProbe,
            slowTickLastRanAt,
            systemState: next,
          });
          publish(next);
          await workQueue.enqueue(async () => {
            await runSlowTick(command.command_id);
          });
          return;
        }

        case "update_exclusions": {
          const exclusionsRepo = new PrivacyExclusionsRepo(database);
          const now = new Date().toISOString();

          database.transaction(() => {
            for (const operation of command.payload.operations) {
              if (operation.op === "remove") {
                exclusionsRepo.delete(operation.exclusion_id);
              } else {
                const entry = operation.entry;
                const id = entry.exclusion_id ?? randomUUID();
                const existing = exclusionsRepo.getById(id);

                if (existing) {
                  exclusionsRepo.update({
                    ...existing,
                    enabled: entry.enabled,
                    label: entry.label,
                    matchType: entry.match_type,
                    pattern: entry.pattern,
                    updatedAt: now,
                  });
                } else {
                  exclusionsRepo.create({
                    createdAt: now,
                    enabled: entry.enabled,
                    exclusionId: id,
                    label: entry.label,
                    matchType: entry.match_type,
                    pattern: entry.pattern,
                    source: "user_defined",
                    updatedAt: now,
                  });
                }
              }
            }
          })();

          let next = buildStartupSystemState({
            database,
            screenpipeHealth: lastScreenpipeProbe,
          });
          next = finalizeSystemState({
            database,
            fastTickLastRanAt,
            screenpipeProbe: lastScreenpipeProbe,
            slowTickLastRanAt,
            systemState: next,
          });
          publish({
            ...next,
            caused_by_command_id: command.command_id,
            stream_sequence: currentState.stream_sequence + 1,
          });
          await workQueue.enqueue(async () => {
            await runSlowTick(command.command_id);
          });
          return;
        }

        case "resolve_ambiguity": {
          const resolvedAt = new Date().toISOString();
          const result = handleResolveAmbiguityCommand({
            command,
            database,
            nowIso: resolvedAt,
          });

          if (result.status === "not_found") {
            throw new Error(result.message);
          }

          if (result.status === "validation_error") {
            throw new Error(result.message);
          }

          const next = applyResolveAmbiguityToSystemState({
            command,
            currentState,
            resolvedAt,
            result,
          });
          publish(next);
          await workQueue.enqueue(async () => {
            await runSlowTick(command.command_id);
          });
          return;
        }

        case "notification_action": {
          const next = handleNotificationActionCommand({
            command,
            currentState,
            database,
          });
          publish(next);
          await workQueue.enqueue(async () => {
            await runSlowTick(command.command_id);
          });
          return;
        }
      }
    });
  };

  let fastInterval: ReturnType<typeof setInterval> | null = null;
  let slowInterval: ReturnType<typeof setInterval> | null = null;

  const start = (): void => {
    void (async () => {
      currentState = await buildInitialState();
      bridge.publishSystemState(currentState);

      fastInterval = setInterval(() => {
        void workQueue.enqueue(async () => {
          await runFastTick();
        });
      }, config.scheduler.fastTickMs);

      slowInterval = setInterval(() => {
        void workQueue.enqueue(async () => {
          await runSlowTick();
        });
      }, config.scheduler.slowTickMs);
    })();
  };

  const listen: LogicRuntime["listen"] = async (
    port = options.port ?? 0,
    host = options.host ?? "127.0.0.1",
  ) => {
    const address = await bridge.listen(port, host);
    recordBridgeTransition("ok", `Bridge listening on ${address.host}:${address.port}.`);

    return address;
  };

  const requestRefresh = async (
    reason: string,
    causedByCommandId: string | null = null,
  ): Promise<void> => {
    schedulerLogger.info("Manual refresh requested.", {
      caused_by_command_id: causedByCommandId,
      reason,
    });
    await workQueue.enqueue(async () => {
      await runSlowTick(causedByCommandId);
    });
  };

  const close = async (): Promise<void> => {
    if (fastInterval !== null) {
      clearInterval(fastInterval);
    }

    if (slowInterval !== null) {
      clearInterval(slowInterval);
    }

    recordBridgeTransition("down", "Bridge stopped.");
    await bridge.close();
  };

  return {
    close,
    database,
    diagnosticsLogStore,
    getState: () => currentState,
    listen,
    requestRefresh,
    start,
  };
};
