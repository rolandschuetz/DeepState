import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  appMigrations,
  ClassificationRepo,
  CorrectionRepo,
  DailyPlanRepo,
  EpisodeRepo,
  FocusBlockRepo,
  GoalContractRepo,
  InterventionRepo,
  MemoryRepo,
  openDatabase,
  ObservationRepo,
  PrivacyExclusionsRepo,
  ProgressRepo,
  RuleProposalRepo,
  runStartupMigrations,
  SettingsRepo,
  TaskRepo,
  type SqliteDatabase,
} from "../src/index.js";

const openConnections: SqliteDatabase[] = [];

afterEach(() => {
  for (const database of openConnections.splice(0)) {
    database.close();
  }
});

const createDatabase = (): SqliteDatabase => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ineedabossagent-repos-"));
  const database = openDatabase({
    dbPath: join(tempDirectory, "logic.sqlite"),
  });

  runStartupMigrations(database, appMigrations);
  openConnections.push(database);
  return database;
};

const seedPlanningGraph = (database: SqliteDatabase): void => {
  new DailyPlanRepo(database).create({
    importedAt: "2026-04-18T08:00:00Z",
    localDate: "2026-04-18",
    notesForTracker: "Tracker note",
    planId: "plan_1",
    totalIntendedWorkSeconds: 14_400,
  });
  new GoalContractRepo(database).create({
    createdAt: "2026-04-18T08:01:00Z",
    goalId: "goal_1",
    planId: "plan_1",
    sortOrder: 1,
    successDefinition: "Ship the redesign",
    title: "Checkout redesign",
  });
  new TaskRepo(database).create({
    allowedSupportWork: ["Docs"],
    createdAt: "2026-04-18T08:02:00Z",
    goalId: "goal_1",
    intendedWorkSecondsToday: 7_200,
    likelyDetours: ["Review"],
    planId: "plan_1",
    progressKind: "milestone_based",
    sortOrder: 1,
    successDefinition: "Ready for handoff",
    taskId: "task_1",
    title: "Finish checkout flow",
    totalRemainingEffortSeconds: 5_400,
  });
};

describe("sqlite repositories", () => {
  it("supports CRUD for settings, planning, and privacy repos", () => {
    const database = createDatabase();

    const settingsRepo = new SettingsRepo(database);
    const privacyRepo = new PrivacyExclusionsRepo(database);
    const dailyPlanRepo = new DailyPlanRepo(database);
    const goalRepo = new GoalContractRepo(database);
    const taskRepo = new TaskRepo(database);
    const focusBlockRepo = new FocusBlockRepo(database);

    const settings = settingsRepo.getById(1);
    expect(settings?.observeOnlyTicksRemaining).toBe(75);
    expect(settings?.observeOnlySeedVersion).toBe(1);
    expect(settings?.observationRetentionDays).toBe(14);
    expect(settings?.staleContextWindowRetentionHours).toBe(12);
    expect(
      settingsRepo.update({
        ...(settings ?? {
          createdAt: "2026-04-18T00:00:00Z",
          morningFlowLastTriggeredAt: null,
          morningFlowLastTriggeredLocalDate: null,
          observationRetentionDays: 14,
          observeOnlySeedVersion: 1,
          observeOnlyTicksRemaining: 75,
          settingsId: 1,
          staleContextWindowRetentionHours: 12,
          updatedAt: "2026-04-18T00:00:00Z",
        }),
        observationRetentionDays: 21,
        observeOnlyTicksRemaining: 42,
        staleContextWindowRetentionHours: 24,
        updatedAt: "2026-04-18T09:00:00Z",
      }),
    ).toBe(true);
    expect(settingsRepo.getById(1)?.observeOnlyTicksRemaining).toBe(42);
    expect(settingsRepo.getById(1)?.observationRetentionDays).toBe(21);
    expect(settingsRepo.getById(1)?.staleContextWindowRetentionHours).toBe(24);

    dailyPlanRepo.create({
      importedAt: "2026-04-18T08:00:00Z",
      localDate: "2026-04-18",
      notesForTracker: "Tracker note",
      planId: "plan_1",
      totalIntendedWorkSeconds: 14_400,
    });
    goalRepo.create({
      createdAt: "2026-04-18T08:01:00Z",
      goalId: "goal_1",
      planId: "plan_1",
      sortOrder: 1,
      successDefinition: "Ship the redesign",
      title: "Checkout redesign",
    });
    taskRepo.create({
      allowedSupportWork: ["Docs"],
      createdAt: "2026-04-18T08:02:00Z",
      goalId: "goal_1",
      intendedWorkSecondsToday: 7_200,
      likelyDetours: ["Review"],
      planId: "plan_1",
      progressKind: "milestone_based",
      sortOrder: 1,
      successDefinition: "Ready for handoff",
      taskId: "task_1",
      title: "Finish checkout flow",
      totalRemainingEffortSeconds: 5_400,
    });
    focusBlockRepo.create({
      createdAt: "2026-04-18T08:03:00Z",
      endsAt: "2026-04-18T10:00:00Z",
      focusBlockId: "block_1",
      planId: "plan_1",
      startsAt: "2026-04-18T09:00:00Z",
      taskId: "task_1",
      title: "Deep work",
    });
    privacyRepo.create({
      createdAt: "2026-04-18T08:04:00Z",
      enabled: true,
      exclusionId: "privacy_1",
      label: "1Password",
      matchType: "app",
      pattern: "1Password",
      source: "system_seed",
      updatedAt: "2026-04-18T08:04:00Z",
    });

    expect(dailyPlanRepo.listAll()).toHaveLength(1);
    expect(goalRepo.getById("goal_1")?.title).toBe("Checkout redesign");
    expect(taskRepo.getById("task_1")?.allowedSupportWork).toEqual(["Docs"]);
    expect(focusBlockRepo.getById("block_1")?.taskId).toBe("task_1");
    expect(privacyRepo.getById("privacy_1")?.enabled).toBe(true);

    expect(
      privacyRepo.update({
        ...(privacyRepo.getById("privacy_1") ?? {
          createdAt: "2026-04-18T08:04:00Z",
          enabled: true,
          exclusionId: "privacy_1",
          label: "1Password",
          matchType: "app",
          pattern: "1Password",
          source: "system_seed",
          updatedAt: "2026-04-18T08:04:00Z",
        }),
        enabled: false,
        updatedAt: "2026-04-18T08:05:00Z",
      }),
    ).toBe(true);
    expect(privacyRepo.getById("privacy_1")?.enabled).toBe(false);
    expect(focusBlockRepo.delete("block_1")).toBe(true);
  });

  it("supports CRUD for observations, episodes, classifications, progress, and interventions", () => {
    const database = createDatabase();
    seedPlanningGraph(database);
    database.exec(`
      INSERT INTO context_windows (
        context_window_id,
        started_at,
        ended_at,
        summary_json,
        source_observation_ids_json,
        previous_window_id,
        next_window_id
      )
      VALUES (
        'window_1',
        '2026-04-18T09:00:00Z',
        '2026-04-18T09:01:30Z',
        '{}',
        '[]',
        NULL,
        NULL
      )
    `);

    const observationRepo = new ObservationRepo(database);
    const episodeRepo = new EpisodeRepo(database);
    const classificationRepo = new ClassificationRepo(database);
    const progressRepo = new ProgressRepo(database);
    const interventionRepo = new InterventionRepo(database);

    observationRepo.create({
      appIdentifier: "com.figma.Desktop",
      observationId: "obs_1",
      observedAt: "2026-04-18T09:00:10Z",
      payload: { text: "Designing" },
      screenpipeRef: { frameId: 1 },
      source: "screenpipe_search",
      url: null,
      windowTitle: "Checkout file",
    });
    episodeRepo.create({
      confidenceRatio: 0.91,
      contextWindowIds: ["window_1"],
      endedAt: "2026-04-18T09:05:00Z",
      episodeId: "episode_1",
      isSupportWork: false,
      matchedTaskId: "task_1",
      runtimeState: "aligned",
      startedAt: "2026-04-18T09:00:00Z",
      topEvidence: ["Figma active"],
    });
    classificationRepo.create({
      classificationId: "classification_1",
      classifiedAt: "2026-04-18T09:01:30Z",
      confidenceRatio: 0.88,
      contextWindowId: "window_1",
      explainability: [
        {
          code: "figma_active",
          detail: "Figma window matched task context.",
          weight: 0.8,
        },
      ],
      isSupport: false,
      lastGoodContext: "Figma - Checkout",
      matchedGoalId: "goal_1",
      matchedTaskId: "task_1",
      runtimeState: "aligned",
    });
    progressRepo.create({
      alignedSeconds: 1800,
      confidenceRatio: 0.84,
      driftSeconds: 60,
      estimatedAt: "2026-04-18T09:06:00Z",
      etaRemainingSeconds: 3600,
      latestStatusText: "Good momentum",
      planId: "plan_1",
      progressEstimateId: "progress_1",
      progressRatio: 0.4,
      riskLevel: "low",
      supportSeconds: 300,
      taskId: "task_1",
    });
    interventionRepo.create({
      actions: [
        {
          actionId: "action_1",
          label: "Return",
          semanticAction: "return_now",
        },
      ],
      body: "Return to the checkout flow.",
      createdAt: "2026-04-18T09:06:30Z",
      dedupeKey: "hard_drift:task_1",
      expiresAt: null,
      interventionId: "intervention_1",
      kind: "hard_drift",
      presentation: "dashboard_only",
      severity: "warning",
      sourceClassificationId: "classification_1",
      suppressNativeNotification: true,
      suppressionReason: "cooldown",
      title: "Back.",
    });
    interventionRepo.createOutcome({
      actionId: "action_1",
      interventionId: "intervention_1",
      note: null,
      outcomeId: "outcome_1",
      outcomeKind: "dismissed",
      recordedAt: "2026-04-18T09:07:00Z",
    });

    expect(observationRepo.getById("obs_1")?.screenpipeRef).toEqual({ frameId: 1 });
    expect(episodeRepo.getById("episode_1")?.topEvidence).toEqual(["Figma active"]);
    expect(classificationRepo.getById("classification_1")?.explainability).toHaveLength(1);
    expect(progressRepo.getById("progress_1")?.alignedSeconds).toBe(1800);
    expect(progressRepo.getById("progress_1")?.riskLevel).toBe("low");
    expect(interventionRepo.getById("intervention_1")?.actions[0]?.label).toBe("Return");
    expect(interventionRepo.getOutcomeById("outcome_1")?.outcomeKind).toBe("dismissed");
    expect(interventionRepo.deleteOutcome("outcome_1")).toBe(true);
  });

  it("supports CRUD for corrections, memory, and rule proposals", () => {
    const database = createDatabase();

    const correctionRepo = new CorrectionRepo(database);
    const memoryRepo = new MemoryRepo(database);
    const ruleProposalRepo = new RuleProposalRepo(database);

    correctionRepo.create({
      correctionId: "correction_1",
      correctionKind: "clarification",
      createdAt: "2026-04-18T10:00:00Z",
      payload: { label: "support_work" },
      relatedEntityId: "classification_1",
      summaryText: "Marked docs work as support work",
    });
    memoryRepo.createDailyMemoryNote({
      createdAt: "2026-04-18T20:00:00Z",
      localDate: "2026-04-18",
      noteId: "note_1",
      source: "evening_debrief",
      summaryText: "Good focus in the morning.",
    });
    memoryRepo.createDurableRule({
      confidence: 0.9,
      createdAt: "2026-04-18T20:05:00Z",
      lastValidatedAt: "2026-04-18T20:05:00Z",
      recency: 1,
      ruleId: "rule_1",
      ruleText: "Stripe docs count as support work for checkout.",
      source: "user_confirmed",
    });
    memoryRepo.createSignalWeight({
      signalKey: "figma_active",
      updatedAt: "2026-04-18T20:06:00Z",
      weight: 0.7,
    });
    ruleProposalRepo.create({
      createdAt: "2026-04-18T20:10:00Z",
      proposalId: "proposal_1",
      proposalText: "Treat billing copy review as support work.",
      rationale: "User confirmed twice in one week.",
      reviewedAt: null,
      source: "evening_debrief",
      status: "pending",
    });

    expect(correctionRepo.getById("correction_1")?.payload).toEqual({
      label: "support_work",
    });
    expect(memoryRepo.getDailyMemoryNoteById("note_1")?.summaryText).toContain("morning");
    expect(memoryRepo.getDurableRuleById("rule_1")?.confidence).toBe(0.9);
    expect(memoryRepo.getSignalWeightById("figma_active")?.weight).toBe(0.7);
    expect(ruleProposalRepo.getById("proposal_1")?.status).toBe("pending");
    expect(ruleProposalRepo.delete("proposal_1")).toBe(true);
  });
});
