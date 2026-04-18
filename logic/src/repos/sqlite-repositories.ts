import type {
  ExplainabilityItem,
  ProgressKind,
  RiskLevel,
  RuntimeState,
} from "@ineedabossagent/shared-contracts";

import type { SqliteDatabase } from "../db/database.js";

type SqlitePrimitive = number | string | null;
type SqliteRecord = Record<string, SqlitePrimitive>;

type CrudRepository<TEntity, TId extends number | string> = {
  create: (entity: TEntity) => TEntity;
  delete: (id: TId) => boolean;
  getById: (id: TId) => TEntity | null;
  listAll: () => TEntity[];
  update: (entity: TEntity) => boolean;
};

type RepositoryConfig<TEntity, TId extends number | string> = {
  fromRow: (row: SqliteRecord) => TEntity;
  getId: (entity: TEntity) => TId;
  idColumn: string;
  listOrderBy: string;
  table: string;
  toRow: (entity: TEntity) => SqliteRecord;
};

const toBoolean = (value: SqlitePrimitive): boolean => value === 1;

const toJsonText = (value: unknown): string => JSON.stringify(value);

const requireSqliteValue = (
  value: SqlitePrimitive | undefined,
  column: string,
): SqlitePrimitive => {
  if (value === undefined) {
    throw new Error(`Missing required SQLite column: ${column}`);
  }

  return value;
};

const fromJsonText = <T>(value: SqlitePrimitive): T => {
  if (typeof value !== "string") {
    throw new Error("Expected JSON text column.");
  }

  return JSON.parse(value) as T;
};

const createCrudRepository = <TEntity, TId extends number | string>(
  database: SqliteDatabase,
  config: RepositoryConfig<TEntity, TId>,
): CrudRepository<TEntity, TId> => {
  const create = (entity: TEntity): TEntity => {
    const row = config.toRow(entity);
    const columns = Object.keys(row);
    const values = columns.map((column) => `@${column}`).join(", ");

    database
      .prepare(
        `
          INSERT INTO ${config.table} (${columns.join(", ")})
          VALUES (${values})
        `,
      )
      .run(row);

    return entity;
  };

  const getById = (id: TId): TEntity | null => {
    const row = database
      .prepare(
        `
          SELECT *
          FROM ${config.table}
          WHERE ${config.idColumn} = ?
        `,
      )
      .get(id) as SqliteRecord | undefined;

    return row === undefined ? null : config.fromRow(row);
  };

  const listAll = (): TEntity[] =>
    (database
      .prepare(
        `
          SELECT *
          FROM ${config.table}
          ORDER BY ${config.listOrderBy}
        `,
      )
      .all() as SqliteRecord[]).map(config.fromRow);

  const update = (entity: TEntity): boolean => {
    const row = config.toRow(entity);
    const columns = Object.keys(row).filter((column) => column !== config.idColumn);

    const updateStatement = database.prepare(
      `
        UPDATE ${config.table}
        SET ${columns.map((column) => `${column} = @${column}`).join(", ")}
        WHERE ${config.idColumn} = @${config.idColumn}
      `,
    );

    return updateStatement.run(row).changes > 0;
  };

  const remove = (id: TId): boolean =>
    database
      .prepare(
        `
          DELETE FROM ${config.table}
          WHERE ${config.idColumn} = ?
        `,
      )
      .run(id).changes > 0;

  return {
    create,
    delete: remove,
    getById,
    listAll,
    update,
  };
};

export type AppSettingsRecord = {
  createdAt: string;
  observationRetentionDays: number;
  observeOnlySeedVersion: number;
  observeOnlyTicksRemaining: number;
  settingsId: number;
  staleContextWindowRetentionHours: number;
  updatedAt: string;
};

export type DailyPlanRecord = {
  importedAt: string;
  localDate: string;
  notesForTracker: string | null;
  planId: string;
  totalIntendedWorkSeconds: number;
};

export type GoalContractRecord = {
  createdAt: string;
  goalId: string;
  planId: string;
  sortOrder: number;
  successDefinition: string;
  title: string;
};

export type TaskContractRecord = {
  allowedSupportWork: string[];
  createdAt: string;
  goalId: string | null;
  intendedWorkSecondsToday: number;
  likelyDetours: string[];
  planId: string;
  progressKind: ProgressKind;
  sortOrder: number;
  successDefinition: string;
  taskId: string;
  title: string;
  totalRemainingEffortSeconds: number | null;
};

export type FocusBlockRecord = {
  createdAt: string;
  endsAt: string;
  focusBlockId: string;
  planId: string;
  startsAt: string;
  taskId: string | null;
  title: string;
};

export type ImportAuditLogRecord = {
  accepted: boolean;
  auditId: string;
  exchangeType: "morning_plan" | "evening_debrief";
  importedAt: string;
  localDate: string;
  note: string | null;
  payload: unknown;
  schemaVersion: string;
  source: string;
};

export type ObservationRecord = {
  appIdentifier: string | null;
  observationId: string;
  observedAt: string;
  payload: unknown;
  screenpipeRef: unknown;
  source: string;
  url: string | null;
  windowTitle: string | null;
};

export type EpisodeRecord = {
  confidenceRatio: number | null;
  contextWindowIds: string[];
  endedAt: string;
  episodeId: string;
  isSupportWork: boolean;
  matchedTaskId: string | null;
  runtimeState: RuntimeState;
  startedAt: string;
  topEvidence: string[];
};

export type ClassificationRecord = {
  classificationId: string;
  classifiedAt: string;
  confidenceRatio: number | null;
  contextWindowId: string;
  explainability: ExplainabilityItem[];
  isSupport: boolean;
  lastGoodContext: string | null;
  matchedGoalId: string | null;
  matchedTaskId: string | null;
  runtimeState: RuntimeState;
};

export type ProgressEstimateRecord = {
  alignedSeconds: number;
  confidenceRatio: number | null;
  driftSeconds: number;
  estimatedAt: string;
  etaRemainingSeconds: number | null;
  latestStatusText: string;
  planId: string;
  progressEstimateId: string;
  progressRatio: number | null;
  riskLevel: RiskLevel | null;
  supportSeconds: number;
  taskId: string | null;
};

export type InterventionActionRecord = {
  actionId: string;
  label: string;
  semanticAction: string;
};

export type InterventionRecord = {
  actions: InterventionActionRecord[];
  body: string;
  createdAt: string;
  dedupeKey: string;
  expiresAt: string | null;
  interventionId: string;
  kind: string;
  presentation: string;
  severity: string;
  sourceClassificationId: string | null;
  suppressNativeNotification: boolean;
  suppressionReason: string | null;
  title: string;
};

export type InterventionOutcomeRecord = {
  actionId: string | null;
  interventionId: string;
  note: string | null;
  outcomeId: string;
  outcomeKind: string;
  recordedAt: string;
};

export type UserCorrectionRecord = {
  correctionId: string;
  correctionKind: string;
  createdAt: string;
  payload: unknown;
  relatedEntityId: string | null;
  summaryText: string;
};

export type DailyMemoryNoteRecord = {
  createdAt: string;
  localDate: string;
  noteId: string;
  source: string;
  summaryText: string;
};

export type DurableRuleRecord = {
  confidence: number;
  createdAt: string;
  lastValidatedAt: string | null;
  recency: number;
  ruleId: string;
  ruleText: string;
  source: string;
};

export type SignalWeightRecord = {
  signalKey: string;
  updatedAt: string;
  weight: number;
};

export type RuleProposalRecord = {
  createdAt: string;
  proposalId: string;
  proposalText: string;
  rationale: string;
  reviewedAt: string | null;
  source: string;
  status: "accepted" | "dismissed" | "pending";
};

export type PrivacyExclusionRecord = {
  createdAt: string;
  enabled: boolean;
  exclusionId: string;
  label: string;
  matchType: "app" | "domain" | "url_regex" | "window_title_regex";
  pattern: string;
  source: "system_seed" | "user_defined";
  updatedAt: string;
};

export class SettingsRepo {
  readonly #repo: CrudRepository<AppSettingsRecord, number>;

  constructor(database: SqliteDatabase) {
    this.#repo = createCrudRepository(database, {
      fromRow: (row) => ({
        createdAt: row.created_at as string,
        observationRetentionDays: row.observation_retention_days as number,
        observeOnlySeedVersion: (row.observe_only_seed_version ?? 0) as number,
        observeOnlyTicksRemaining: row.observe_only_ticks_remaining as number,
        settingsId: row.settings_id as number,
        staleContextWindowRetentionHours: row.stale_context_window_retention_hours as number,
        updatedAt: row.updated_at as string,
      }),
      getId: (entity) => entity.settingsId,
      idColumn: "settings_id",
      listOrderBy: "settings_id ASC",
      table: "app_settings",
      toRow: (entity) => ({
        created_at: entity.createdAt,
        observation_retention_days: entity.observationRetentionDays,
        observe_only_seed_version: entity.observeOnlySeedVersion,
        observe_only_ticks_remaining: entity.observeOnlyTicksRemaining,
        settings_id: entity.settingsId,
        stale_context_window_retention_hours: entity.staleContextWindowRetentionHours,
        updated_at: entity.updatedAt,
      }),
    });
  }

  create(entity: AppSettingsRecord): AppSettingsRecord { return this.#repo.create(entity); }
  delete(id: number): boolean { return this.#repo.delete(id); }
  getById(id: number): AppSettingsRecord | null { return this.#repo.getById(id); }
  listAll(): AppSettingsRecord[] { return this.#repo.listAll(); }
  update(entity: AppSettingsRecord): boolean { return this.#repo.update(entity); }
}

export class DailyPlanRepo {
  readonly #repo: CrudRepository<DailyPlanRecord, string>;

  constructor(database: SqliteDatabase) {
    this.#repo = createCrudRepository(database, {
      fromRow: (row) => ({
        importedAt: row.imported_at as string,
        localDate: row.local_date as string,
        notesForTracker: row.notes_for_tracker as string | null,
        planId: row.plan_id as string,
        totalIntendedWorkSeconds: row.total_intended_work_seconds as number,
      }),
      getId: (entity) => entity.planId,
      idColumn: "plan_id",
      listOrderBy: "local_date ASC",
      table: "daily_plans",
      toRow: (entity) => ({
        imported_at: entity.importedAt,
        local_date: entity.localDate,
        notes_for_tracker: entity.notesForTracker,
        plan_id: entity.planId,
        total_intended_work_seconds: entity.totalIntendedWorkSeconds,
      }),
    });
  }

  create(entity: DailyPlanRecord): DailyPlanRecord { return this.#repo.create(entity); }
  delete(id: string): boolean { return this.#repo.delete(id); }
  getById(id: string): DailyPlanRecord | null { return this.#repo.getById(id); }
  listAll(): DailyPlanRecord[] { return this.#repo.listAll(); }
  update(entity: DailyPlanRecord): boolean { return this.#repo.update(entity); }
}

export class GoalContractRepo {
  readonly #repo: CrudRepository<GoalContractRecord, string>;

  constructor(database: SqliteDatabase) {
    this.#repo = createCrudRepository(database, {
      fromRow: (row) => ({
        createdAt: row.created_at as string,
        goalId: row.goal_id as string,
        planId: row.plan_id as string,
        sortOrder: row.sort_order as number,
        successDefinition: row.success_definition as string,
        title: row.title as string,
      }),
      getId: (entity) => entity.goalId,
      idColumn: "goal_id",
      listOrderBy: "sort_order ASC, goal_id ASC",
      table: "goal_contracts",
      toRow: (entity) => ({
        created_at: entity.createdAt,
        goal_id: entity.goalId,
        plan_id: entity.planId,
        sort_order: entity.sortOrder,
        success_definition: entity.successDefinition,
        title: entity.title,
      }),
    });
  }

  create(entity: GoalContractRecord): GoalContractRecord { return this.#repo.create(entity); }
  delete(id: string): boolean { return this.#repo.delete(id); }
  getById(id: string): GoalContractRecord | null { return this.#repo.getById(id); }
  listAll(): GoalContractRecord[] { return this.#repo.listAll(); }
  update(entity: GoalContractRecord): boolean { return this.#repo.update(entity); }
}

export class TaskRepo {
  readonly #repo: CrudRepository<TaskContractRecord, string>;

  constructor(database: SqliteDatabase) {
    this.#repo = createCrudRepository(database, {
      fromRow: (row) => ({
        allowedSupportWork: fromJsonText<string[]>(
          requireSqliteValue(row.allowed_support_work_json, "allowed_support_work_json"),
        ),
        createdAt: row.created_at as string,
        goalId: row.goal_id as string | null,
        intendedWorkSecondsToday: row.intended_work_seconds_today as number,
        likelyDetours: fromJsonText<string[]>(
          requireSqliteValue(row.likely_detours_json, "likely_detours_json"),
        ),
        planId: row.plan_id as string,
        progressKind: row.progress_kind as ProgressKind,
        sortOrder: row.sort_order as number,
        successDefinition: row.success_definition as string,
        taskId: row.task_id as string,
        title: row.title as string,
        totalRemainingEffortSeconds: row.total_remaining_effort_seconds as number | null,
      }),
      getId: (entity) => entity.taskId,
      idColumn: "task_id",
      listOrderBy: "sort_order ASC, task_id ASC",
      table: "task_contracts",
      toRow: (entity) => ({
        allowed_support_work_json: toJsonText(entity.allowedSupportWork),
        created_at: entity.createdAt,
        goal_id: entity.goalId,
        intended_work_seconds_today: entity.intendedWorkSecondsToday,
        likely_detours_json: toJsonText(entity.likelyDetours),
        plan_id: entity.planId,
        progress_kind: entity.progressKind,
        sort_order: entity.sortOrder,
        success_definition: entity.successDefinition,
        task_id: entity.taskId,
        title: entity.title,
        total_remaining_effort_seconds: entity.totalRemainingEffortSeconds,
      }),
    });
  }

  create(entity: TaskContractRecord): TaskContractRecord { return this.#repo.create(entity); }
  delete(id: string): boolean { return this.#repo.delete(id); }
  getById(id: string): TaskContractRecord | null { return this.#repo.getById(id); }
  listAll(): TaskContractRecord[] { return this.#repo.listAll(); }
  update(entity: TaskContractRecord): boolean { return this.#repo.update(entity); }
}

export class FocusBlockRepo {
  readonly #repo: CrudRepository<FocusBlockRecord, string>;

  constructor(database: SqliteDatabase) {
    this.#repo = createCrudRepository(database, {
      fromRow: (row) => ({
        createdAt: row.created_at as string,
        endsAt: row.ends_at as string,
        focusBlockId: row.focus_block_id as string,
        planId: row.plan_id as string,
        startsAt: row.starts_at as string,
        taskId: row.task_id as string | null,
        title: row.title as string,
      }),
      getId: (entity) => entity.focusBlockId,
      idColumn: "focus_block_id",
      listOrderBy: "starts_at ASC",
      table: "focus_blocks",
      toRow: (entity) => ({
        created_at: entity.createdAt,
        ends_at: entity.endsAt,
        focus_block_id: entity.focusBlockId,
        plan_id: entity.planId,
        starts_at: entity.startsAt,
        task_id: entity.taskId,
        title: entity.title,
      }),
    });
  }

  create(entity: FocusBlockRecord): FocusBlockRecord { return this.#repo.create(entity); }
  delete(id: string): boolean { return this.#repo.delete(id); }
  getById(id: string): FocusBlockRecord | null { return this.#repo.getById(id); }
  listAll(): FocusBlockRecord[] { return this.#repo.listAll(); }
  update(entity: FocusBlockRecord): boolean { return this.#repo.update(entity); }
}

export class ObservationRepo {
  readonly #repo: CrudRepository<ObservationRecord, string>;

  constructor(database: SqliteDatabase) {
    this.#repo = createCrudRepository(database, {
      fromRow: (row) => ({
        appIdentifier: row.app_identifier as string | null,
        observationId: row.observation_id as string,
        observedAt: row.observed_at as string,
        payload: fromJsonText(
          requireSqliteValue(row.payload_json, "payload_json"),
        ),
        screenpipeRef: fromJsonText(
          requireSqliteValue(row.screenpipe_ref_json, "screenpipe_ref_json"),
        ),
        source: row.source as string,
        url: row.url as string | null,
        windowTitle: row.window_title as string | null,
      }),
      getId: (entity) => entity.observationId,
      idColumn: "observation_id",
      listOrderBy: "observed_at ASC",
      table: "observations",
      toRow: (entity) => ({
        app_identifier: entity.appIdentifier,
        observation_id: entity.observationId,
        observed_at: entity.observedAt,
        payload_json: toJsonText(entity.payload),
        screenpipe_ref_json: toJsonText(entity.screenpipeRef),
        source: entity.source,
        url: entity.url,
        window_title: entity.windowTitle,
      }),
    });
  }

  create(entity: ObservationRecord): ObservationRecord { return this.#repo.create(entity); }
  delete(id: string): boolean { return this.#repo.delete(id); }
  getById(id: string): ObservationRecord | null { return this.#repo.getById(id); }
  listAll(): ObservationRecord[] { return this.#repo.listAll(); }
  update(entity: ObservationRecord): boolean { return this.#repo.update(entity); }
}

export class ImportAuditLogRepo {
  readonly #repo: CrudRepository<ImportAuditLogRecord, string>;

  constructor(database: SqliteDatabase) {
    this.#repo = createCrudRepository(database, {
      fromRow: (row) => ({
        accepted: toBoolean(requireSqliteValue(row.accepted, "accepted")),
        auditId: row.audit_id as string,
        exchangeType: row.exchange_type as "morning_plan" | "evening_debrief",
        importedAt: row.imported_at as string,
        localDate: row.local_date as string,
        note: (row.note ?? null) as string | null,
        payload: fromJsonText(requireSqliteValue(row.payload_json, "payload_json")),
        schemaVersion: row.schema_version as string,
        source: row.source as string,
      }),
      getId: (entity) => entity.auditId,
      idColumn: "audit_id",
      listOrderBy: "imported_at ASC, audit_id ASC",
      table: "import_audit_log",
      toRow: (entity) => ({
        accepted: entity.accepted ? 1 : 0,
        audit_id: entity.auditId,
        exchange_type: entity.exchangeType,
        imported_at: entity.importedAt,
        local_date: entity.localDate,
        note: entity.note,
        payload_json: toJsonText(entity.payload),
        schema_version: entity.schemaVersion,
        source: entity.source,
      }),
    });
  }

  create(entity: ImportAuditLogRecord): ImportAuditLogRecord { return this.#repo.create(entity); }
  delete(id: string): boolean { return this.#repo.delete(id); }
  getById(id: string): ImportAuditLogRecord | null { return this.#repo.getById(id); }
  listAll(): ImportAuditLogRecord[] { return this.#repo.listAll(); }
  update(entity: ImportAuditLogRecord): boolean { return this.#repo.update(entity); }
}

export class EpisodeRepo {
  readonly #repo: CrudRepository<EpisodeRecord, string>;

  constructor(database: SqliteDatabase) {
    this.#repo = createCrudRepository(database, {
      fromRow: (row) => ({
        confidenceRatio: row.confidence_ratio as number | null,
        contextWindowIds: fromJsonText<string[]>(
          requireSqliteValue(row.context_window_ids_json, "context_window_ids_json"),
        ),
        endedAt: row.ended_at as string,
        episodeId: row.episode_id as string,
        isSupportWork: toBoolean(
          requireSqliteValue(row.is_support_work, "is_support_work"),
        ),
        matchedTaskId: row.matched_task_id as string | null,
        runtimeState: row.runtime_state as RuntimeState,
        startedAt: row.started_at as string,
        topEvidence: fromJsonText<string[]>(
          requireSqliteValue(row.top_evidence_json, "top_evidence_json"),
        ),
      }),
      getId: (entity) => entity.episodeId,
      idColumn: "episode_id",
      listOrderBy: "started_at ASC",
      table: "episodes",
      toRow: (entity) => ({
        confidence_ratio: entity.confidenceRatio,
        context_window_ids_json: toJsonText(entity.contextWindowIds),
        ended_at: entity.endedAt,
        episode_id: entity.episodeId,
        is_support_work: entity.isSupportWork ? 1 : 0,
        matched_task_id: entity.matchedTaskId,
        runtime_state: entity.runtimeState,
        started_at: entity.startedAt,
        top_evidence_json: toJsonText(entity.topEvidence),
      }),
    });
  }

  create(entity: EpisodeRecord): EpisodeRecord { return this.#repo.create(entity); }
  delete(id: string): boolean { return this.#repo.delete(id); }
  getById(id: string): EpisodeRecord | null { return this.#repo.getById(id); }
  listAll(): EpisodeRecord[] { return this.#repo.listAll(); }
  update(entity: EpisodeRecord): boolean { return this.#repo.update(entity); }
}

export class ClassificationRepo {
  readonly #repo: CrudRepository<ClassificationRecord, string>;

  constructor(database: SqliteDatabase) {
    this.#repo = createCrudRepository(database, {
      fromRow: (row) => ({
        classificationId: row.classification_id as string,
        classifiedAt: row.classified_at as string,
        confidenceRatio: row.confidence_ratio as number | null,
        contextWindowId: row.context_window_id as string,
        explainability: fromJsonText<ExplainabilityItem[]>(
          requireSqliteValue(row.explainability, "explainability"),
        ),
        isSupport: toBoolean(requireSqliteValue(row.is_support, "is_support")),
        lastGoodContext: row.last_good_context as string | null,
        matchedGoalId: row.matched_goal_id as string | null,
        matchedTaskId: row.matched_task_id as string | null,
        runtimeState: row.runtime_state as RuntimeState,
      }),
      getId: (entity) => entity.classificationId,
      idColumn: "classification_id",
      listOrderBy: "classified_at ASC",
      table: "classifications",
      toRow: (entity) => ({
        classification_id: entity.classificationId,
        classified_at: entity.classifiedAt,
        confidence_ratio: entity.confidenceRatio,
        context_window_id: entity.contextWindowId,
        explainability: toJsonText(entity.explainability),
        is_support: entity.isSupport ? 1 : 0,
        last_good_context: entity.lastGoodContext,
        matched_goal_id: entity.matchedGoalId,
        matched_task_id: entity.matchedTaskId,
        runtime_state: entity.runtimeState,
      }),
    });
  }

  create(entity: ClassificationRecord): ClassificationRecord { return this.#repo.create(entity); }
  delete(id: string): boolean { return this.#repo.delete(id); }
  getById(id: string): ClassificationRecord | null { return this.#repo.getById(id); }
  listAll(): ClassificationRecord[] { return this.#repo.listAll(); }
  update(entity: ClassificationRecord): boolean { return this.#repo.update(entity); }
}

export class ProgressRepo {
  readonly #repo: CrudRepository<ProgressEstimateRecord, string>;

  constructor(database: SqliteDatabase) {
    this.#repo = createCrudRepository(database, {
      fromRow: (row) => ({
        alignedSeconds: row.aligned_seconds as number,
        confidenceRatio: row.confidence_ratio as number | null,
        driftSeconds: row.drift_seconds as number,
        estimatedAt: row.estimated_at as string,
        etaRemainingSeconds: row.eta_remaining_seconds as number | null,
        latestStatusText: row.latest_status_text as string,
        planId: row.plan_id as string,
        progressEstimateId: row.progress_estimate_id as string,
        progressRatio: row.progress_ratio as number | null,
        riskLevel: (row.risk_level ?? null) as RiskLevel | null,
        supportSeconds: row.support_seconds as number,
        taskId: row.task_id as string | null,
      }),
      getId: (entity) => entity.progressEstimateId,
      idColumn: "progress_estimate_id",
      listOrderBy: "estimated_at ASC",
      table: "progress_estimates",
      toRow: (entity) => ({
        aligned_seconds: entity.alignedSeconds,
        confidence_ratio: entity.confidenceRatio,
        drift_seconds: entity.driftSeconds,
        estimated_at: entity.estimatedAt,
        eta_remaining_seconds: entity.etaRemainingSeconds,
        latest_status_text: entity.latestStatusText,
        plan_id: entity.planId,
        progress_estimate_id: entity.progressEstimateId,
        progress_ratio: entity.progressRatio,
        risk_level: entity.riskLevel,
        support_seconds: entity.supportSeconds,
        task_id: entity.taskId,
      }),
    });
  }

  create(entity: ProgressEstimateRecord): ProgressEstimateRecord { return this.#repo.create(entity); }
  delete(id: string): boolean { return this.#repo.delete(id); }
  getById(id: string): ProgressEstimateRecord | null { return this.#repo.getById(id); }
  listAll(): ProgressEstimateRecord[] { return this.#repo.listAll(); }
  update(entity: ProgressEstimateRecord): boolean { return this.#repo.update(entity); }
}

export class InterventionRepo {
  readonly #interventions: CrudRepository<InterventionRecord, string>;
  readonly #outcomes: CrudRepository<InterventionOutcomeRecord, string>;

  constructor(database: SqliteDatabase) {
    this.#interventions = createCrudRepository(database, {
      fromRow: (row) => ({
        actions: fromJsonText<InterventionActionRecord[]>(
          requireSqliteValue(row.actions_json, "actions_json"),
        ),
        body: row.body as string,
        createdAt: row.created_at as string,
        dedupeKey: row.dedupe_key as string,
        expiresAt: row.expires_at as string | null,
        interventionId: row.intervention_id as string,
        kind: row.kind as string,
        presentation: row.presentation as string,
        severity: row.severity as string,
        sourceClassificationId: row.source_classification_id as string | null,
        suppressNativeNotification: toBoolean(
          requireSqliteValue(
            row.suppress_native_notification,
            "suppress_native_notification",
          ),
        ),
        suppressionReason: row.suppression_reason as string | null,
        title: row.title as string,
      }),
      getId: (entity) => entity.interventionId,
      idColumn: "intervention_id",
      listOrderBy: "created_at ASC",
      table: "interventions",
      toRow: (entity) => ({
        actions_json: toJsonText(entity.actions),
        body: entity.body,
        created_at: entity.createdAt,
        dedupe_key: entity.dedupeKey,
        expires_at: entity.expiresAt,
        intervention_id: entity.interventionId,
        kind: entity.kind,
        presentation: entity.presentation,
        severity: entity.severity,
        source_classification_id: entity.sourceClassificationId,
        suppress_native_notification: entity.suppressNativeNotification ? 1 : 0,
        suppression_reason: entity.suppressionReason,
        title: entity.title,
      }),
    });
    this.#outcomes = createCrudRepository(database, {
      fromRow: (row) => ({
        actionId: row.action_id as string | null,
        interventionId: row.intervention_id as string,
        note: row.note as string | null,
        outcomeId: row.outcome_id as string,
        outcomeKind: row.outcome_kind as string,
        recordedAt: row.recorded_at as string,
      }),
      getId: (entity) => entity.outcomeId,
      idColumn: "outcome_id",
      listOrderBy: "recorded_at ASC",
      table: "intervention_outcomes",
      toRow: (entity) => ({
        action_id: entity.actionId,
        intervention_id: entity.interventionId,
        note: entity.note,
        outcome_id: entity.outcomeId,
        outcome_kind: entity.outcomeKind,
        recorded_at: entity.recordedAt,
      }),
    });
  }

  create(entity: InterventionRecord): InterventionRecord { return this.#interventions.create(entity); }
  createOutcome(entity: InterventionOutcomeRecord): InterventionOutcomeRecord { return this.#outcomes.create(entity); }
  delete(id: string): boolean { return this.#interventions.delete(id); }
  deleteOutcome(id: string): boolean { return this.#outcomes.delete(id); }
  getById(id: string): InterventionRecord | null { return this.#interventions.getById(id); }
  getOutcomeById(id: string): InterventionOutcomeRecord | null { return this.#outcomes.getById(id); }
  listAll(): InterventionRecord[] { return this.#interventions.listAll(); }
  listOutcomes(): InterventionOutcomeRecord[] { return this.#outcomes.listAll(); }
  update(entity: InterventionRecord): boolean { return this.#interventions.update(entity); }
  updateOutcome(entity: InterventionOutcomeRecord): boolean { return this.#outcomes.update(entity); }
}

export class CorrectionRepo {
  readonly #repo: CrudRepository<UserCorrectionRecord, string>;

  constructor(database: SqliteDatabase) {
    this.#repo = createCrudRepository(database, {
      fromRow: (row) => ({
        correctionId: row.correction_id as string,
        correctionKind: row.correction_kind as string,
        createdAt: row.created_at as string,
        payload: fromJsonText(
          requireSqliteValue(row.payload_json, "payload_json"),
        ),
        relatedEntityId: row.related_entity_id as string | null,
        summaryText: row.summary_text as string,
      }),
      getId: (entity) => entity.correctionId,
      idColumn: "correction_id",
      listOrderBy: "created_at ASC",
      table: "user_corrections",
      toRow: (entity) => ({
        correction_id: entity.correctionId,
        correction_kind: entity.correctionKind,
        created_at: entity.createdAt,
        payload_json: toJsonText(entity.payload),
        related_entity_id: entity.relatedEntityId,
        summary_text: entity.summaryText,
      }),
    });
  }

  create(entity: UserCorrectionRecord): UserCorrectionRecord { return this.#repo.create(entity); }
  delete(id: string): boolean { return this.#repo.delete(id); }
  getById(id: string): UserCorrectionRecord | null { return this.#repo.getById(id); }
  listAll(): UserCorrectionRecord[] { return this.#repo.listAll(); }
  update(entity: UserCorrectionRecord): boolean { return this.#repo.update(entity); }
}

export class MemoryRepo {
  readonly #dailyMemoryNotes: CrudRepository<DailyMemoryNoteRecord, string>;
  readonly #durableRules: CrudRepository<DurableRuleRecord, string>;
  readonly #signalWeights: CrudRepository<SignalWeightRecord, string>;

  constructor(database: SqliteDatabase) {
    this.#dailyMemoryNotes = createCrudRepository(database, {
      fromRow: (row) => ({
        createdAt: row.created_at as string,
        localDate: row.local_date as string,
        noteId: row.note_id as string,
        source: row.source as string,
        summaryText: row.summary_text as string,
      }),
      getId: (entity) => entity.noteId,
      idColumn: "note_id",
      listOrderBy: "local_date ASC, note_id ASC",
      table: "daily_memory_notes",
      toRow: (entity) => ({
        created_at: entity.createdAt,
        local_date: entity.localDate,
        note_id: entity.noteId,
        source: entity.source,
        summary_text: entity.summaryText,
      }),
    });
    this.#durableRules = createCrudRepository(database, {
      fromRow: (row) => ({
        confidence: row.confidence as number,
        createdAt: row.created_at as string,
        lastValidatedAt: row.last_validated_at as string | null,
        recency: row.recency as number,
        ruleId: row.rule_id as string,
        ruleText: row.rule_text as string,
        source: row.source as string,
      }),
      getId: (entity) => entity.ruleId,
      idColumn: "rule_id",
      listOrderBy: "created_at ASC, rule_id ASC",
      table: "durable_rules",
      toRow: (entity) => ({
        confidence: entity.confidence,
        created_at: entity.createdAt,
        last_validated_at: entity.lastValidatedAt,
        recency: entity.recency,
        rule_id: entity.ruleId,
        rule_text: entity.ruleText,
        source: entity.source,
      }),
    });
    this.#signalWeights = createCrudRepository(database, {
      fromRow: (row) => ({
        signalKey: row.signal_key as string,
        updatedAt: row.updated_at as string,
        weight: row.weight as number,
      }),
      getId: (entity) => entity.signalKey,
      idColumn: "signal_key",
      listOrderBy: "signal_key ASC",
      table: "signal_weights",
      toRow: (entity) => ({
        signal_key: entity.signalKey,
        updated_at: entity.updatedAt,
        weight: entity.weight,
      }),
    });
  }

  createDailyMemoryNote(entity: DailyMemoryNoteRecord): DailyMemoryNoteRecord { return this.#dailyMemoryNotes.create(entity); }
  createDurableRule(entity: DurableRuleRecord): DurableRuleRecord { return this.#durableRules.create(entity); }
  createSignalWeight(entity: SignalWeightRecord): SignalWeightRecord { return this.#signalWeights.create(entity); }
  deleteDailyMemoryNote(id: string): boolean { return this.#dailyMemoryNotes.delete(id); }
  deleteDurableRule(id: string): boolean { return this.#durableRules.delete(id); }
  deleteSignalWeight(id: string): boolean { return this.#signalWeights.delete(id); }
  getDailyMemoryNoteById(id: string): DailyMemoryNoteRecord | null { return this.#dailyMemoryNotes.getById(id); }
  getDurableRuleById(id: string): DurableRuleRecord | null { return this.#durableRules.getById(id); }
  getSignalWeightById(id: string): SignalWeightRecord | null { return this.#signalWeights.getById(id); }
  listDailyMemoryNotes(): DailyMemoryNoteRecord[] { return this.#dailyMemoryNotes.listAll(); }
  listDurableRules(): DurableRuleRecord[] { return this.#durableRules.listAll(); }
  listSignalWeights(): SignalWeightRecord[] { return this.#signalWeights.listAll(); }
  updateDailyMemoryNote(entity: DailyMemoryNoteRecord): boolean { return this.#dailyMemoryNotes.update(entity); }
  updateDurableRule(entity: DurableRuleRecord): boolean { return this.#durableRules.update(entity); }
  updateSignalWeight(entity: SignalWeightRecord): boolean { return this.#signalWeights.update(entity); }
}

export class RuleProposalRepo {
  readonly #repo: CrudRepository<RuleProposalRecord, string>;

  constructor(database: SqliteDatabase) {
    this.#repo = createCrudRepository(database, {
      fromRow: (row) => ({
        createdAt: row.created_at as string,
        proposalId: row.proposal_id as string,
        proposalText: row.proposal_text as string,
        rationale: row.rationale as string,
        reviewedAt: row.reviewed_at as string | null,
        source: row.source as string,
        status: row.status as RuleProposalRecord["status"],
      }),
      getId: (entity) => entity.proposalId,
      idColumn: "proposal_id",
      listOrderBy: "created_at ASC, proposal_id ASC",
      table: "rule_proposals",
      toRow: (entity) => ({
        created_at: entity.createdAt,
        proposal_id: entity.proposalId,
        proposal_text: entity.proposalText,
        rationale: entity.rationale,
        reviewed_at: entity.reviewedAt,
        source: entity.source,
        status: entity.status,
      }),
    });
  }

  create(entity: RuleProposalRecord): RuleProposalRecord { return this.#repo.create(entity); }
  delete(id: string): boolean { return this.#repo.delete(id); }
  getById(id: string): RuleProposalRecord | null { return this.#repo.getById(id); }
  listAll(): RuleProposalRecord[] { return this.#repo.listAll(); }
  update(entity: RuleProposalRecord): boolean { return this.#repo.update(entity); }
}

export class PrivacyExclusionsRepo {
  readonly #repo: CrudRepository<PrivacyExclusionRecord, string>;

  constructor(database: SqliteDatabase) {
    this.#repo = createCrudRepository(database, {
      fromRow: (row) => ({
        createdAt: row.created_at as string,
        enabled: toBoolean(requireSqliteValue(row.enabled, "enabled")),
        exclusionId: row.exclusion_id as string,
        label: row.label as string,
        matchType: row.match_type as PrivacyExclusionRecord["matchType"],
        pattern: row.pattern as string,
        source: row.source as PrivacyExclusionRecord["source"],
        updatedAt: row.updated_at as string,
      }),
      getId: (entity) => entity.exclusionId,
      idColumn: "exclusion_id",
      listOrderBy: "created_at ASC, exclusion_id ASC",
      table: "privacy_exclusions",
      toRow: (entity) => ({
        created_at: entity.createdAt,
        enabled: entity.enabled ? 1 : 0,
        exclusion_id: entity.exclusionId,
        label: entity.label,
        match_type: entity.matchType,
        pattern: entity.pattern,
        source: entity.source,
        updated_at: entity.updatedAt,
      }),
    });
  }

  create(entity: PrivacyExclusionRecord): PrivacyExclusionRecord { return this.#repo.create(entity); }
  delete(id: string): boolean { return this.#repo.delete(id); }
  getById(id: string): PrivacyExclusionRecord | null { return this.#repo.getById(id); }
  listAll(): PrivacyExclusionRecord[] { return this.#repo.listAll(); }
  update(entity: PrivacyExclusionRecord): boolean { return this.#repo.update(entity); }
}
