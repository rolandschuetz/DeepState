Here is the final, dependency-aware task list, restructured explicitly into the three requested parts. 

It preserves the checklist formatting and scope of the original architecture while strictly incorporating all the newly requested tightening recommendations (unified single-stream bridge, 2-tick scheduler, 5-state machine simplification, SQLite-only 2-layer memory, JSON-backed explainability, Paste Sanitization, the "Recovery Anchor", centralized messaging, and default privacy/grace periods).

---

## Recommended Delivery Order

**Slice 1: Trustworthy App Shell**
- Shared bridge contracts (`GET /stream` envelope, `POST /command` discriminator), schema fixtures, health states
- UI shell responding to global `Mode` states: `booting`, `no_plan`, `running`, `paused`, `degraded_screenpipe`, `logic_error`
- Default privacy exclusions preset + delete-all flow

**Slice 2: Morning Contract Loop**
- Morning prompt export (enforcing strict JSON output from ChatGPT)
- Swift Paste Sanitizer + TS strict JSON import validation via unified `CoachingExchange` schema
- Stored daily plan transitioning system mode to `running`

**Slice 3: Passive Focus Tracking**
- Screenpipe ingest on the 15s Fast Tick
- Context aggregation and 5-state deterministic classification on the 90s Slow Tick
- Menu bar status updates via the unified stream

**Slice 4: Drift Intervention Loop**
- Soft-drift grace period (silent)
- Hard-drift notification + 15-minute cooldown
- JSON-backed explainability bullets rendered blindly by UI
- "Observe-only" grace period for new installs
- The Recovery Anchor message on return from drift

**Slice 5: Evening Reflection Loop**
- Evening debrief packet export (automatically appending episode evidence bullets)
- Evening prompt export (strict JSON)
- Strict evening JSON import via the unified parser

**Slice 6: Post-MVP Learning**
- Ambiguity resolution tracking
- Praise tuning (max 1 per block)
- SQLite Reviewable durable-rule promotion

---

## 1. 🧠 TypeScript Developer To-Do's (Logic Layer)
*Tech Stack: Node.js, TypeScript, Zod, better-sqlite3. Use local AI only for bounded, non-critical helpers. Design rule: fully deterministic by default. All system loops respect the top-level mode gate and run on exactly two unified timers (Fast Tick & Slow Tick).*

**Phase 0: Contracts, Fixtures, and Health**
- [ ] Initialize `logic/` Node+TS project with strict mode and `vitest`.
- [ ] Create companion workspace folders for `shared-contracts/`, `fixtures/`, and `scripts/` so schemas, sample payloads, and migration/test helpers stay versioned outside UI-specific code.
- [ ] Define core Zod schemas for domain primitives (`Timestamp`, `Confidence`, `HealthStatus`).
- [ ] Define rigid top-level `Mode` enum: `booting | no_plan | running | paused | degraded_screenpipe | logic_error`.
- [ ] Define simplified 5-state runtime state enum: `aligned | uncertain | soft_drift | hard_drift | paused`. 
- [ ] Add companion flags to the classification: `is_support: boolean` (e.g. support work is just `aligned` + `is_support: true`).
- [ ] Define a single outbound `SystemState` schema for the `GET /stream` endpoint containing: `schema_version`, `mode`, `menu_bar`, `dashboard`, `clarification_hud`, `intervention`, and `system_health`.
- [ ] Define a single inbound `Command` schema for `POST /command` using a type discriminator: `pause`, `resume`, `update_exclusions`, `resolve_ambiguity`, `import_coaching_exchange`, `notification_action`, `purge_all`.
- [ ] Define unified `CoachingExchange` import schema with an `exchange_type: "morning_plan" | "evening_debrief"` discriminator and an explicit `schema_version` field.
- [ ] Create JSON fixture payloads and golden tests for all inbound/outbound contracts so Swift validates against the same examples.
- [ ] Emit JSON Schema snapshots for bridge payloads and import payloads so contract drift is catchable in CI.
- [ ] Set up HTTP server scaffolding with `GET /stream` (SSE) and `POST /command`. Keep `/health` and `/diagnostics` for internal probes only.
- [ ] Add correlation IDs and typed action result envelopes (`success`, `validation_error`, `retryable_failure`, `fatal_failure`) for async command flows.
- [ ] Create a central mode gate utility so classification, intervention, and progress logic evaluate **only** if `mode === "running"`.
- [ ] Implement runtime config loading for DB path, Screenpipe base URL, health timeouts, log level, and feature flags.
- [ ] Add structured module-scoped diagnostics/logging (`scheduler`, `screenpipe`, `classifier`, `intervention`, `import`, `memory`) to support the future debug panel.

**Phase 1: Persistence & Canonical Memory (2 Layers)**
- [ ] Set up `better-sqlite3`. Enable `WAL` journal mode and `busy_timeout`.
- [ ] Write a lightweight schema migration runner with explicit versioning.
- [ ] Add migration guard rails: idempotent startup runner, migration lock/guard, rollback handling for failed migrations, and a smoke-test fixture database.
- [ ] Base migrations: `app_settings` (including a field for `observe_only_ticks_remaining`), `privacy_exclusions`, and `runtime_health_events`.
- [ ] Planning migrations: `daily_plans`, `goal_contracts`, `task_contracts`, `focus_blocks`, and `import_audit_log`.
- [ ] Observation migrations: `observations`, `context_windows`, `episodes`, `classifications`, `progress_estimates`, `interventions`, and `intervention_outcomes`.
- [ ] Add a `JSON` column to the `classifications` table named `explainability` to dynamically store arrays of `{ code, detail, weight }`.
- [ ] Learning migrations (reduced for MVP): `daily_memory_notes` (Daily Memory layer), `durable_rules` (Long-term rules layer for user-confirmed patterns), `user_corrections`, `signal_weights`, and `rule_proposals`. *Drop vector retrieval indices for V1.* 
- [ ] Implement `SettingsRepo`, `DailyPlanRepo`, `TaskRepo`, `FocusBlockRepo`, `ObservationRepo`, `EpisodeRepo`, `ClassificationRepo`, `ProgressRepo`, `InterventionRepo`, `CorrectionRepo`, `MemoryRepo`, `RuleProposalRepo`, and `PrivacyExclusionsRepo` with CRUD methods.
- [ ] Implement startup rule: if there is no imported daily plan to load, system top-level state enters `no_plan` mode; engines idle automatically.
- [ ] Implement default privacy exclusions preset: upon first boot, automatically seed the `privacy_exclusions` table with standard regex patterns for password managers (1Password, Keychain) and common banking/checkout domains.
- [ ] Keep transactions short, expose an explicit WAL checkpoint hook for maintenance, and implement bounded retry/backoff for transient `SQLITE_BUSY` cases.
- [ ] Add compact retention rules: keep Screenpipe refs instead of duplicated media, prune stale intermediate windows, and let the user tune retention duration later through settings.
- [ ] Implement local data export as JSON and/or SQLite backup, and ensure `purge_all` also clears reviewable rule proposals and other app-owned derived caches without mutating Screenpipe data.

**Phase 2: Screenpipe Ingestion & Privacy Filtering**
- [ ] Implement Screenpipe HTTP client with a `/health` probe and degraded-mode detection (sets `mode = "degraded_screenpipe"`).
- [ ] Detect Screenpipe capabilities at startup (`/elements`, `/frames/{id}/context`, audio transcript availability, exposed version if present) and record them in diagnostics.
- [ ] Implement Screenpipe `/search` polling adapter with overlap and deduplication.
- [ ] Track the last successful ingest timestamp, normalize all inbound timestamps to UTC, and ignore windows outside the retention/lookback policy.
- [ ] Implement `EvidenceNormalizer` to map raw Screenpipe records into an app-owned evidence schema.
- [ ] Canonicalize app identifiers, sanitize window titles, normalize URLs into host/path tokens, summarize input activity, and attach Screenpipe refs for explainability drill-down.
- [ ] Implement `PrivacyFilter` so excluded apps/domains are completely dropped before logic checks; only minimal audit counters may remain.
- [ ] Redact protected text fragments before persistence, drop private/incognito contexts when detectable, and never store excluded evidence in the coach DB.
- [ ] Implement `ContextAggregator` to roll raw events into contiguous 90s `ContextWindow`s.
- [ ] Preserve short sequence context around each window (`what came before`, `what followed`, dwell duration) so valid support work is classifiable.
- [ ] Tag likely meeting contexts from conferencing apps, audio-heavy low-typing periods, and available meeting titles/collaborator hints.
- [ ] Add replay fixtures for normalized evidence to test classification offline.
- [ ] Handle adapter edge cases explicitly: partial Screenpipe results, missing frame context, overlapping duplicate polls, and slow queries that exceed the scheduler budget.

**Phase 3: Morning Flow Export & Unified JSON Import**
- [ ] Trigger the morning flow on first meaningful activity, first menu bar open of the day, manual "Start My Day", or manual plan reset.
- [ ] Implement `MorningContextPacketBuilder` using yesterday carry-over context plus durable rules safe to surface.
- [ ] Include unresolved ambiguities, yesterday debrief outcomes, and manually declared meetings/open questions in the morning context packet when available.
- [ ] Implement `MorningPromptGenerator` as a copy-paste prompt instructing ChatGPT explicitly to return **strict schema-versioned JSON only** (no markdown text outside the JSON).
- [ ] Implement `CoachingExchangeParser` handling the unified import payload. Branch to `exchange_type === "morning_plan"`.
- [ ] Add explicit validation errors for malformed JSON, missing fields, or unsupported schema versions.
- [ ] Reject transcript-like freeform payloads, validate 1-3 tasks, validate intended hours and success definitions, and validate the structure of allowed support work/detours.
- [ ] Implement import service to save validated plan data into `daily_plans`, immediately transition `mode` to `running`, and push the SSE state block.
- [ ] Persist `goal_contracts`, `task_contracts`, optional `focus_blocks`, initialize progress baselines, and append an `import_audit_log` record for every accepted import.
- [ ] Support safe midday re-import / plan reset flows without corrupting the active day's observation history.

**Phase 4: Classification, State Machine & Recovery Anchor**
- [ ] Implement deterministic rules evaluating evidence against today's declared tasks.
- [ ] Add weighted evidence scoring on top of deterministic matches using recency, novelty penalties, contradiction penalties, and confidence floor/ceiling rules.
- [ ] Back all evaluation checks into an `{ code, detail, weight }` format stored to the `explainability` JSON array on the classification output.
- [ ] Implement hysteresis rules to require sustained evidence across multiple ticks before triggering a state change.
- [ ] Implement retrieval of recent answers from SQLite `durable_rules` before triggering LLM-assisted ambiguity requests.
- [ ] Gate local AI fallback strictly: only run it when rules, scoring, and retrieval remain ambiguous; pass compact evidence only; require strict structured output; never let model output directly trigger notifications.
- [ ] Implement the **Recovery Anchor**: cache the `last_good_context` string (e.g., active window title/URL) locally whenever the state is high-confidence `aligned`.
- [ ] Implement `pause` command handling to halt classifier evaluations and emit `mode = "paused"` into the stream immediately.
- [ ] Suppress ambiguity prompts during pause, lock/sleep wake churn, and active cooldown windows so the classifier does not teach at noisy boundaries.
- [ ] Add a final intervention gate that checks pause state, cooldown state, notification permission, and whether a better intervention is already pending before surfacing any prompt.
- [ ] Add replay tests verifying required state transitions (e.g. aligned -> soft drift -> recovery; aligned -> hard drift).

**Phase 5: Progress, Explainability & Message Discipline**
- [ ] Implement `EpisodeBuilder` to roll `ContextWindow`s up into 3-5 minute block episodes.
- [ ] Implement V1 goal matching: associate aligned/supporting block time to declared tasks/hours with a confidence rating.
- [ ] Persist `progress_estimates`, `interventions`, and `intervention_outcomes` so progress, prompts, and user responses are reviewable later.
- [ ] Add progress risk detection for behind-pace work, repeated ambiguity on one goal, excessive support work, and heavy context switching during a critical block.
- [ ] Implement `ExplainabilityGenerator` that references internal reason codes and spits out 2-3 human-readable bullets into the `classifications.explainability` field.
- [ ] Include confidence rationale and a short "what would change this decision" debugging hint in the explainability payload for diagnostics surfaces.
- [ ] Create a centralized `messages.ts` dictionary mapped to states. Hardcode positive reinforcement NLP prefixes strictly (`Locked.`, `Check.`, `Reset.`, `Back.`). No inline UI text is allowed elsewhere in the domain core.
- [ ] Implement `InterventionEngine`: stays entirely silent on soft-drift; emits redirect notification candidate on sustained hard-drift.
- [ ] Implement cooldown tracking: no hard-drift notification can repeat within a rolling 15-minute gap.
- [ ] Implement "Observe-Only" Grace Period: for the first 50-100 ticks of a new installation, calculate the engine normally (updates UI colors), but actively mute the system from emitting native push notifications.
- [ ] Unpack the Recovery Anchor: Upon exiting `hard_drift`, fetch `last_good_context` and emit a structured intervention via `messages.ts` (e.g., `"Back. Continue at [Figma - Checkout Design]."`).
- [ ] Infer milestone-completion candidates from artifact/time evidence and surface them as confirm/dismiss actions only when confidence is strong enough.

**Phase 6: Evening Flow & Reviewable Learning**
- [ ] Implement `EveningDebriefPacketBuilder` stringing together plans, episodes, drift blocks, pauses, and overrides.
- [ ] Include progress signals, estimate-vs-actual effort, unresolved ambiguities, and suggested learning candidates in the debrief packet.
- [ ] Reuse `ExplainabilityGenerator` to automatically append 2-3 concrete evidence bullets to every task episode within the export packet to supply the LLM with hard facts.
- [ ] Implement `EveningPromptGenerator` instructing ChatGPT to spit back **strict JSON only**.
- [ ] Branch `CoachingExchangeParser` for `exchange_type === "evening_debrief"`.
- [ ] Parse clarified task boundaries, corrected ambiguity labels, candidate durable memories, tomorrow suggestions, and milestone relevance from valid evening imports.
- [ ] Parse imported structured debriefs in SQLite `daily_memory_notes`.
- [ ] Implement a review queue for candidate durable rule updates. (Rules must be user-confirmed to pass to `durable_rules`).
- [ ] Convert accepted evening imports into `DailyMemoryNote`, `RuleProposal`, and reviewable durable-memory candidates without auto-promoting speculative text into truth.

**Phase 7: Ambiguity Resolution & Praise**
- [ ] Implement stable ambiguity detection so clarification is required only after prolonged sustained uncertainty.
- [ ] Implement `resolve_ambiguity` command logic: apply manual override string, record labeled example, and optionally add it to `durable_rules`.
- [ ] Support a "remember this pattern" path that stores validated task/support-work mappings without overfitting one-off contexts.
- [ ] Track signal-weight updates from corrections and outcomes: reward correct predictions, penalize false positives/false negatives, and decay stale weights over time.
- [ ] Store durable-rule provenance fields (`source`, `confidence`, `recency`, `last_validated_at`) so promoted rules remain inspectable and reviewable.
- [ ] Implement praise eligibility: an uninterrupted `aligned` streak longer than 25 minutes. Gated strictly behind the observe-only grace period.
- [ ] Generate praise text strictly using `messages.ts` templates (`Locked.` prefix). Cap at max 1 praise per focus block.

**Phase 8: Two-Tick Scheduler, Diagnostics, and Maintenance**
- [ ] Implement bootstrap order explicitly: load config, open DB, run migrations, load durable memory/preferences, probe Screenpipe, start bridge server, start scheduler, and publish initial state.
- [ ] Implement the simplified master scheduler:
  - **Fast Tick (15s)**: Ingest observations, normalize, apply privacy filters, build raw windows.
  - **Slow Tick (90s)**: Classify state, evaluate progress, govern interventions, and emit payload to `GET /stream`.
- [ ] Drop the MVP 3-minute progress tick entirely; bundle progress logic directly into the 90s Slow Tick loop.
- [ ] Add event-driven refresh paths on menu bar open, morning/evening import completion, ambiguity resolution, and unpause so the user is not forced to wait for the next slow tick.
- [ ] Implement app-wide health checks for Screenpipe, DB, bridge, and optional local-AI availability, and record recovery events when critical dependencies return.
- [ ] Encode degraded behavior explicitly: Screenpipe failure disables autonomous classification/interventions but keeps plan review/manual actions available; DB busy states keep the last good state in memory and surface warnings.
- [ ] Implement SQLite compaction scheduling to preserve review/audit data safely for user trust.
- [ ] Implement `purge_all` command handler to dump app-owned data schemas seamlessly without destroying the underlying Screenpipe local server.

---

## 2. 🖥️ Mac Developer To-Do's (UI Layer)
*Tech Stack: Swift, SwiftUI, AppKit, SMAppService, UserNotifications. Keep the Swift App as a "Dumb Terminal" reacting passively to the unified TS stream.*

**Phase 0: App Shell & Unified Bridge Client**
- [ ] Initialize macOS SwiftUI app. Remove dock icon and configure standard entitlements.
- [ ] Define Swift models mapping exactly to the shared JSON `SystemState` schema block, and write test decoders against the TS-generated unit fixtures.
- [ ] Implement `BridgeClient` managing a persistent `URLSession` SSE connection (`GET /stream`) mapping directly to app environment variables.
- [ ] Implement `BridgeClient` single POST dispatcher (`POST /command`) for all outbound data actions.
- [ ] Request a fresh current snapshot on app open and auto-reconnect after logic-process restarts without applying stale state blindly.
- [ ] Introduce a thin app-side state store (`MenuBarState`, `DashboardState`, `PromptImportState`, `PendingNotificationState`, `ClarificationPanelState`, `SettingsState`) driven only by bridge payloads.
- [ ] Map the global TS `Mode` to the top-level SwiftUI router wrapper checking for `booting`, `no_plan`, `running`, `paused`, `degraded_screenpipe`, and `logic_error`.
- [ ] Build a small diagnostic UI referencing the `SystemHealthViewModel` detailing Screenpipe/Database connection integrity.
- [ ] Surface bridge connectivity/version-mismatch problems and command result failures in the diagnostics UI instead of failing silently.

**Phase 1: Paste Sanitizer & Morning Flow**
- [ ] Write a 20-line **Paste Sanitizer** String Extension. This function must catch manual copy/paste sloppiness before submission by automatically stripping markdown code fences (```json), stripping out conversational intro/outro dialogue, and normalizing smart quotes globally into standard quotation marks.
- [ ] Create `MorningFlowView` displaying the read-only morning prompt and `Copy to Clipboard` feature.
- [ ] Add a multiline text area for ChatGPT's response. Run `.pasteSanitize()` on the text content, encapsulate it inside the `import_coaching_exchange` object, and dispatch via `POST /command`.
- [ ] Decode TS parser errors inline cleanly so the user can easily re-edit their payload string.
- [ ] Add explicit success confirmation, edit/re-import affordance, and duplicate-submit protection for in-flight morning imports.

**Phase 2: Menu Bar Status**
- [ ] Create a minimal `MenuBarExtra` view implementation.
- [ ] Bind icon tint colors natively to the `MenuBarViewModel` state payload logic:
  - `aligned` -> Green
  - `aligned` + `is_support == true` -> Blue
  - `uncertain` / `soft_drift` -> Yellow
  - `hard_drift` -> Red
  - `paused` / `no_plan` / `degraded` -> Gray
- [ ] Render the active task label, timer, and current focus scope within the dropdown.
- [ ] Render a compact confidence indicator and non-color state label so the menu bar remains readable and accessible.
- [ ] Add "Pause Coaching" and explicit "Take a Break" actions routing unified actions cleanly back to TS.

**Phase 3: Explainability Dashboard & Settings**
- [ ] Build the main dashboard window to track active focus goals/hours remaining against progress percentages.
- [ ] Add dashboard sections for unresolved ambiguities, pending milestone confirmations, recent events, and the last explainability log.
- [ ] Build the "Why am I seeing this?" accordion section. Note: The UI must **blindly traverse and render** the incoming `{ code, detail, weight }` JSON explainability array passed via `SystemState`. No inferential context evaluation is handled in Swift natively.
- [ ] Build Privacy exclusions UI text-fields showing the TS-seeded default domain strings. Dispatch UI updates to `update_exclusions` payloads automatically.
- [ ] Add settings controls for reminder preferences, praise preferences, local data export, and diagnostics without duplicating logic decisions in Swift.
- [ ] Form a deeply nested destructive "Delete All Coaching Data" UI flow wired natively to the TS `purge_all` command.
- [ ] Wire `SMAppService` setup correctly for launch-at-login execution.

**Phase 4: Interventions & Clarification HUD**
- [ ] Request `UNUserNotificationCenter` permissions. Map denial states gracefully to an overarching warning flag on the dashboard if permissions are withheld.
- [ ] Push native Local Notifications reacting uniquely to `SystemState.intervention` command flags (e.g., Hard drift, Praise).
- [ ] Register notification categories and deep-link action responses back into the correct app state before forwarding them to TS.
- [ ] Display the "Recovery Anchor" text string (e.g., `"Back. Continue at..."`) directly from TS as is. Under no circumstances rewrite Logic messaging in Swift.
- [ ] Catch dynamic Notification actions explicitly via `Intentional Detour` / `Return Now` and pipe user responses directly downstream back to `POST /command`.
- [ ] Mount a `ClarificationHUD` via an invisible transient `NSPanel`. Unhide this element **only** if the SSE active stream passes a valid `ClarificationViewModel`. Provide simple click-options corresponding to the task scopes and dispatch `resolve_ambiguity` payloads upon selection.
- [ ] Add keyboard shortcuts, accessibility labels, timeout/auto-dismiss behavior, and stale-state handling for the Clarification HUD and notification responses.

**Phase 5: Evening Flow & Review UI**
- [ ] Replicate the Morning Flow setup: Create `EveningDebriefView`, mount the TS-generated debrief payload, provide a `Copy` mechanism. 
- [ ] Add the paste receptacle for ChatGPT's response, run the Paste Sanitizer logic over it, and trigger the evening `import_coaching_exchange` command submission.
- [ ] Show a review/confirmation step explaining what evening data will be stored before final import acceptance.
- [ ] Supply a very simple table UI rendering proposals trapped in `SystemState.dashboard.reviewQueue`. Implement simple Checkbox selection for promoting/rejecting new Durable Rules logic changes.

---

## 3. 🚢 Bringing It All Together (Integration & Release)
*(Complete this only after Slices 1-5 work end to end locally. This merges the Logic application and native Swift wrapper tightly into a single redistributable unit.)*

**Cross-Cutting Quality Test Actions**
- [ ] Compatibility tests: verify macOS JSON deserializers exactly match TS payloads without schema drift breakages.
- [ ] Replay test traces: Mock JSON streams mapping entirely through all 5 machine states utilizing mock 2-tick intervals. 
- [ ] Paste Sanitizer E2E Check: Explicitly feed raw, aggressively-formatted GPT outputs complete with verbose intro greetings, smart quotes, and code blocks into the macOS fields. Confirm Swift properly cleans and the TS regex passes validation cleanly.
- [ ] UX Alignment checks: Enforce that every possible generated notification adheres natively to the TS `messages.ts` text prefix logic (`Check.` / `Locked.` / `Reset.` / `Back.`).
- [ ] Repository tests: verify migration rollback, retention pruning, purge correctness, and bounded busy-retry behavior.
- [ ] Screenpipe adapter tests: verify `/search` parsing, missing-field tolerance, dedupe behavior, exclusion filtering, and frame-context enrichment.
- [ ] Privacy/safety tests: ensure excluded evidence is never persisted in coach DB and confirm no normal runtime or purge action mutates Screenpipe-owned data.
- [ ] UI reconnect/preview tests: cover no-plan, hard-drift, praise, paused, degraded Screenpipe, and reconnect-after-restart states.

**Integration, Packing, & Release Pipeline**
- [ ] Package the Node logic environment cleanly using `esbuild` paired natively with `Node SEA` (Single Executable Application wrapper) compiling to a single file.
- [ ] Embed the generated Node binary resource cleanly inside the Xcode Swift App resources root context. 
- [ ] Structure the macOS Application wrapper lifecycle (`AppDelegate`/`App`) to fire an external process spinning up the embedded TS binary immediately on load. Ensure gracefully triggered `SIGTERM`/`SIGKILL` traps immediately collapse the logic binary explicitly on App termination events. 
- [ ] Pass a dynamic local system port flag dynamically from Swift natively down to the TS binary on app-launch to guarantee 0 conflicts against overlapping local host ports. 
- [ ] Implement first-run permission onboarding for Screen Recording, Accessibility, Notifications, and any optional Screenpipe-related audio permissions that the install depends on.
- [ ] Handle wake-from-sleep, lock/unlock, user-switch, and crash-restart lifecycle events so the bridge and scheduler recover cleanly.
- [ ] **E2E Check**: Open App First Run -> Ensure SQLite auto-seeded 1Password / Banking filters natively into DB.
- [ ] **E2E Check**: Run full Morning GPT exchange -> System properly flips from `no_plan` directly to `running` rendering Green.
- [ ] **E2E Check**: Test Observe-Only period functionality -> Run classifier into Hard Drift intentionally -> Confirm UI UI menu bar updates properly to Red internally, but physically suppresses all native OS notification bells.
- [ ] **E2E Check**: Trigger and resolve Hard Drift intentionally post-grace period -> Assert cooldown flag is raised preventing secondary back-to-back pings. Confirm Recovery Anchor fires upon return. 
- [ ] **E2E Check**: Resolve one ambiguity with "remember this pattern", then replay a similar context and verify the system classifies it better without asking again.
- [ ] **E2E Check**: Run export + purge flows and confirm coach data disappears while Screenpipe data remains untouched.
- [ ] Establish explicit internal Xcode build phases instructing scripts to uniquely code-sign the enclosed Node logic framework prior to the universal outer macOS `.app` envelope receiving an application signature.
- [ ] Upload wrapper entirely through Apple Notarization checks. Test executed App file confirming Network (localhost TS/Screenpipe integration hook) limits functionality persists dynamically.
- [ ] Verify app-update behavior: safe DB migration, bridge-version compatibility checks, and clear release-note callouts when logic behavior materially changes.

---

### Deferred Until After MVP
- [ ] File-based manual memory mirrors (e.g. `MEMORY.md` dumps). V1 leans cleanly entirely on direct SQLite `durable_rules` mapping natively.
- [ ] Advanced artifact mapping (reading from Git branches, export signals, or external document tracking inference hooks natively). 
- [ ] Direct execution natively of Deep/Rich LLM conversation modeling (agent conversational models strictly defer out mapping via raw GPT interface imports internally).
- [ ] RAG execution mapping over raw vectorized retrieval chunk tables (Strictly avoided across MVP timeline implementation scopes).
