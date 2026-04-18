# Logic/UI Boundary Contract

## Purpose

This document defines the canonical interface between the TypeScript `logic layer` and the macOS `UI layer`.

It is derived from:

- [SoftwareArchitecture.md](/Users/rolandschuetz/Projects/INeedABossAgent/docs/SoftwareArchitecture.md)
- [TaskList.md](/Users/rolandschuetz/Projects/INeedABossAgent/docs/TaskList.md)

The goal is to make the boundary:

- strict
- testable
- replayable
- replaceable on either side
- safe under reconnects, stale user actions, and degraded runtime conditions

This contract is normative. If implementation details disagree with this file, this file wins until explicitly revised.

## Design Rules

1. The logic layer is the single source of truth for product state, classification, progress, explainability, cooldowns, and intervention policy.
2. The UI layer is a renderer and command sender. It must not derive business state that is not already present in the contract.
3. The outbound interface is a single full-state stream. The UI always renders the latest complete snapshot and never applies partial patches.
4. The inbound interface is a single command endpoint using a discriminated union.
5. Every payload carries a `schema_version`.
6. Every state snapshot carries a monotonic `stream_sequence`.
7. Every command carries a caller-generated `command_id` for idempotency and correlation.
8. All timestamps are ISO 8601 UTC strings.
9. All durations are integer seconds.
10. `null` means intentionally absent. Empty arrays mean intentionally present but empty.

## Transport

### Outbound: `GET /stream`

Transport: Server-Sent Events.

Rules:

- The logic layer must emit one full `SystemState` snapshot immediately on connect.
- The logic layer must emit a new full `SystemState` snapshot after every accepted state change.
- The logic layer should emit a heartbeat snapshot at least every 30 seconds even if nothing changed.
- The UI must treat the most recent valid snapshot as authoritative.
- The UI must ignore snapshots with a lower or equal `stream_sequence` for the same `runtime_session_id`.
- If `runtime_session_id` changes, the UI must replace all previously cached state immediately, even if the new `stream_sequence` is lower.

Recommended SSE event name:

```text
event: system_state
data: <SystemState JSON>
```

### Inbound: `POST /command`

Transport: JSON over HTTP POST.

Rules:

- The UI sends exactly one `CommandEnvelope`.
- The logic layer returns exactly one `CommandResponse`.
- The HTTP response confirms parsing and command acceptance, but the authoritative resulting state still arrives through `GET /stream`.
- The logic layer must treat repeated `command_id` values as idempotent retries.

## Shared Scalar Types

```ts
type SchemaVersion = "1.0.0";

type IsoUtc = string; // Example: "2026-04-18T08:42:11Z"
type LocalDate = string; // Example: "2026-04-18"
type UUID = string;
type OpaqueId = string;
type SequenceNumber = number; // Monotonic positive integer
type Ratio = number; // 0.0 to 1.0 inclusive
type DurationSeconds = number; // Integer >= 0

type Mode =
  | "booting"
  | "no_plan"
  | "running"
  | "paused"
  | "degraded_screenpipe"
  | "logic_error";

type RuntimeState =
  | "aligned"
  | "uncertain"
  | "soft_drift"
  | "hard_drift"
  | "paused";

type HealthStatus = "ok" | "degraded" | "down";
type Severity = "info" | "warning" | "critical";
type ColorToken = "green" | "blue" | "yellow" | "red" | "gray";
type RiskLevel = "low" | "medium" | "high";
type ProgressKind = "time_based" | "milestone_based" | "artifact_based" | "hybrid";
```

## Root Outbound Schema: `SystemState`

```ts
type SystemState = {
  schema_version: SchemaVersion;
  runtime_session_id: UUID;
  stream_sequence: SequenceNumber;
  emitted_at: IsoUtc;
  caused_by_command_id: UUID | null;

  mode: Mode;

  menu_bar: MenuBarViewModel;
  dashboard: DashboardViewModel;
  clarification_hud: ClarificationHudViewModel | null;
  intervention: InterventionViewModel | null;
  system_health: SystemHealthViewModel;
};
```

### Root-Level Semantics

- `mode` is the top-level gate for the entire product.
- `menu_bar`, `dashboard`, `clarification_hud`, and `intervention` are already UI-facing models. The UI must not enrich them with business logic.
- `caused_by_command_id` is `null` for scheduler-driven updates and set for command-triggered updates.
- `clarification_hud` and `intervention` are ephemeral view models. Either may be `null`.

## `menu_bar`

```ts
type MenuBarViewModel = {
  color_token: ColorToken;
  mode_label: string;
  primary_label: string;
  secondary_label: string | null;

  runtime_state: RuntimeState;
  is_support_work: boolean;
  confidence_ratio: Ratio | null;

  active_goal_id: OpaqueId | null;
  active_goal_title: string | null;
  active_task_id: OpaqueId | null;
  active_task_title: string | null;

  state_started_at: IsoUtc | null;
  focused_elapsed_seconds: DurationSeconds | null;
  pause_until: IsoUtc | null;

  allowed_actions: {
    can_pause: boolean;
    can_resume: boolean;
    can_take_break: boolean;
    can_open_morning_flow: boolean;
    can_open_evening_flow: boolean;
  };
};
```

### Menu Bar Rules

- `color_token` is authoritative. The UI maps it to native colors but does not recalculate it.
- `runtime_state` is present even when `mode` is not `running` so the UI can show a stable last-known state where useful.
- If `mode` is `no_plan`, both active title fields should be `null`.
- If `mode` is `paused`, `runtime_state` must be `paused`.
- `focused_elapsed_seconds` is the current streak length for the displayed state, not the full task total.

## `dashboard`

```ts
type DashboardViewModel = {
  header: {
    local_date: LocalDate;
    mode: Mode;
    summary_text: string;
    warning_banner: BannerViewModel | null;
  };

  plan: DailyPlanViewModel | null;

  current_focus: {
    runtime_state: RuntimeState;
    is_support_work: boolean;
    confidence_ratio: Ratio | null;
    explainability: ExplainabilityItem[];
    last_good_context: string | null;
    last_updated_at: IsoUtc;
  };

  progress: {
    total_intended_work_seconds: DurationSeconds | null;
    total_aligned_seconds: DurationSeconds;
    total_support_seconds: DurationSeconds;
    total_drift_seconds: DurationSeconds;
    tasks: TaskProgressCard[];
  };

  recent_episodes: EpisodeSummary[];
  corrections: CorrectionSummary[];
  ambiguity_queue: AmbiguityQueueItem[];
  review_queue: DurableRuleReviewItem[];

  morning_exchange: MorningExchangeViewModel | null;
  evening_exchange: EveningExchangeViewModel | null;
  privacy_exclusions: PrivacyExclusionsViewModel;
};
```

```ts
type BannerViewModel = {
  severity: Severity;
  title: string;
  body: string;
};
```

```ts
type DailyPlanViewModel = {
  plan_id: OpaqueId;
  imported_at: IsoUtc;
  local_date: LocalDate;
  total_intended_work_seconds: DurationSeconds;
  notes_for_tracker: string | null;
  tasks: PlannedTaskViewModel[];
};
```

```ts
type PlannedTaskViewModel = {
  task_id: OpaqueId;
  title: string;
  success_definition: string;
  total_remaining_effort_seconds: DurationSeconds | null;
  intended_work_seconds_today: DurationSeconds;
  progress_kind: ProgressKind;
  allowed_support_work: string[];
  likely_detours_that_still_count: string[];
};
```

```ts
type TaskProgressCard = {
  task_id: OpaqueId;
  title: string;
  progress_ratio: Ratio | null;
  confidence_ratio: Ratio | null;
  risk_level: RiskLevel | null;
  aligned_seconds: DurationSeconds;
  support_seconds: DurationSeconds;
  drift_seconds: DurationSeconds;
  eta_remaining_seconds: DurationSeconds | null;
  latest_status_text: string;
};
```

```ts
type EpisodeSummary = {
  episode_id: OpaqueId;
  started_at: IsoUtc;
  ended_at: IsoUtc;
  runtime_state: RuntimeState;
  matched_task_id: OpaqueId | null;
  matched_task_title: string | null;
  is_support_work: boolean;
  confidence_ratio: Ratio | null;
  top_evidence: string[];
};
```

```ts
type CorrectionSummary = {
  correction_id: OpaqueId;
  created_at: IsoUtc;
  kind: "clarification" | "manual_override" | "notification_action";
  summary_text: string;
};
```

```ts
type AmbiguityQueueItem = {
  ambiguity_id: OpaqueId;
  created_at: IsoUtc;
  prompt: string;
  status: "pending" | "resolved" | "dismissed";
  resolution_summary: string | null;
};
```

```ts
type DurableRuleReviewItem = {
  review_item_id: OpaqueId;
  created_at: IsoUtc;
  title: string;
  rationale: string;
  proposed_rule_text: string;
};
```

```ts
type MorningExchangeViewModel = {
  status: "required" | "available" | "completed";
  context_packet_text: string | null;
  prompt_text: string | null;
};
```

```ts
type EveningExchangeViewModel = {
  status: "not_ready" | "available" | "completed";
  debrief_packet_text: string | null;
  prompt_text: string | null;
};
```

```ts
type PrivacyExclusionsViewModel = {
  exclusions: PrivacyExclusionEntry[];
};
```

### Dashboard Rules

- `plan` is `null` only when there is no imported day plan or after `purge_all`.
- `current_focus.explainability` is authoritative. The UI must render it blindly and must not collapse or rewrite the items.
- `last_good_context` is the Recovery Anchor text source. The UI may display it exactly as given and must not paraphrase it.
- `morning_exchange.prompt_text` is the exact text the UI should offer for copy during morning planning.
- `evening_exchange.debrief_packet_text` and `evening_exchange.prompt_text` are the exact strings the UI should offer for copy during evening reflection.
- `privacy_exclusions.exclusions` is the current canonical exclusion list, including seeded defaults.
- The UI may hide empty sections, but it must not invent synthetic placeholder business data.

## `explainability`

```ts
type ExplainabilityItem = {
  code: string;
  detail: string;
  weight: number;
};
```

### Explainability Rules

- `code` is stable and machine-friendly.
- `detail` is already user-display-safe.
- `weight` is relative evidence strength, not probability and not certainty.
- The UI must not sort or normalize weights unless the design explicitly wants descending raw `weight`.

## `clarification_hud`

```ts
type ClarificationHudViewModel = {
  clarification_id: OpaqueId;
  created_at: IsoUtc;
  expires_at: IsoUtc | null;

  prompt: string;
  subtitle: string | null;

  choices: ClarificationChoice[];

  related_episode_id: OpaqueId | null;
  remember_toggle_default: boolean;
  allow_remember_toggle: boolean;
};
```

```ts
type ClarificationChoice = {
  answer_id: OpaqueId;
  label: string;
  semantics:
    | "task"
    | "support_work"
    | "work_group"
    | "admin"
    | "break"
    | "intentional_detour"
    | "not_related";
  task_id: OpaqueId | null;
  work_group_id: OpaqueId | null;
};
```

### Clarification Rules

- The HUD is shown only when `clarification_hud` is not `null`.
- If `expires_at` passes, the UI may dismiss the panel locally, but the next authoritative state from the stream wins.
- The UI must send back `clarification_id` and `answer_id` unchanged when resolving ambiguity.
- If the user answers after the clarification has expired or been replaced, the logic layer may reject it as stale.

## `intervention`

```ts
type InterventionViewModel = {
  intervention_id: OpaqueId;
  created_at: IsoUtc;
  kind:
    | "hard_drift"
    | "praise"
    | "recovery_anchor"
    | "risk_prompt"
    | "clarification_notification";

  presentation: "dashboard_only" | "local_notification" | "both";
  severity: Severity;

  title: string;
  body: string;

  actions: InterventionAction[];

  suppress_native_notification: boolean;
  suppression_reason:
    | null
    | "observe_only"
    | "cooldown"
    | "paused"
    | "permissions_missing"
    | "mode_gate";

  dedupe_key: string;
  expires_at: IsoUtc | null;
};
```

```ts
type InterventionAction = {
  action_id: OpaqueId;
  label: string;
  semantic_action:
    | "return_now"
    | "intentional_detour"
    | "pause_10_minutes"
    | "open_dashboard"
    | "dismiss";
};
```

### Intervention Rules

- `title` and `body` come from the logic layer message catalog and must be rendered as-is.
- If `presentation` includes `local_notification` and `suppress_native_notification` is `false`, the UI should show a native notification.
- If `suppress_native_notification` is `true`, the UI must not notify natively even if `presentation` includes `local_notification`.
- The UI may still render the intervention in-app when native delivery is suppressed.
- The UI must dedupe native notifications using `dedupe_key`.
- If the user taps a notification action after `expires_at`, the logic layer may reject the action as stale.

## `system_health`

```ts
type SystemHealthViewModel = {
  overall_status: HealthStatus;

  screenpipe: {
    status: HealthStatus;
    last_ok_at: IsoUtc | null;
    last_error_at: IsoUtc | null;
    message: string | null;
  };

  database: {
    status: HealthStatus;
    last_ok_at: IsoUtc | null;
    last_error_at: IsoUtc | null;
    message: string | null;
  };

  scheduler: {
    fast_tick_last_ran_at: IsoUtc | null;
    slow_tick_last_ran_at: IsoUtc | null;
  };

  notifications: {
    os_permission: "unknown" | "granted" | "denied";
    muted_by_logic: boolean;
    muted_reason:
      | null
      | "observe_only"
      | "cooldown"
      | "paused"
      | "mode_gate";
  };

  observe_only: {
    active: boolean;
    ticks_remaining: number | null;
  };
};
```

### Health Rules

- `overall_status` is derived by the logic layer, not the UI.
- If `screenpipe.status` is `down`, `mode` should normally be `degraded_screenpipe`.
- If `database.status` is `down`, `mode` should normally be `logic_error`.
- `notifications.os_permission` is a fact reported by the UI layer to the logic layer and then echoed back as canonical health state.

## Inbound Schema: `CommandEnvelope`

```ts
type CommandEnvelope =
  | PauseCommand
  | ResumeCommand
  | UpdateExclusionsCommand
  | ResolveAmbiguityCommand
  | ImportCoachingExchangeCommand
  | ReportNotificationPermissionCommand
  | NotificationActionCommand
  | PurgeAllCommand;
```

Every command shares:

```ts
type CommandBase = {
  schema_version: SchemaVersion;
  command_id: UUID;
  sent_at: IsoUtc;
  kind: string;
};
```

### `pause`

```ts
type PauseCommand = CommandBase & {
  kind: "pause";
  payload: {
    reason: "user_pause" | "break" | "snooze" | "intentional_detour";
    duration_seconds: DurationSeconds | null;
    note: string | null;
  };
};
```

Rules:

- `duration_seconds = null` means pause until explicit resume.
- The logic layer decides the resulting `pause_until`.

### `resume`

```ts
type ResumeCommand = CommandBase & {
  kind: "resume";
  payload: {
    reason: "user_resume" | "notification_return" | "pause_elapsed";
  };
};
```

### `update_exclusions`

```ts
type UpdateExclusionsCommand = CommandBase & {
  kind: "update_exclusions";
  payload: {
    operations: PrivacyExclusionOperation[];
  };
};
```

```ts
type PrivacyExclusionOperation =
  | {
      op: "upsert";
      entry: PrivacyExclusionEntry;
    }
  | {
      op: "remove";
      exclusion_id: OpaqueId;
    };
```

```ts
type PrivacyExclusionEntry = {
  exclusion_id: OpaqueId | null;
  label: string;
  match_type: "app" | "domain" | "url_regex" | "window_title_regex";
  pattern: string;
  enabled: boolean;
};
```

Rules:

- `upsert` with `exclusion_id = null` creates a new exclusion.
- `upsert` with a known `exclusion_id` updates an existing exclusion.
- `remove` deletes only the app-owned exclusion record. It must not delete any Screenpipe data.

### `resolve_ambiguity`

```ts
type ResolveAmbiguityCommand = CommandBase & {
  kind: "resolve_ambiguity";
  payload: {
    clarification_id: OpaqueId;
    answer_id: OpaqueId;
    remember_choice: "do_not_remember" | "remember_as_task" | "remember_as_work_group";
    user_note: string | null;
  };
};
```

### `import_coaching_exchange`

```ts
type ImportCoachingExchangeCommand = CommandBase & {
  kind: "import_coaching_exchange";
  payload: {
    source: "manual_paste" | "clipboard";
    raw_text: string;
  };
};
```

Rules:

- `raw_text` is the sanitized pasted JSON string.
- The UI should sanitize text before sending, but the logic layer still owns final validation.
- The logic layer parses `raw_text` into `CoachingExchange`.
- On success, the resulting canonical state is persisted and reflected later through `SystemState`.

### `notification_action`

```ts
type NotificationActionCommand = CommandBase & {
  kind: "notification_action";
  payload: {
    intervention_id: OpaqueId;
    action_id: OpaqueId;
  };
};
```

### `report_notification_permission`

```ts
type ReportNotificationPermissionCommand = CommandBase & {
  kind: "report_notification_permission";
  payload: {
    os_permission: "unknown" | "granted" | "denied";
  };
};
```

Rules:

- This is a bridge-health command, not a user-facing intent command.
- The UI should send it on startup and whenever OS notification permission changes.

### `purge_all`

```ts
type PurgeAllCommand = CommandBase & {
  kind: "purge_all";
  payload: {
    confirm_phrase: "DELETE ALL COACHING DATA";
  };
};
```

Rules:

- This clears app-owned plans, episodes, classifications, memory, review items, and settings that are defined as purgeable.
- This must not delete Screenpipe storage.
- After purge, the logic layer should reseed default privacy exclusions and emit `mode = "no_plan"`.

## Synchronous Response Schema: `CommandResponse`

```ts
type CommandResponse = {
  schema_version: SchemaVersion;
  command_id: UUID;
  responded_at: IsoUtc;

  status: "accepted" | "rejected" | "noop";
  code:
    | "accepted"
    | "duplicate_command"
    | "validation_error"
    | "stale_target"
    | "mode_conflict"
    | "not_found"
    | "forbidden"
    | "internal_error";

  message: string;
  field_errors: FieldError[];

  suggested_retryable: boolean;
  resulting_stream_sequence: SequenceNumber | null;
};
```

```ts
type FieldError = {
  path: string; // JSON pointer style, example: "/payload/raw_text"
  code: string;
  message: string;
};
```

### Response Rules

- `accepted` means the command was valid and queued or applied.
- `rejected` means the command could not be accepted. The UI should surface `message` and `field_errors`.
- `noop` means the command was valid but changed nothing, for example resuming when already running.
- `resulting_stream_sequence` is optional because the authoritative snapshot may be emitted slightly later.
- The UI must not assume that a successful command response implies the screen state is already updated locally.

## Referenced Import Schema: `CoachingExchange`

The morning and evening cloud exchanges are not the main runtime bridge, but they are part of the UI-to-logic contract because the UI submits them.

The logic layer validates this schema after parsing `ImportCoachingExchangeCommand.payload.raw_text`.

```ts
type CoachingExchange = MorningPlanExchange | EveningDebriefExchange;
```

### `morning_plan`

```ts
type MorningPlanExchange = {
  schema_version: SchemaVersion;
  exchange_type: "morning_plan";
  local_date: LocalDate;
  total_intended_work_seconds: DurationSeconds;
  notes_for_tracker: string | null;
  tasks: MorningPlanTask[];
};
```

```ts
type MorningPlanTask = {
  title: string;
  success_definition: string;
  total_remaining_effort_seconds: DurationSeconds | null;
  intended_work_seconds_today: DurationSeconds;
  progress_kind: ProgressKind;
  allowed_support_work: string[];
  likely_detours_that_still_count: string[];
};
```

Validation rules:

- `tasks.length` must be `1..3`.
- `local_date` must match the app's local day when imported unless the user is explicitly importing a backdated plan.
- `total_intended_work_seconds` must be greater than `0`.
- The sum of task intended seconds must be less than or equal to `total_intended_work_seconds`.

### `evening_debrief`

```ts
type EveningDebriefExchange = {
  schema_version: SchemaVersion;
  exchange_type: "evening_debrief";
  local_date: LocalDate;
  overall_day_summary: string;
  task_outcomes: EveningTaskOutcome[];
  new_support_patterns_to_remember: string[];
  patterns_to_not_remember: string[];
  corrections_for_task_boundaries: string | null;
  carry_forward_to_tomorrow: string | null;
  coaching_note_for_tomorrow: string | null;
};
```

```ts
type EveningTaskOutcome = {
  task_title: string;
  did_progress_occur: "yes" | "no" | "partial";
  what_counted_as_real_progress: string | null;
  what_was_support_work: string | null;
  what_was_misclassified_or_ambiguous: string | null;
};
```

Validation rules:

- `task_outcomes.length` must be `1..3`.
- `local_date` should match the active plan date unless this is an explicit retro import.

## Canonical Mode Semantics

### `booting`

- Startup not complete.
- UI may show loading state.
- Commands allowed: `update_exclusions`.

### `no_plan`

- No active imported morning plan exists.
- Runtime classifiers and intervention engine are gated off.
- UI should route the user toward the morning flow.
- Commands allowed: `import_coaching_exchange`, `update_exclusions`, `purge_all`.

### `running`

- Full runtime active.
- All normal commands allowed.

### `paused`

- Runtime classification and interventions are halted by user intent.
- Existing history remains visible.
- `resume` is allowed.

### `degraded_screenpipe`

- Screenpipe is unavailable or unhealthy enough that observation is unreliable.
- Runtime should not pretend confidence.
- UI should render a degraded warning and gray status.
- Allowed commands remain available, but classifier-driven transitions are gated.

### `logic_error`

- App-owned logic runtime has failed a critical invariant or storage dependency.
- UI should render read-only diagnostics and avoid sending non-recovery commands.

Mode-independent rule:

- `report_notification_permission` is always allowed because it maintains bridge health state rather than user intent state.

## Edge-Case Rules

### Reconnects

- Because the stream always sends full snapshots, reconnect requires no diff replay.
- The UI should clear any transient native-notification dedupe cache when `runtime_session_id` changes.

### Stale Clarification Answers

- If a user answers a clarification after it expired or a newer clarification replaced it, the logic layer returns:
  - `status = "rejected"`
  - `code = "stale_target"`

### Stale Notification Actions

- Notification actions are valid only for the referenced `intervention_id`.
- A second tap on the same action should return `duplicate_command` or `stale_target`, never cause a second intervention side effect.

### Observe-Only Period

- During observe-only, the logic layer may still emit interventions for in-app visibility.
- It must set `suppress_native_notification = true`.
- The UI must obey that flag.

### Cooldown

- During a hard-drift cooldown, the logic layer may keep `runtime_state = "hard_drift"` without re-emitting a native notification.
- The UI must not infer that a missing notification means the user has recovered.

### Permission Denial

- If notification permissions are denied, the UI reports that fact to logic and logic echoes it via `system_health.notifications.os_permission = "denied"`.
- The UI may show the intervention in-app, but must not attempt native delivery.

### Purge Safety

- `purge_all` never affects Screenpipe raw storage.
- After purge, all transient UI panels should disappear on the next stream snapshot.

### Partial Failures

- If a command is accepted but persistence fails before state emission, the next snapshot should move the system into `logic_error` or emit an appropriate banner.
- The UI must trust the stream, not the prior command response.

## Example `SystemState`

```json
{
  "schema_version": "1.0.0",
  "runtime_session_id": "d7d724cd-0e26-432e-91eb-c283725b6922",
  "stream_sequence": 148,
  "emitted_at": "2026-04-18T08:42:11Z",
  "caused_by_command_id": null,
  "mode": "running",
  "menu_bar": {
    "color_token": "green",
    "mode_label": "Running",
    "primary_label": "Checkout redesign",
    "secondary_label": "Aligned for 27m",
    "runtime_state": "aligned",
    "is_support_work": false,
    "confidence_ratio": 0.92,
    "active_goal_id": "goal_1",
    "active_goal_title": "Ship billing improvements",
    "active_task_id": "task_1",
    "active_task_title": "Finish checkout redesign",
    "state_started_at": "2026-04-18T08:15:02Z",
    "focused_elapsed_seconds": 1629,
    "pause_until": null,
    "allowed_actions": {
      "can_pause": true,
      "can_resume": false,
      "can_take_break": true,
      "can_open_morning_flow": false,
      "can_open_evening_flow": true
    }
  },
  "dashboard": {
    "header": {
      "local_date": "2026-04-18",
      "mode": "running",
      "summary_text": "1 of 3 tasks is actively moving.",
      "warning_banner": null
    },
    "plan": {
      "plan_id": "plan_2026_04_18",
      "imported_at": "2026-04-18T07:02:41Z",
      "local_date": "2026-04-18",
      "total_intended_work_seconds": 21600,
      "notes_for_tracker": "Bias toward shipping over polishing.",
      "tasks": [
        {
          "task_id": "task_1",
          "title": "Finish checkout redesign",
          "success_definition": "Desktop and mobile states ready for review.",
          "total_remaining_effort_seconds": 18000,
          "intended_work_seconds_today": 10800,
          "progress_kind": "artifact_based",
          "allowed_support_work": ["Figma review", "Design QA", "Implementation notes"],
          "likely_detours_that_still_count": ["Stripe docs", "Checkout copy review"]
        }
      ]
    },
    "current_focus": {
      "runtime_state": "aligned",
      "is_support_work": false,
      "confidence_ratio": 0.92,
      "explainability": [
        {
          "code": "repo_continuity",
          "detail": "The current repo and file path match the active task.",
          "weight": 0.9
        },
        {
          "code": "artifact_keywords",
          "detail": "Recent titles and text mention checkout, mobile, and redesign.",
          "weight": 0.78
        }
      ],
      "last_good_context": "Figma - Checkout Design",
      "last_updated_at": "2026-04-18T08:42:11Z"
    },
    "progress": {
      "total_intended_work_seconds": 21600,
      "total_aligned_seconds": 7120,
      "total_support_seconds": 1850,
      "total_drift_seconds": 640,
      "tasks": [
        {
          "task_id": "task_1",
          "title": "Finish checkout redesign",
          "progress_ratio": 0.44,
          "confidence_ratio": 0.71,
          "risk_level": "low",
          "aligned_seconds": 7120,
          "support_seconds": 1400,
          "drift_seconds": 300,
          "eta_remaining_seconds": 9200,
          "latest_status_text": "Steady artifact progress."
        }
      ]
    },
    "recent_episodes": [],
    "corrections": [],
    "ambiguity_queue": [],
    "review_queue": [],
    "morning_exchange": {
      "status": "completed",
      "context_packet_text": null,
      "prompt_text": null
    },
    "evening_exchange": {
      "status": "available",
      "debrief_packet_text": "EVENING_PACKET\\n- Imported morning plan...\\n",
      "prompt_text": "You are my evening debrief coach..."
    },
    "privacy_exclusions": {
      "exclusions": [
        {
          "exclusion_id": "privacy_1",
          "label": "1Password",
          "match_type": "app",
          "pattern": "1Password",
          "enabled": true
        }
      ]
    }
  },
  "clarification_hud": null,
  "intervention": null,
  "system_health": {
    "overall_status": "ok",
    "screenpipe": {
      "status": "ok",
      "last_ok_at": "2026-04-18T08:42:00Z",
      "last_error_at": null,
      "message": null
    },
    "database": {
      "status": "ok",
      "last_ok_at": "2026-04-18T08:42:11Z",
      "last_error_at": null,
      "message": null
    },
    "scheduler": {
      "fast_tick_last_ran_at": "2026-04-18T08:42:00Z",
      "slow_tick_last_ran_at": "2026-04-18T08:42:00Z"
    },
    "notifications": {
      "os_permission": "granted",
      "muted_by_logic": false,
      "muted_reason": null
    },
    "observe_only": {
      "active": false,
      "ticks_remaining": null
    }
  }
}
```

## Example `CommandResponse` for Invalid Coaching Import

```json
{
  "schema_version": "1.0.0",
  "command_id": "8f0c0737-5ea7-4dd2-9a26-2ef6b281a6fa",
  "responded_at": "2026-04-18T07:05:33Z",
  "status": "rejected",
  "code": "validation_error",
  "message": "The pasted coaching exchange is valid JSON but does not satisfy the required schema.",
  "field_errors": [
    {
      "path": "/tasks/0/intended_work_seconds_today",
      "code": "required",
      "message": "Task intended work time is required."
    }
  ],
  "suggested_retryable": true,
  "resulting_stream_sequence": null
}
```

## Testing Requirements

The contract is only complete if both sides test against it.

Minimum required tests:

- TypeScript contract fixtures for every command and every major `SystemState` mode
- Swift decoder tests against those fixtures
- Round-trip tests for stale command handling
- SSE reconnect tests using `runtime_session_id` and `stream_sequence`
- Invalid coaching import tests with field-level error assertions
- Notification suppression tests for observe-only and cooldown

## Recommended File Ownership

- The TypeScript side should implement this with `Zod` schemas and export generated fixtures.
- The Swift side should mirror these models exactly and decode them without lossy translation.
- No UI text that affects meaning should live only in Swift.

## Final Rule

The logic layer decides what the state means.

The UI layer decides only how to render that already-decided state and how to send user intent back through typed commands.
