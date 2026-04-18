import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  applyResolveAmbiguityToSystemState,
  appMigrations,
  createInitialAmbiguityPolicyMemory,
  fingerprintForContextWindow,
  handleResolveAmbiguityCommand,
  openDatabase,
  PendingClarificationRepo,
  runPhase5SlowTick,
  runStartupMigrations,
  STABLE_UNCERTAIN_DWELL_MS,
  tickAmbiguityPolicy,
  type AmbiguityPolicyMemory,
  type SqliteDatabase,
} from "../src/index.js";
import { createInitialPhase5Memory } from "../src/runtime/phase5-orchestrator.js";

const openConnections: SqliteDatabase[] = [];

afterEach(() => {
  for (const database of openConnections.splice(0)) {
    database.close();
  }
});

const createDatabase = (): SqliteDatabase => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ineedabossagent-phase7-"));
  const database = openDatabase({
    dbPath: join(tempDirectory, "logic.sqlite"),
  });

  runStartupMigrations(database, appMigrations);
  openConnections.push(database);
  return database;
};

describe("Phase 7 ambiguity policy", () => {
  it("becomes HUD-eligible after stable uncertain dwell", () => {
    const t0 = Date.parse("2026-04-18T10:00:00Z");

    const window = {
      summary: {
        activeApps: ["Cursor"],
        activitySummary: { appSwitches: 0, scrollEvents: 0, typingSeconds: 0 },
        keywords: ["checkout"],
        meetingContext: { isLikelyMeeting: false },
        uiText: [],
        urls: ["https://example.com/doc"],
        windowTitles: ["doc.md"],
      },
    } as unknown as import("../src/context/context-aggregator.js").AggregatedContextWindow;

    const fp = fingerprintForContextWindow(window);
    const memory: AmbiguityPolicyMemory = {
      ...createInitialAmbiguityPolicyMemory(t0),
      ambiguousCycleCount: 2,
      contextEnteredAtMs: t0 - 60_000,
      hudShownForFingerprint: null,
      lastContextFingerprint: fp,
      uncertainSinceMs: t0 - STABLE_UNCERTAIN_DWELL_MS - 5_000,
    };

    const result = tickAmbiguityPolicy({
      input: {
        ambiguityCooldownActive: false,
        classificationRuntimeState: "uncertain",
        isLockedBoundary: false,
        mode: "running",
        nowMs: t0,
        paused: false,
        tickDurationMs: 90_000,
        window,
      },
      memory,
    });

    expect(result.eligibleForHud).toBe(true);
  });
});

describe("Phase 7 resolve_ambiguity", () => {
  it("persists a correction and removes pending clarification", () => {
    const database = createDatabase();

    database.exec(`
      INSERT INTO daily_plans (plan_id, local_date, imported_at, total_intended_work_seconds, notes_for_tracker)
      VALUES ('plan_1', '2026-04-18', '2026-04-18T08:00:00Z', 14400, NULL);
    `);

    const hud = {
      allow_remember_toggle: true,
      choices: [
        {
          answer_id: "ans_task",
          label: "Task",
          semantics: "task",
          task_id: "task_1",
          work_group_id: null,
        },
      ],
      clarification_id: "clar_1",
      created_at: "2026-04-18T10:00:00Z",
      expires_at: null,
      prompt: "Test?",
      related_episode_id: null,
      remember_toggle_default: false,
      subtitle: null,
    };

    new PendingClarificationRepo(database).create({
      clarificationId: "clar_1",
      createdAt: "2026-04-18T10:00:00Z",
      evidenceJson: JSON.stringify({
        activeApps: ["Slack"],
        keywords: [],
        urls: [],
        windowTitles: [],
      }),
      expiresAt: null,
      hudJson: JSON.stringify(hud),
      planId: "plan_1",
      status: "pending",
    });

    const result = handleResolveAmbiguityCommand({
      command: {
        command_id: "550e8400-e29b-41d4-a716-446655440000",
        kind: "resolve_ambiguity",
        payload: {
          answer_id: "ans_task",
          clarification_id: "clar_1",
          remember_choice: "do_not_remember",
          user_note: null,
        },
        schema_version: "1.0.0",
        sent_at: "2026-04-18T10:01:00Z",
      },
      database,
      nowIso: "2026-04-18T10:01:00Z",
    });

    expect(result.status).toBe("success");

    const pending = new PendingClarificationRepo(database).getById("clar_1");
    expect(pending).toBeNull();

    const corrections = database.prepare("SELECT COUNT(*) as c FROM user_corrections").get() as {
      c: number;
    };
    expect(corrections.c).toBe(1);

    const signalWeights = database.prepare("SELECT COUNT(*) as c FROM signal_weights").get() as {
      c: number;
    };
    expect(signalWeights.c).toBeGreaterThan(0);
  });

  it("clears the clarification HUD and resolves the queue item in system state", () => {
    const result = {
      clarificationId: "clar_1",
      correctionId: "corr_1",
      status: "success" as const,
      summaryText: "Clarification: Task (task).",
    };
    const currentState = {
      caused_by_command_id: null,
      clarification_hud: {
        allow_remember_toggle: true,
        choices: [],
        clarification_id: "clar_1",
        created_at: "2026-04-18T10:00:00Z",
        expires_at: null,
        prompt: "Test?",
        related_episode_id: null,
        remember_toggle_default: false,
        subtitle: null,
      },
      dashboard: {
        ambiguity_queue: [
          {
            ambiguity_id: "clar_1",
            created_at: "2026-04-18T10:00:00Z",
            prompt: "Test?",
            resolution_summary: null,
            status: "pending" as const,
          },
        ],
        corrections: [],
        current_focus: {
          confidence_ratio: null,
          explainability: [],
          is_support_work: false,
          last_good_context: null,
          last_updated_at: "2026-04-18T10:00:00Z",
          runtime_state: "uncertain" as const,
        },
        evening_exchange: null,
        header: {
          local_date: "2026-04-18",
          mode: "running" as const,
          summary_text: "Before",
          warning_banner: null,
        },
        morning_exchange: null,
        plan: null,
        privacy_exclusions: { exclusions: [] },
        progress: {
          tasks: [],
          total_aligned_seconds: 0,
          total_drift_seconds: 0,
          total_intended_work_seconds: null,
          total_support_seconds: 0,
        },
        recent_episodes: [],
        review_queue: [],
      },
      emitted_at: "2026-04-18T10:00:00Z",
      intervention: null,
      menu_bar: {
        active_goal_id: null,
        active_goal_title: null,
        active_task_id: null,
        active_task_title: null,
        allowed_actions: {
          can_open_evening_flow: false,
          can_open_morning_flow: false,
          can_pause: true,
          can_resume: false,
          can_take_break: false,
        },
        color_token: "yellow" as const,
        confidence_ratio: null,
        focused_elapsed_seconds: null,
        is_support_work: false,
        mode_label: "Running",
        pause_until: null,
        primary_label: "Task",
        runtime_state: "uncertain" as const,
        secondary_label: null,
        state_started_at: null,
      },
      mode: "running" as const,
      runtime_session_id: "d7d724cd-0e26-432e-91eb-c283725b6922",
      schema_version: "1.0.0" as const,
      stream_sequence: 1,
      system_health: {
        database: {
          last_error_at: null,
          last_ok_at: null,
          message: null,
          status: "ok" as const,
        },
        notifications: {
          muted_by_logic: false,
          muted_reason: null,
          os_permission: "granted" as const,
        },
        observe_only: {
          active: false,
          ticks_remaining: null,
        },
        overall_status: "ok" as const,
        scheduler: {
          fast_tick_last_ran_at: null,
          slow_tick_last_ran_at: null,
        },
        screenpipe: {
          last_error_at: null,
          last_ok_at: null,
          message: null,
          status: "ok" as const,
        },
      },
    };

    const next = applyResolveAmbiguityToSystemState({
      command: {
        command_id: "550e8400-e29b-41d4-a716-446655440000",
        kind: "resolve_ambiguity",
        payload: {
          answer_id: "ans_task",
          clarification_id: "clar_1",
          remember_choice: "do_not_remember",
          user_note: null,
        },
        schema_version: "1.0.0",
        sent_at: "2026-04-18T10:01:00Z",
      },
      currentState: currentState as Parameters<
        typeof applyResolveAmbiguityToSystemState
      >[0]["currentState"],
      resolvedAt: "2026-04-18T10:01:00Z",
      result,
    });

    expect(next.clarification_hud).toBeNull();
    expect(next.dashboard.ambiguity_queue[0]?.status).toBe("resolved");
    expect(next.dashboard.header.summary_text).toBe(result.summaryText);
  });
});

describe("Phase 7 slow tick + pending HUD", () => {
  it("persists pending clarification when phase7 input qualifies", () => {
    const database = createDatabase();

    database.exec(`
      INSERT INTO daily_plans (plan_id, local_date, imported_at, total_intended_work_seconds, notes_for_tracker)
      VALUES ('plan_1', '2026-04-18', '2026-04-18T08:00:00Z', 14400, NULL);
      INSERT INTO goal_contracts (goal_id, plan_id, title, success_definition, sort_order, created_at)
      VALUES ('goal_1', 'plan_1', 'G', 'S', 1, '2026-04-18T08:00:00Z');
      INSERT INTO task_contracts (
        task_id, plan_id, goal_id, title, success_definition,
        total_remaining_effort_seconds, intended_work_seconds_today, progress_kind,
        allowed_support_work_json, likely_detours_json, sort_order, created_at
      )
      VALUES (
        'task_1', 'plan_1', 'goal_1', 'Task', 'Done',
        8000, 7200, 'time_based',
        '[]', '[]', 1, '2026-04-18T08:00:00Z'
      );
    `);

    const t0 = Date.parse("2026-04-18T09:00:00Z");
    const nowMs = t0 + 120_000;
    const window = {
      summary: {
        activeApps: ["UnknownApp"],
        activitySummary: { appSwitches: 0, scrollEvents: 0, typingSeconds: 0 },
        keywords: ["unknown"],
        meetingContext: { isLikelyMeeting: false },
        uiText: [],
        urls: [],
        windowTitles: ["mystery"],
      },
    } as unknown as import("../src/context/context-aggregator.js").AggregatedContextWindow;

    const fp = fingerprintForContextWindow(window);

    const memory = {
      ...createInitialPhase5Memory("uncertain", t0),
      ambiguityMemory: {
        ...createInitialAmbiguityPolicyMemory(t0),
        ambiguousCycleCount: 2,
        contextEnteredAtMs: t0 - 60_000,
        hudShownForFingerprint: null,
        lastContextFingerprint: fp,
        uncertainSinceMs: t0 - STABLE_UNCERTAIN_DWELL_MS - 5_000,
      },
    };

    const classifiedWindows = [
      {
        confidenceRatio: 0.1,
        contextWindowId: "cw1",
        dwellDurationSeconds: 90,
        endedAt: "2026-04-18T09:01:30Z",
        isSupport: false,
        matchedGoalId: null,
        matchedTaskId: null,
        runtimeState: "uncertain" as const,
        startedAt: "2026-04-18T09:00:00Z",
        topEvidence: ["mystery"],
      },
    ];

    const tasks = [
      {
        allowedSupportWork: [],
        createdAt: "2026-04-18T08:00:00Z",
        goalId: "goal_1",
        intendedWorkSecondsToday: 7_200,
        likelyDetours: [],
        planId: "plan_1",
        progressKind: "time_based" as const,
        sortOrder: 1,
        successDefinition: "Done",
        taskId: "task_1",
        title: "Task",
        totalRemainingEffortSeconds: 8_000,
      },
    ];

    const result = runPhase5SlowTick({
      classificationId: null,
      classificationRuntimeState: "uncertain",
      classifiedWindows,
      database,
      estimatedAtIso: "2026-04-18T09:05:00Z",
      focusBlocks: [],
      lastGoodContext: null,
      localDayStartMs: Date.parse("2026-04-18T08:00:00Z"),
      memory,
      milestoneScanEnabled: false,
      mode: "running",
      notificationPermissionGranted: true,
      nowIso: "2026-04-18T09:05:00Z",
      nowMs,
      paused: false,
      phase7: {
        ambiguityCooldownActive: false,
        currentWindow: window,
        isLockedBoundary: false,
        relatedEpisodeId: null,
        slowTickDurationMs: 90_000,
        tasksForHud: [{ taskId: "task_1", title: "Task" }],
      },
      planId: "plan_1",
      taskForMilestoneInference: tasks[0] ?? null,
      taskTitle: null,
      tasks,
    });

    expect(result.pendingClarification).not.toBeNull();
    expect(result.clarificationHud?.clarification_id).toBe(
      result.pendingClarification?.clarificationId,
    );

    const pending = new PendingClarificationRepo(database).listPendingForPlan("plan_1");
    expect(pending.length).toBe(1);
  });
});
