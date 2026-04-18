By architecting the software with a strict boundary—**the headless TypeScript layer holds all the logic and memory, while the macOS UI is purely a dumb rendering shell**—both developers can largely work in parallel once Phase 1 (Bridge Contracts) is complete. 

---

## 1. 🧠 TypeScript Developer To-Do's (Logic Layer)
*Tech Stack: Node.js, TypeScript, Zod, better-sqlite3. Use local AI only for bounded, non-critical helpers. Design rule: fully deterministic by default. All system loops respect the top-level mode gate and run on exactly two unified timers (Fast Tick & Slow Tick).*

**Phase 0: Contracts, Fixtures, and Health**
- [ ] Initialize `logic/` Node+TS project with strict mode and `vitest`.
- [ ] Define core Zod schemas for domain primitives (`Timestamp`, `Confidence`, `HealthStatus`).
- [ ] Define rigid top-level `Mode` enum: `booting | no_plan | running | paused | degraded_screenpipe | logic_error`.
- [ ] Define simplified 5-state runtime state enum: `aligned | uncertain | soft_drift | hard_drift | paused`. 
- [ ] Add companion flags to the classification: `is_support: boolean` (e.g. support work is just `aligned` + `is_support: true`).
- [ ] Define a single outbound `SystemState` schema for the `GET /stream` endpoint containing: `schema_version`, `mode`, `menu_bar`, `dashboard`, `clarification_hud`, `intervention`, and `system_health`.
- [ ] Define a single inbound `Command` schema for `POST /command` using a type discriminator: `pause`, `resume`, `update_exclusions`, `resolve_ambiguity`, `import_coaching_exchange`, `notification_action`, `purge_all`.
- [ ] Define unified `CoachingExchange` import schema with an `exchange_type: "morning_plan" | "evening_debrief"` discriminator and an explicit `schema_version` field.
- [ ] Create JSON fixture payloads and golden tests for all inbound/outbound contracts so Swift validates against the same examples.
- [ ] Set up HTTP server scaffolding with `GET /stream` (SSE) and `POST /command`. Keep `/health` and `/diagnostics` for internal probes only.
- [ ] Create a central mode gate utility so classification, intervention, and progress logic evaluate **only** if `mode === "running"`.

**Phase 1: Persistence & Canonical Memory (2 Layers)**
- [ ] Set up `better-sqlite3`. Enable `WAL` journal mode and `busy_timeout`.
- [ ] Write a lightweight schema migration runner with explicit versioning.
- [ ] Base migrations: `app_settings` (including a field for `observe_only_ticks_remaining`), `privacy_exclusions`, and `runtime_health_events`.
- [ ] Planning migrations: `daily_plans`, `goal_contracts`, `task_contracts`.
- [ ] Observation migrations: `observations`, `context_windows`, `episodes`, `classifications`.
- [ ] Add a `JSON` column to the `classifications` table named `explainability` to dynamically store arrays of `{ code, detail, weight }`.
- [ ] Learning migrations (reduced for MVP): `daily_memory_notes` (Daily Memory layer) and `durable_rules` (Long-term rules layer for user-confirmed patterns). *Drop vector retrieval indices for V1.* 
- [ ] Implement `SettingsRepo`, `DailyPlanRepo`, `PrivacyExclusionsRepo`, and `ClassificationRepo` with CRUD methods.
- [ ] Implement startup rule: if there is no imported daily plan to load, system top-level state enters `no_plan` mode; engines idle automatically.
- [ ] Implement default privacy exclusions preset: upon first boot, automatically seed the `privacy_exclusions` table with standard regex patterns for password managers (1Password, Keychain) and common banking/checkout domains.

**Phase 2: Screenpipe Ingestion & Privacy Filtering**
- [ ] Implement Screenpipe HTTP client with a `/health` probe and degraded-mode detection (sets `mode = "degraded_screenpipe"`).
- [ ] Implement Screenpipe `/search` polling adapter with overlap and deduplication.
- [ ] Implement `EvidenceNormalizer` to map raw Screenpipe records into an app-owned evidence schema.
- [ ] Implement `PrivacyFilter` so excluded apps/domains are completely dropped before logic checks; only minimal audit counters may remain.
- [ ] Implement `ContextAggregator` to roll raw events into contiguous 90s `ContextWindow`s.
- [ ] Add replay fixtures for normalized evidence to test classification offline.

**Phase 3: Morning Flow Export & Unified JSON Import**
- [ ] Implement `MorningContextPacketBuilder` using yesterday carry-over context plus durable rules safe to surface.
- [ ] Implement `MorningPromptGenerator` as a copy-paste prompt instructing ChatGPT explicitly to return **strict schema-versioned JSON only** (no markdown text outside the JSON).
- [ ] Implement `CoachingExchangeParser` handling the unified import payload. Branch to `exchange_type === "morning_plan"`.
- [ ] Add explicit validation errors for malformed JSON, missing fields, or unsupported schema versions.
- [ ] Implement import service to save validated plan data into `daily_plans`, immediately transition `mode` to `running`, and push the SSE state block.

**Phase 4: Classification, State Machine & Recovery Anchor**
- [ ] Implement deterministic rules evaluating evidence against today's declared tasks.
- [ ] Back all evaluation checks into an `{ code, detail, weight }` format stored to the `explainability` JSON array on the classification output.
- [ ] Implement hysteresis rules to require sustained evidence across multiple ticks before triggering a state change.
- [ ] Implement retrieval of recent answers from SQLite `durable_rules` before triggering LLM-assisted ambiguity requests.
- [ ] Implement the **Recovery Anchor**: cache the `last_good_context` string (e.g., active window title/URL) locally whenever the state is high-confidence `aligned`.
- [ ] Implement `pause` command handling to halt classifier evaluations and emit `mode = "paused"` into the stream immediately.
- [ ] Add replay tests verifying required state transitions (e.g. aligned -> soft drift -> recovery; aligned -> hard drift).

**Phase 5: Progress, Explainability & Message Discipline**
- [ ] Implement `EpisodeBuilder` to roll `ContextWindow`s up into 3-5 minute block episodes.
- [ ] Implement V1 goal matching: associate aligned/supporting block time to declared tasks/hours with a confidence rating.
- [ ] Implement `ExplainabilityGenerator` that references internal reason codes and spits out 2-3 human-readable bullets into the `classifications.explainability` field.
- [ ] Create a centralized `messages.ts` dictionary mapped to states. Hardcode positive reinforcement NLP prefixes strictly (`Locked.`, `Check.`, `Reset.`, `Back.`). No inline UI text is allowed elsewhere in the domain core.
- [ ] Implement `InterventionEngine`: stays entirely silent on soft-drift; emits redirect notification candidate on sustained hard-drift.
- [ ] Implement cooldown tracking: no hard-drift notification can repeat within a rolling 15-minute gap.
- [ ] Implement "Observe-Only" Grace Period: for the first 50-100 ticks of a new installation, calculate the engine normally (updates UI colors), but actively mute the system from emitting native push notifications.
- [ ] Unpack the Recovery Anchor: Upon exiting `hard_drift`, fetch `last_good_context` and emit a structured intervention via `messages.ts` (e.g., `"Back. Continue at [Figma - Checkout Design]."`).

**Phase 6: Evening Flow & Reviewable Learning**
- [ ] Implement `EveningDebriefPacketBuilder` stringing together plans, episodes, drift blocks, pauses, and overrides.
- [ ] Reuse `ExplainabilityGenerator` to automatically append 2-3 concrete evidence bullets to every task episode within the export packet to supply the LLM with hard facts.
- [ ] Implement `EveningPromptGenerator` instructing ChatGPT to spit back **strict JSON only**.
- [ ] Branch `CoachingExchangeParser` for `exchange_type === "evening_debrief"`.
- [ ] Parse imported structured debriefs in SQLite `daily_memory_notes`.
- [ ] Implement a review queue for candidate durable rule updates. (Rules must be user-confirmed to pass to `durable_rules`).

**Phase 7: Ambiguity Resolution & Praise**
- [ ] Implement stable ambiguity detection so clarification is required only after prolonged sustained uncertainty.
- [ ] Implement `resolve_ambiguity` command logic: apply manual override string, record labeled example, and optionally add it to `durable_rules`.
- [ ] Implement praise eligibility: an uninterrupted `aligned` streak longer than 25 minutes. Gated strictly behind the observe-only grace period.
- [ ] Generate praise text strictly using `messages.ts` templates (`Locked.` prefix). Cap at max 1 praise per focus block.

**Phase 8: Two-Tick Scheduler, Diagnostics, and Maintenance**
- [ ] Implement the simplified master scheduler:
  - **Fast Tick (15s)**: Ingest observations, normalize, apply privacy filters, build raw windows.
  - **Slow Tick (90s)**: Classify state, evaluate progress, govern interventions, and emit payload to `GET /stream`.
- [ ] Drop the MVP 3-minute progress tick entirely; bundle progress logic directly into the 90s Slow Tick loop.
- [ ] Implement SQLite compaction scheduling to preserve review/audit data safely for user trust.
- [ ] Implement `purge_all` command handler to dump app-owned data schemas seamlessly without destroying the underlying Screenpipe local server.