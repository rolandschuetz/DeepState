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

---

## 2. 🖥️ Mac Developer To-Do's (UI Layer)
*Tech Stack: Swift, SwiftUI, AppKit, SMAppService, UserNotifications. Keep the Swift App as a "Dumb Terminal" reacting passively to the unified TS stream.*

**Phase 0: App Shell & Unified Bridge Client**
- [ ] Initialize macOS SwiftUI app. Remove dock icon and configure standard entitlements.
- [ ] Define Swift models mapping exactly to the shared JSON `SystemState` schema block, and write test decoders against the TS-generated unit fixtures.
- [ ] Implement `BridgeClient` managing a persistent `URLSession` SSE connection (`GET /stream`) mapping directly to app environment variables.
- [ ] Implement `BridgeClient` single POST dispatcher (`POST /command`) for all outbound data actions.
- [ ] Map the global TS `Mode` to the top-level SwiftUI router wrapper checking for `booting`, `no_plan`, `running`, `paused`, `degraded_screenpipe`, and `logic_error`.
- [ ] Build a small diagnostic UI referencing the `SystemHealthViewModel` detailing Screenpipe/Database connection integrity.

**Phase 1: Paste Sanitizer & Morning Flow**
- [ ] Write a 20-line **Paste Sanitizer** String Extension. This function must catch manual copy/paste sloppiness before submission by automatically stripping markdown code fences (```json), stripping out conversational intro/outro dialogue, and normalizing smart quotes globally into standard quotation marks.
- [ ] Create `MorningFlowView` displaying the read-only morning prompt and `Copy to Clipboard` feature.
- [ ] Add a multiline text area for ChatGPT's response. Run `.pasteSanitize()` on the text content, encapsulate it inside the `import_coaching_exchange` object, and dispatch via `POST /command`.
- [ ] Decode TS parser errors inline cleanly so the user can easily re-edit their payload string.

**Phase 2: Menu Bar Status**
- [ ] Create a minimal `MenuBarExtra` view implementation.
- [ ] Bind icon tint colors natively to the `MenuBarViewModel` state payload logic:
  - `aligned` -> Green
  - `aligned` + `is_support == true` -> Blue
  - `uncertain` / `soft_drift` -> Yellow
  - `hard_drift` -> Red
  - `paused` / `no_plan` / `degraded` -> Gray
- [ ] Render the active task label, timer, and current focus scope within the dropdown.
- [ ] Add "Pause Coaching" and explicit "Take a Break" actions routing unified actions cleanly back to TS.

**Phase 3: Explainability Dashboard & Settings**
- [ ] Build the main dashboard window to track active focus goals/hours remaining against progress percentages.
- [ ] Build the "Why am I seeing this?" accordion section. Note: The UI must **blindly traverse and render** the incoming `{ code, detail, weight }` JSON explainability array passed via `SystemState`. No inferential context evaluation is handled in Swift natively.
- [ ] Build Privacy exclusions UI text-fields showing the TS-seeded default domain strings. Dispatch UI updates to `update_exclusions` payloads automatically.
- [ ] Form a deeply nested destructive "Delete All Coaching Data" UI flow wired natively to the TS `purge_all` command.
- [ ] Wire `SMAppService` setup correctly for launch-at-login execution.

**Phase 4: Interventions & Clarification HUD**
- [ ] Request `UNUserNotificationCenter` permissions. Map denial states gracefully to an overarching warning flag on the dashboard if permissions are withheld.
- [ ] Push native Local Notifications reacting uniquely to `SystemState.intervention` command flags (e.g., Hard drift, Praise).
- [ ] Display the "Recovery Anchor" text string (e.g., `"Back. Continue at..."`) directly from TS as is. Under no circumstances rewrite Logic messaging in Swift.
- [ ] Catch dynamic Notification actions explicitly via `Intentional Detour` / `Return Now` and pipe user responses directly downstream back to `POST /command`.
- [ ] Mount a `ClarificationHUD` via an invisible transient `NSPanel`. Unhide this element **only** if the SSE active stream passes a valid `ClarificationViewModel`. Provide simple click-options corresponding to the task scopes and dispatch `resolve_ambiguity` payloads upon selection.

**Phase 5: Evening Flow & Review UI**
- [ ] Replicate the Morning Flow setup: Create `EveningDebriefView`, mount the TS-generated debrief payload, provide a `Copy` mechanism. 
- [ ] Add the paste receptacle for ChatGPT's response, run the Paste Sanitizer logic over it, and trigger the evening `import_coaching_exchange` command submission.
- [ ] Supply a very simple table UI rendering proposals trapped in `SystemState.dashboard.reviewQueue`. Implement simple Checkbox selection for promoting/rejecting new Durable Rules logic changes.

---

## 3. 🚢 Bringing It All Together (Integration & Release)
*(Complete this only after Slices 1-5 work end to end locally. This merges the Logic application and native Swift wrapper tightly into a single redistributable unit.)*

**Cross-Cutting Quality Test Actions**
- [ ] Compatibility tests: verify macOS JSON deserializers exactly match TS payloads without schema drift breakages.
- [ ] Replay test traces: Mock JSON streams mapping entirely through all 5 machine states utilizing mock 2-tick intervals. 
- [ ] Paste Sanitizer E2E Check: Explicitly feed raw, aggressively-formatted GPT outputs complete with verbose intro greetings, smart quotes, and code blocks into the macOS fields. Confirm Swift properly cleans and the TS regex passes validation cleanly.
- [ ] UX Alignment checks: Enforce that every possible generated notification adheres natively to the TS `messages.ts` text prefix logic (`Check.` / `Locked.` / `Reset.` / `Back.`).

**Integration, Packing, & Release Pipeline**
- [ ] Package the Node logic environment cleanly using `esbuild` paired natively with `Node SEA` (Single Executable Application wrapper) compiling to a single file.
- [ ] Embed the generated Node binary resource cleanly inside the Xcode Swift App resources root context. 
- [ ] Structure the macOS Application wrapper lifecycle (`AppDelegate`/`App`) to fire an external process spinning up the embedded TS binary immediately on load. Ensure gracefully triggered `SIGTERM`/`SIGKILL` traps immediately collapse the logic binary explicitly on App termination events. 
- [ ] Pass a dynamic local system port flag dynamically from Swift natively down to the TS binary on app-launch to guarantee 0 conflicts against overlapping local host ports. 
- [ ] **E2E Check**: Open App First Run -> Ensure SQLite auto-seeded 1Password / Banking filters natively into DB.
- [ ] **E2E Check**: Run full Morning GPT exchange -> System properly flips from `no_plan` directly to `running` rendering Green.
- [ ] **E2E Check**: Test Observe-Only period functionality -> Run classifier into Hard Drift intentionally -> Confirm UI UI menu bar updates properly to Red internally, but physically suppresses all native OS notification bells.
- [ ] **E2E Check**: Trigger and resolve Hard Drift intentionally post-grace period -> Assert cooldown flag is raised preventing secondary back-to-back pings. Confirm Recovery Anchor fires upon return. 
- [ ] Establish explicit internal Xcode build phases instructing scripts to uniquely code-sign the enclosed Node logic framework prior to the universal outer macOS `.app` envelope receiving an application signature.
- [ ] Upload wrapper entirely through Apple Notarization checks. Test executed App file confirming Network (localhost TS/Screenpipe integration hook) limits functionality persists dynamically.

---

### Deferred Until After MVP
- [ ] File-based manual memory mirrors (e.g. `MEMORY.md` dumps). V1 leans cleanly entirely on direct SQLite `durable_rules` mapping natively.
- [ ] Advanced artifact mapping (reading from Git branches, export signals, or external document tracking inference hooks natively). 
- [ ] Direct execution natively of Deep/Rich LLM conversation modeling (agent conversational models strictly defer out mapping via raw GPT interface imports internally).
- [ ] RAG execution mapping over raw vectorized retrieval chunk tables (Strictly avoided across MVP timeline implementation scopes).