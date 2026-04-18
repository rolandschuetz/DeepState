Here is the revised, dependency-aware task list. The main change is that the plan now optimizes for a thin, trustable end-to-end MVP first, then layers on ambiguity learning and richer reinforcement afterward.

Tasks are still broken down into roughly **~30-minute implementation chunks**, but the recommended delivery order is now explicit so the backlog does not drift away from the declared MVP.

---

## Recommended Delivery Order

### Slice 1: Trustworthy App Shell
- [ ] Shared bridge contracts, schema fixtures, and health states
- [ ] Booting / disconnected / no-plan / paused UI states
- [ ] Privacy exclusions and delete-all flow

### Slice 2: Morning Contract Loop
- [ ] Morning prompt export
- [ ] Strict JSON import validation
- [ ] Stored daily plan and initial dashboard/menu state

### Slice 3: Passive Focus Tracking
- [ ] Screenpipe ingest
- [ ] Context aggregation
- [ ] Deterministic classification
- [ ] Menu bar status updates

### Slice 4: Drift Intervention Loop
- [ ] Soft-drift grace period
- [ ] Hard-drift notification with cooldown
- [ ] Explainability bullets
- [ ] Pause / break actions

### Slice 5: Evening Reflection Loop
- [ ] Evening debrief packet export
- [ ] Evening prompt export
- [ ] Strict evening JSON import

### Slice 6: Post-MVP Learning
- [ ] Ambiguity resolution memory
- [ ] Praise tuning
- [ ] Reviewable memory promotion
- [ ] Local AI helpers where clearly justified

---

### 🧠 TypeScript Developer Task List (Logic Layer)
*Tech Stack: Node.js, TypeScript, Zod, better-sqlite3, Express/Fastify (HTTP & SSE). Use local AI only for bounded, non-critical helpers and keep deterministic behavior as the default.*

**Phase 0: Contracts, Fixtures, and Health**
- [ ] Initialize `logic/` Node+TS project with strict mode and `vitest`.
- [ ] Define core Zod schemas for domain primitives (`Timestamp`, `FocusState`, `Confidence`, `HealthStatus`).
- [ ] Define outbound bridge schemas (`MenuBarViewModel`, `DashboardViewModel`, `ClarificationViewModel`, `InterventionViewModel`, `SystemHealthViewModel`).
- [ ] Define inbound bridge schemas (`PauseAction`, `UpdateExclusionsAction`, `ResolveAmbiguityAction`, `ImportFocusForTodayAction`, `ImportEveningDebriefAction`, `NotificationAction`).
- [ ] Add explicit `schema_version` fields to bridge payloads and morning/evening import formats.
- [ ] Create JSON fixture payloads and golden tests for all inbound/outbound contracts so Swift and TS can validate against the same examples.
- [ ] Set up HTTP server scaffolding with `/health` and `/diagnostics`, including separate status reporting for DB, Screenpipe, and optional Ollama integrations.

**Phase 1: Persistence & Canonical Memory**
- [ ] Set up `better-sqlite3`. Enable `WAL` journal mode and `busy_timeout`.
- [ ] Write a lightweight schema migration runner.
- [ ] Base migrations: `app_settings`, `privacy_exclusions`, `runtime_health_events`.
- [ ] Planning migrations: `daily_plans`, `goal_contracts`, `task_contracts`.
- [ ] Observation migrations: `observations`, `context_windows`, `episodes`, `classifications`.
- [ ] Learning migrations: `daily_memory_notes`, `durable_memory_items`, `user_corrections`, `labeled_examples`, `ambiguity_events`, `notification_history`, `review_queue`.
- [ ] Implement `SettingsRepo` and `DailyPlanRepo` with CRUD methods and unit tests.
- [ ] Implement a startup rule: if there is no imported daily plan, the system stays in explicit `no_plan` mode and does not emit drift interventions.

**Phase 2: Screenpipe Ingestion & Privacy**
- [ ] Implement Screenpipe HTTP client with a `/health` probe and degraded-mode detection.
- [ ] Implement Screenpipe `/search` polling adapter with overlap and deduplication.
- [ ] Implement `EvidenceNormalizer` to map raw Screenpipe records into an app-owned evidence schema.
- [ ] Implement `PrivacyFilter` so excluded apps/domains are dropped before persistence; only minimal audit counters may remain.
- [ ] Implement `ContextAggregator` to roll 10-15s raw events into contiguous 60-90s `ContextWindow`s.
- [ ] Add replay fixtures for normalized evidence so classification work can be tested without live Screenpipe data.

**Phase 3: Morning Flow Export/Import**
- [ ] Implement `MorningContextPacketBuilder` using yesterday carry-over context plus durable memory that is safe to surface.
- [ ] Implement `MorningPromptGenerator` as a copy-paste prompt that instructs ChatGPT to return strict final JSON only.
- [ ] Implement `FocusForTodayParser` with explicit validation errors for malformed JSON, missing fields, and unsupported schema versions.
- [ ] Implement import service to save validated plan data into `daily_plans` and publish initial `DashboardViewModel` and `MenuBarViewModel`.
- [ ] Expose `/morning/prompt` and `/morning/import` endpoints.
- [ ] Add parser golden tests using valid, invalid, and near-miss morning payload examples.

**Phase 4: Classification & Focus State**
- [ ] Implement deterministic rules that evaluate evidence against declared task/support patterns without flat app-level truth.
- [ ] Implement weighted evidence scoring as a secondary input, not the sole classifier.
- [ ] Implement `FocusStateMachine` for `on_task`, `supporting_task`, `soft_drift`, `hard_drift`, `uncertain`, `break`, `meeting`, `idle`, and `paused`.
- [ ] Implement hysteresis to require sustained evidence across multiple ticks before state changes.
- [ ] Implement retrieval of recent user corrections before any LLM-assisted ambiguity handling.
- [ ] Implement `/action/pause` to halt classifier evaluations and emit a `paused` state immediately.
- [ ] Add replay tests that verify state transitions for common sequences such as on-task -> soft drift -> recovery and on-task -> hard drift.

**Phase 5: Progress, Explainability, and Interventions**
- [ ] Implement `EpisodeBuilder` to roll `ContextWindow`s into 3-5 minute episodes for progress reasoning.
- [ ] Implement V1 goal matching and time-based progress only: match aligned time to declared tasks and intended daily hours. Do not block MVP on milestone/artifact inference.
- [ ] Implement `ExplainabilityGenerator` that translates internal reason codes into 2-3 human-readable bullets.
- [ ] Implement `InterventionEngine` for soft-drift silence, hard-drift redirect candidates, and cooldown enforcement.
- [ ] Implement cooldown tracking so no hard-drift notification can repeat within 15 minutes.
- [ ] Add notification policy tests covering cooldowns, no-plan mode, paused mode, and degraded Screenpipe mode.

**Phase 6: Evening Flow & Reviewable Learning**
- [ ] Implement `EveningDebriefPacketBuilder` from plans, episodes, drift blocks, pauses, and ambiguity overrides.
- [ ] Implement `EveningPromptGenerator` as a copy-paste prompt that asks ChatGPT for strict final JSON only.
- [ ] Implement `EveningDebriefParser` with schema-version checks and explicit validation errors.
- [ ] Store imported debrief outputs as structured learning input, separate from raw exports and separate from any cloud conversation text.
- [ ] Implement a review queue for proposed durable memories or rule updates instead of auto-promoting them immediately.
- [ ] Add parser golden tests using valid, invalid, and adversarial evening payload examples.

**Phase 7: Ambiguity Resolution & Praise**
- [ ] Implement stable ambiguity detection so clarification appears only after sustained uncertainty.
- [ ] Implement `/action/resolve-ambiguity` to apply the correction to the current window, optionally remember the pattern, and record a labeled example.
- [ ] Implement praise eligibility rules for uninterrupted `on_task` streaks longer than 25 minutes.
- [ ] Generate praise candidates using deterministic templates first; keep message copy task-level and sparse.
- [ ] Add a narrow Ollama adapter only if deterministic phrasing proves insufficient; it must be optional and never block runtime classification or notifications.

**Phase 8: Scheduler, Diagnostics, and Maintenance**
- [ ] Implement the master scheduler: 15s ingest tick, 90s classify tick, 3m progress tick.
- [ ] Implement scheduled SQLite compaction that preserves review/audit data required for user trust.
- [ ] Implement `/action/purge-all` to clear app-owned data without touching Screenpipe storage.
- [ ] Add diagnostics for current classifier state, last evidence window, active cooldowns, and latest health transitions.

---

### 🖥️ Mac Developer Task List (UI Layer)
*Tech Stack: Swift, SwiftUI, AppKit, SMAppService, UserNotifications.*

**Phase 0: App Shell & Contract Safety**
- [ ] Initialize macOS SwiftUI app. Remove dock icon and configure required entitlements.
- [ ] Define Swift models from the shared bridge contract and validate them against the JSON fixture payloads from the TS layer.
- [ ] Implement `BridgeClient` using `URLSession` for action posts plus SSE streaming for state updates.
- [ ] Add top-level UI states for `booting`, `logic_disconnected`, `screenpipe_degraded`, `no_plan`, and `paused`.
- [ ] Add a small diagnostics surface so the user can see why the coach is passive instead of guessing.

**Phase 1: Morning Flow & Passive UI**
- [ ] Create `MorningFlowView` with a read-only morning prompt area and a `Copy` action.
- [ ] Add a multiline input for the final ChatGPT JSON result.
- [ ] Wire `ImportFocusForTodayAction` and render parser errors inline in a way the user can fix.
- [ ] Create a minimal dashboard state that can show imported goals before live tracking exists.
- [ ] Ensure the UI clearly distinguishes `no plan imported yet` from `system broken`.

**Phase 2: Menu Bar Status**
- [ ] Create a minimal `MenuBarExtra` wrapper.
- [ ] Bind icon tint to `MenuBarViewModel` state: green, blue, yellow, red, gray.
- [ ] Render active task, timer, and confidence in the dropdown.
- [ ] Add quick actions for pause durations and break mode.
- [ ] Wire quick actions to `PauseAction` payloads through `BridgeClient`.

**Phase 3: Explainability, Health, and Settings**
- [ ] Build the main dashboard window for goals, progress, and confidence.
- [ ] Implement the "Why am I seeing this?" accordion using TS-generated evidence bullets.
- [ ] Create Settings tabs for General, Privacy, and Advanced.
- [ ] Build privacy exclusions UI for app/domain limits and wire it to `UpdateExclusionsAction`.
- [ ] Build the destructive `Delete All Coaching Data` flow with confirmation.
- [ ] Implement `SMAppService` support for launch at login.

**Phase 4: Interventions & Clarification HUD**
- [ ] Register `UNUserNotificationCenter` and handle the denied-permission state gracefully.
- [ ] Listen for TS interventions and trigger native local notifications for hard drift first.
- [ ] Add notification actions for `Intentional Detour` and `Return Now`, and route them back to TS.
- [ ] Scaffold `ClarificationHUD` as a transient `NSPanel`.
- [ ] Display clarification options only when the TS layer emits a `ClarificationViewModel`.
- [ ] Wire HUD submissions to `ResolveAmbiguityAction` and dismiss immediately.
- [ ] Add praise notification rendering only after hard-drift notifications are working and rate-limited.

**Phase 5: Evening Flow & Review UI**
- [ ] Create `EveningDebriefView` with read-only packet text and a `Copy` action.
- [ ] Add a multiline input for the final evening JSON result and wire `ImportEveningDebriefAction`.
- [ ] Render parser errors inline for malformed evening imports.
- [ ] Add a simple review surface for proposed memory/rule updates from the TS review queue.

---

### ✅ Cross-Cutting Quality Tasks
- [ ] Add contract compatibility tests so TS fixture payloads decode in Swift without silent drift.
- [ ] Add replay-driven classifier tests based on realistic workday traces.
- [ ] Add prompt/parser golden tests for morning and evening import formats.
- [ ] Add manual QA scripts for `no plan`, `paused`, `notification denied`, `Screenpipe down`, and `logic service disconnected`.
- [ ] Add explicit copy/style checks so praise and redirects stay task-level and non-judgmental.

---

### 🚢 Bringing It All Together (Integration & Release)
*(Complete this only after Slices 1-5 work end to end in local development.)*

- [ ] Bundle the TS logic project into a single macOS executable using a supported strategy such as `esbuild` + `sea`.
- [ ] Move the generated binary into the Xcode app bundle resources.
- [ ] Launch the TS binary from the Swift app on startup and terminate it cleanly on app exit.
- [ ] Pass an available local port from Swift to TS to avoid port conflicts.
- [ ] End-to-end test: morning JSON import -> stored plan -> initial dashboard/menu update.
- [ ] End-to-end test: Screenpipe ingest -> classification -> menu bar color changes.
- [ ] End-to-end test: soft drift stays silent; hard drift sends exactly one notification during cooldown window.
- [ ] End-to-end test: Screenpipe unavailable or notification permissions denied leaves the app understandable rather than broken.
- [ ] End-to-end test: evening packet export -> ChatGPT JSON import -> review queue entries created.
- [ ] Set up Xcode build phases so the embedded TS binary is signed before the outer app bundle is signed.
- [ ] Run notarization on the final `.app` and verify network and notification entitlements remain intact.

---

### Deferred Until After MVP
- [ ] Artifact-based progress inference from commits, docs, exports, or external tools.
- [ ] Milestone auto-detection prompts such as "Mark complete?".
- [ ] Rich local AI summarization before morning/evening prompt generation.
- [ ] LLM-generated praise or redirect phrasing as the default path.
- [ ] Any feature that requires the app to infer canonical truth from raw chat transcripts rather than structured imports.
