By architecting the software with a strict boundary—**the headless TypeScript layer holds all the logic and memory, while the macOS UI is purely a dumb rendering shell**—both developers can largely work in parallel once Phase 1 (Bridge Contracts) is complete. 

---

## 1. 🧠 TypeScript Developer To-Do's (Logic Layer)
*Tech Stack: Node.js, TypeScript, Zod, better-sqlite3. Use local AI only for bounded, non-critical helpers. Design rule: fully deterministic by default. All system loops respect the top-level mode gate and run on exactly two unified timers (Fast Tick & Slow Tick).*

**Phase 0: Contracts, Fixtures, and Health**
- [x] Initialize `logic/` Node+TS project with strict mode and `vitest`.
- [x] Create companion workspace folders for `shared-contracts/`, `fixtures/`, and `scripts/` so schemas, sample payloads, and migration/test helpers stay versioned outside UI-specific code.
- [x] Define core Zod schemas for domain primitives (`Timestamp`, `Confidence`, `HealthStatus`).
- [x] Define rigid top-level `Mode` enum: `booting | no_plan | running | paused | degraded_screenpipe | logic_error`.
- [x] Define simplified 5-state runtime state enum: `aligned | uncertain | soft_drift | hard_drift | paused`. 
- [x] Add companion flags to the classification: `is_support: boolean` (e.g. support work is just `aligned` + `is_support: true`).
- [x] Define a single outbound `SystemState` schema for the `GET /stream` endpoint containing: `schema_version`, `mode`, `menu_bar`, `dashboard`, `clarification_hud`, `intervention`, and `system_health`.
- [x] Define a single inbound `Command` schema for `POST /command` using a type discriminator: `pause`, `resume`, `update_exclusions`, `resolve_ambiguity`, `import_coaching_exchange`, `notification_action`, `purge_all`.
- [x] Define unified `CoachingExchange` import schema with an `exchange_type: "morning_plan" | "evening_debrief"` discriminator and an explicit `schema_version` field.
- [x] Create JSON fixture payloads and golden tests for all inbound/outbound contracts so Swift validates against the same examples.
- [x] Emit JSON Schema snapshots for bridge payloads and import payloads so contract drift is catchable in CI.
- [x] Set up HTTP server scaffolding with `GET /stream` (SSE) and `POST /command`. Keep `/health` and `/diagnostics` for internal probes only.
- [x] Add correlation IDs and typed action result envelopes (`success`, `validation_error`, `retryable_failure`, `fatal_failure`) for async command flows.
- [x] Create a central mode gate utility so classification, intervention, and progress logic evaluate **only** if `mode === "running"`.
- [x] Implement runtime config loading for DB path, Screenpipe base URL, health timeouts, log level, and feature flags.
- [x] Add structured module-scoped diagnostics/logging (`scheduler`, `screenpipe`, `classifier`, `intervention`, `import`, `memory`) to support the future debug panel.

**Phase 1: Persistence & Canonical Memory (2 Layers)**
- [x] Set up `better-sqlite3`. Enable `WAL` journal mode and `busy_timeout`.
- [x] Write a lightweight schema migration runner with explicit versioning.
- [x] Add migration guard rails: idempotent startup runner, migration lock/guard, rollback handling for failed migrations, and a smoke-test fixture database.
- [x] Base migrations: `app_settings` (including a field for `observe_only_ticks_remaining`), `privacy_exclusions`, and `runtime_health_events`.
- [x] Planning migrations: `daily_plans`, `goal_contracts`, `task_contracts`, `focus_blocks`, and `import_audit_log`.
- [x] Observation migrations: `observations`, `context_windows`, `episodes`, `classifications`, `progress_estimates`, `interventions`, and `intervention_outcomes`.
- [x] Add a `JSON` column to the `classifications` table named `explainability` to dynamically store arrays of `{ code, detail, weight }`.
- [x] Learning migrations (reduced for MVP): `daily_memory_notes` (Daily Memory layer), `durable_rules` (Long-term rules layer for user-confirmed patterns), `user_corrections`, `signal_weights`, and `rule_proposals`. *Drop vector retrieval indices for V1.* 
- [x] Implement `SettingsRepo`, `DailyPlanRepo`, `TaskRepo`, `FocusBlockRepo`, `ObservationRepo`, `EpisodeRepo`, `ClassificationRepo`, `ProgressRepo`, `InterventionRepo`, `CorrectionRepo`, `MemoryRepo`, `RuleProposalRepo`, and `PrivacyExclusionsRepo` with CRUD methods.
- [x] Implement startup rule: if there is no imported daily plan to load, system top-level state enters `no_plan` mode; engines idle automatically.
- [x] Implement default privacy exclusions preset: upon first boot, automatically seed the `privacy_exclusions` table with standard regex patterns for password managers (1Password, Keychain) and common banking/checkout domains.
- [x] Keep transactions short, expose an explicit WAL checkpoint hook for maintenance, and implement bounded retry/backoff for transient `SQLITE_BUSY` cases.
- [x] Add compact retention rules: keep Screenpipe refs instead of duplicated media, prune stale intermediate windows, and let the user tune retention duration later through settings.
- [x] Implement local data export as JSON and/or SQLite backup, and ensure `purge_all` also clears reviewable rule proposals and other app-owned derived caches without mutating Screenpipe data.

**Phase 2: Screenpipe Ingestion & Privacy Filtering**
- [x] Implement Screenpipe HTTP client with a `/health` probe and degraded-mode detection (sets `mode = "degraded_screenpipe"`).
- [x] Detect Screenpipe capabilities at startup (`/elements`, `/frames/{id}/context`, audio transcript availability, exposed version if present) and record them in diagnostics.
- [x] Implement Screenpipe `/search` polling adapter with overlap and deduplication.
- [x] Track the last successful ingest timestamp, normalize all inbound timestamps to UTC, and ignore windows outside the retention/lookback policy.
- [x] Implement `EvidenceNormalizer` to map raw Screenpipe records into an app-owned evidence schema.
- [x] Canonicalize app identifiers, sanitize window titles, normalize URLs into host/path tokens, summarize input activity, and attach Screenpipe refs for explainability drill-down.
- [x] Implement `PrivacyFilter` so excluded apps/domains are completely dropped before logic checks; only minimal audit counters may remain.
- [x] Redact protected text fragments before persistence, drop private/incognito contexts when detectable, and never store excluded evidence in the coach DB.
- [x] Implement `ContextAggregator` to roll raw events into contiguous 90s `ContextWindow`s.
- [x] Preserve short sequence context around each window (`what came before`, `what followed`, dwell duration) so valid support work is classifiable.
- [x] Tag likely meeting contexts from conferencing apps, audio-heavy low-typing periods, and available meeting titles/collaborator hints.
- [x] Add replay fixtures for normalized evidence to test classification offline.
- [x] Handle adapter edge cases explicitly: partial Screenpipe results, missing frame context, overlapping duplicate polls, and slow queries that exceed the scheduler budget.

**Phase 3: Morning Flow Export & Unified JSON Import**
- [x] Trigger the morning flow on first notebook open after 4am of the day, plus manual "Start My Day" / manual plan reset paths.
- [x] Implement `MorningContextPacketBuilder` using yesterday carry-over context plus durable rules safe to surface.
- [x] Include unresolved ambiguities, yesterday debrief outcomes, and manually declared meetings/open questions in the morning context packet when available.
- [x] Implement `MorningPromptGenerator` as a copy-paste prompt instructing ChatGPT explicitly to return **strict schema-versioned JSON only** (no markdown text outside the JSON).
- [x] Implement `CoachingExchangeParser` handling the unified import payload. Branch to `exchange_type === "morning_plan"`.
- [x] Add explicit validation errors for malformed JSON, missing fields, or unsupported schema versions.
- [x] Reject transcript-like freeform payloads, validate 1-3 tasks, validate intended hours and success definitions, and validate the structure of allowed support work/detours.
- [x] Implement import service to save validated plan data into `daily_plans`, immediately transition `mode` to `running`, and push the SSE state block.
- [x] Persist `goal_contracts`, `task_contracts`, optional `focus_blocks`, initialize progress baselines, and append an `import_audit_log` record for every accepted import.
- [x] Support safe midday re-import / plan reset flows without corrupting the active day's observation history.

**Phase 4: Classification, State Machine & Recovery Anchor**
- [x] Implement deterministic rules evaluating evidence against today's declared tasks.
- [x] Add weighted evidence scoring on top of deterministic matches using recency, novelty penalties, contradiction penalties, and confidence floor/ceiling rules.
- [x] Back all evaluation checks into an `{ code, detail, weight }` format stored to the `explainability` JSON array on the classification output.
- [x] Implement hysteresis rules to require sustained evidence across multiple ticks before triggering a state change.
- [x] Implement retrieval of recent answers from SQLite `durable_rules` before triggering LLM-assisted ambiguity requests.
- [x] Gate local AI fallback strictly: only run it when rules, scoring, and retrieval remain ambiguous; pass compact evidence only; require strict structured output; never let model output directly trigger notifications.
- [x] Implement the **Recovery Anchor**: cache the `last_good_context` string (e.g., active window title/URL) locally whenever the state is high-confidence `aligned`.
- [x] Implement `pause` command handling to halt classifier evaluations and emit `mode = "paused"` into the stream immediately.
- [x] Suppress ambiguity prompts during pause, lock/sleep wake churn, and active cooldown windows so the classifier does not teach at noisy boundaries.
- [x] Add a final intervention gate that checks pause state, cooldown state, notification permission, and whether a better intervention is already pending before surfacing any prompt.
- [x] Add replay tests verifying required state transitions (e.g. aligned -> soft drift -> recovery; aligned -> hard drift).

**Phase 5: Progress, Explainability & Message Discipline**
- [x] Implement `EpisodeBuilder` to roll `ContextWindow`s up into 3-5 minute block episodes.
- [x] Implement V1 goal matching: associate aligned/supporting block time to declared tasks/hours with a confidence rating.
- [x] Persist `progress_estimates`, `interventions`, and `intervention_outcomes` so progress, prompts, and user responses are reviewable later.
- [x] Add progress risk detection for behind-pace work, repeated ambiguity on one goal, excessive support work, and heavy context switching during a critical block.
- [x] Implement `ExplainabilityGenerator` that references internal reason codes and spits out 2-3 human-readable bullets into the `classifications.explainability` field.
- [x] Include confidence rationale and a short "what would change this decision" debugging hint in the explainability payload for diagnostics surfaces.
- [x] Create a centralized `messages.ts` dictionary mapped to states. Hardcode positive reinforcement NLP prefixes strictly (`Locked.`, `Check.`, `Reset.`, `Back.`). No inline UI text is allowed elsewhere in the domain core.
- [x] Implement `InterventionEngine`: stays entirely silent on soft-drift; emits redirect notification candidate on sustained hard-drift.
- [x] Implement cooldown tracking: no hard-drift notification can repeat within a rolling 15-minute gap.
- [x] Implement "Observe-Only" Grace Period: for the first 50-100 ticks of a new installation, calculate the engine normally (updates UI colors), but actively mute the system from emitting native push notifications.
- [x] Unpack the Recovery Anchor: Upon exiting `hard_drift`, fetch `last_good_context` and emit a structured intervention via `messages.ts` (e.g., `"Back. Continue at [Figma - Checkout Design]."`).
- [x] Infer milestone-completion candidates from artifact/time evidence and surface them as confirm/dismiss actions only when confidence is strong enough.

**Phase 6: Evening Flow & Reviewable Learning**
- [x] Implement `EveningDebriefPacketBuilder` stringing together plans, episodes, drift blocks, pauses, and overrides.
- [x] Include progress signals, estimate-vs-actual effort, unresolved ambiguities, and suggested learning candidates in the debrief packet.
- [x] Reuse `ExplainabilityGenerator` to automatically append 2-3 concrete evidence bullets to every task episode within the export packet to supply the LLM with hard facts.
- [x] Implement `EveningPromptGenerator` instructing ChatGPT to spit back **strict JSON only**.
- [x] Branch `CoachingExchangeParser` for `exchange_type === "evening_debrief"`.
- [x] Parse clarified task boundaries, corrected ambiguity labels, candidate durable memories, tomorrow suggestions, and milestone relevance from valid evening imports.
- [x] Parse imported structured debriefs in SQLite `daily_memory_notes`.
- [x] Implement a review queue for candidate durable rule updates. (Rules must be user-confirmed to pass to `durable_rules`).
- [x] Convert accepted evening imports into `DailyMemoryNote`, `RuleProposal`, and reviewable durable-memory candidates without auto-promoting speculative text into truth.

**Phase 7: Ambiguity Resolution & Praise**
- [x] Implement stable ambiguity detection so clarification is required only after prolonged sustained uncertainty.
- [x] Implement `resolve_ambiguity` command logic: apply manual override string, record labeled example, and optionally add it to `durable_rules`.
- [x] Support a "remember this pattern" path that stores validated task/support-work mappings without overfitting one-off contexts.
- [x] Track signal-weight updates from corrections and outcomes: reward correct predictions, penalize false positives/false negatives, and decay stale weights over time.
- [x] Store durable-rule provenance fields (`source`, `confidence`, `recency`, `last_validated_at`) so promoted rules remain inspectable and reviewable.
- [x] Implement praise eligibility: an uninterrupted `aligned` streak longer than 25 minutes. Gated strictly behind the observe-only grace period.
- [x] Generate praise text strictly using `messages.ts` templates (`Locked.` prefix). Cap at max 1 praise per focus block.

**Phase 8: Two-Tick Scheduler, Diagnostics, and Maintenance**
- [x] Implement bootstrap order explicitly: load config, open DB, run migrations, load durable memory/preferences, probe Screenpipe, start bridge server, start scheduler, and publish initial state.
- [x] Implement the simplified master scheduler:
  - **Fast Tick (15s)**: Ingest observations, normalize, apply privacy filters, build raw windows.
  - **Slow Tick (90s)**: Classify state, evaluate progress, govern interventions, and emit payload to `GET /stream`.
- [x] Drop the MVP 3-minute progress tick entirely; bundle progress logic directly into the 90s Slow Tick loop.
- [x] Add event-driven refresh paths on menu bar open, morning/evening import completion, ambiguity resolution, and unpause so the user is not forced to wait for the next slow tick.
- [x] Implement app-wide health checks for Screenpipe, DB, bridge, and optional local-AI availability, and record recovery events when critical dependencies return.
- [x] Encode degraded behavior explicitly: Screenpipe failure disables autonomous classification/interventions but keeps plan review/manual actions available; DB busy states keep the last good state in memory and surface warnings.
- [x] Implement SQLite compaction scheduling to preserve review/audit data safely for user trust.
- [x] Implement `purge_all` command handler to dump app-owned data schemas seamlessly without destroying the underlying Screenpipe local server.
