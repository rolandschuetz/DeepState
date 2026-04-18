# Decomposition Tree v2: Autonomous Focus Coach

This document expands `docs/DecompositionTree-v1.md` into a much more implementation-ready tree. It keeps the same core architecture, but breaks the product down into delivery-sized branches, concrete contracts, software choices, operational concerns, and edge cases.

The product remains defined by four non-negotiable constraints:

1. The UI is extremely dumb.
2. The logic layer is the product brain and must run headless.
3. Screenpipe is the sensing layer, not the decision layer.
4. The canonical product memory lives in the app's own SQLite database.

---

## 0. How To Read This Tree

- Each numbered node is a deliverable branch, not just a concept.
- Lower levels should map to packages, modules, tables, APIs, tests, or UI surfaces.
- If a leaf cannot be assigned to a team member, test suite, or milestone, it is still too vague.
- "V1-first" means the feature should exist in the first shippable version.
- "Later" means the node is architected now but can ship after the first stable release.

---

## 1. Research-Backed Implementation Choices

These choices are based on the current public docs for Screenpipe, Apple platform APIs, SQLite, Ollama, Zod, and `better-sqlite3`.

### 1.1 Recommended Software Stack

- `Logic runtime`: `TypeScript + Node.js`
  - Aligns with the architecture docs and keeps domain logic portable, testable, and independent from Swift UI concerns.
- `Boundary validation`: `Zod 4`
  - Use one schema source for persistence boundaries, UI bridge payloads, and AI structured outputs.
- `Logic database`: `SQLite + better-sqlite3`
  - Best fit for local-first, single-user, high-read, moderate-write desktop behavior.
- `SQLite journaling mode`: `WAL`
  - Chosen for read/write concurrency and better behavior under concurrent reads.
- `macOS UI`: `SwiftUI MenuBarExtra` with selective `AppKit` panels/popovers where SwiftUI alone is too rigid.
- `Login/background startup`: `SMAppService`
  - Preferred Apple path for login items / helper executables on current macOS.
- `Notifications`: `UserNotifications` framework
  - For sparse local reminders, praise, and quick action buttons.
- `Screenpipe integration`: use documented REST endpoints first
  - `/search`, `/elements`, `/frames/{id}/context`, `/health`, and direct references to Screenpipe frame IDs.
- `Local AI`: `Ollama` behind a small adapter
  - Strictly optional in the hot path, used only after deterministic and retrieval steps fail.
- `Embeddings`: Ollama embedding endpoint for local retrieval over labeled corrections and durable memories.

### 1.2 Why These Choices Fit The Product

- `MenuBarExtra` is a direct fit for a glanceable, always-available coaching surface.
- `SMAppService` is a direct fit for "launch at login" and helper orchestration.
- `UserNotifications` are appropriate for sparse, high-value nudges, but they must not be the only state surface because delivery is not guaranteed.
- Screenpipe's docs emphasize event-driven capture, accessibility extraction, OCR fallback, local SQLite storage, and REST endpoints. That makes it a strong input layer and a weak place to host product-specific judgment.
- Screenpipe pipes are scheduled AI agents, run one at a time, and their lookback is derived from the schedule interval. That makes them good for batch jobs, but the wrong home for the always-on focus state machine.
- SQLite WAL is faster in many scenarios and allows readers and writers to proceed concurrently, but the docs still note `SQLITE_BUSY` can happen. The app must explicitly handle busy timeouts, checkpoints, and retry semantics.
- Zod 4 can emit JSON Schema, which is useful for sharing exact shapes with Ollama structured outputs and bridge payload contracts. But unrepresentable types and transforms mean bridge schemas should stay plain.
- Ollama supports structured outputs via the `format` field and local embeddings via `/api/embed`, which matches the product requirement to keep AI bounded, local, and schema-constrained.

### 1.3 Software Choice Edge Cases

- `Screenpipe API contract drift`
  - Inference from the docs: different pages describe slightly different `content_type` values and emphasis areas.
  - Implementation response: isolate Screenpipe parsing behind one adapter and contract-test against the installed Screenpipe version.
- `Screenpipe missing or unhealthy`
  - The product must degrade to plan review, manual mode, and pause mode rather than pretending observation still works.
- `SQLite under concurrency`
  - WAL helps, but long transactions, compaction jobs, or large imports can still block.
- `Notification delivery`
  - Notifications are advisory. The canonical state must still be visible in the menu bar and dashboard.
- `Zod to JSON Schema gaps`
  - Avoid transformed, custom, date-heavy, or opaque schemas at the bridge/AI boundary.
- `Ollama cold start or model absence`
  - The app must function without any model available; AI is not allowed to be a runtime hard dependency.

---

## 2. Core Architectural Boundaries

### 2.1 UI Layer Must Not

- Read or write the app SQLite database directly.
- Query Screenpipe directly.
- Classify activity.
- Decide whether the user is on task.
- Estimate goal progress.
- Decide whether to interrupt.
- Manage hysteresis, cooldowns, or praise schedules.
- Generate canonical prompt payloads or parse imported structured responses.

### 2.2 UI Layer Only

- Render `ViewModel` payloads received from the bridge.
- Capture user intent as `UserAction` payloads.
- Show macOS-native surfaces:
  - menu bar
  - popovers
  - HUD panels
  - notifications
  - settings
  - import/export screens
- Cache minimal display state required for smooth rendering.

### 2.3 Logic Layer Must Not

- Import `SwiftUI`, `AppKit`, or macOS view classes.
- Know about menu bar layout details.
- Assume any given UI is currently open.
- Block the runtime loop waiting for the user to answer.
- Depend on Screenpipe-specific transport quirks outside adapters.

### 2.4 Logic Layer Only

- Own all business rules.
- Own all persistence schemas and migrations.
- Own planning imports/exports.
- Own evidence aggregation and episode building.
- Own classification, goal matching, progress estimation, and decision policy.
- Own learning, memory promotion, and explainability text generation.
- Emit bridge-safe state snapshots and commands.

### 2.5 Canonical Data Ownership

- `Screenpipe DB`
  - transient sensing memory
  - raw OCR/accessibility/audio/UI-event evidence
  - frame and element references
- `Coach DB`
  - canonical product truth
  - tasks, plans, episodes, classifications, interventions, corrections, preferences, memory, learning state
- `UI local cache`
  - disposable rendering cache only
  - no product truth

### 2.6 Determinism Before AI

- Decision order must always be:
  1. privacy filter
  2. deterministic rules
  3. weighted scoring
  4. retrieval from labeled history
  5. local AI fallback
  6. user clarification
- If the system skips a cheaper prior layer, that is a bug unless explicitly justified in code comments and tests.

---

## 3. Program Foundation And Repo Structure

### 3.1 Workspace Layout

- `docs/`
  - source of truth for product scope, decomposition, architecture, and stories
- `logic/`
  - headless TypeScript process
- `macos/`
  - SwiftUI/AppKit shell
- `shared-contracts/`
  - JSON Schema / Zod-derived bridge contracts
- `fixtures/`
  - Screenpipe evidence samples, import samples, correction samples
- `scripts/`
  - local setup, test harnesses, migration utilities

### 3.2 Contract Ownership

- The logic layer owns the shape of:
  - `ViewModels`
  - `UserActions`
  - import/export payloads
  - AI response schemas
- The UI consumes generated contracts and must not invent parallel types.

### 3.3 Environment Configuration

- app database path
- Screenpipe base URL
- Screenpipe health timeout
- polling interval
- aggregation interval
- episode length defaults
- local AI enabled flag
- Ollama base URL
- log level
- privacy exclusions defaults
- feature flags

### 3.4 Logging And Diagnostics

- structured logs in logic layer
- per-module log context:
  - scheduler
  - screenpipe adapter
  - classifier
  - intervention engine
  - import parser
  - memory curation
- UI-side diagnostic log only for:
  - bridge connection
  - notification responses
  - rendering failures
- user-facing debug panel for:
  - current status
  - last evidence window
  - last classification reason
  - Screenpipe health
  - last model fallback invocation

### 3.5 Feature Flags

- `morning_flow_enabled`
- `evening_flow_enabled`
- `local_ai_enabled`
- `ambiguity_hud_enabled`
- `praise_enabled`
- `milestone_detection_enabled`
- `nightly_compaction_enabled`
- `advanced_memory_review_enabled`

---

## 4. Logic Layer Process

### 4.1 Process Bootstrap

- load config
- open database
- run migrations
- load durable memory and user preferences
- perform Screenpipe health probe
- start bridge server
- start scheduler
- publish initial app state

### 4.2 Scheduler Engine

- `fast ingest tick`
  - default `10-15s`
  - fetch new evidence windows
- `focus classification tick`
  - default `60-90s`
  - update current state
- `progress estimation tick`
  - default `3m`
  - roll short windows into episodes
- `slow maintenance tick`
  - refresh caches, compact logs, checkpoint DB if needed
- `manual refresh tick`
  - triggered by user opening menu bar, importing plan, resolving ambiguity, or unpausing

### 4.3 Lifecycle States

- `booting`
- `healthy`
- `degraded_screenpipe_unavailable`
- `degraded_db_issue`
- `paused`
- `idle`
- `sleeping`
- `quitting`

### 4.4 Health Model

- health check Screenpipe
- health check DB
- health check bridge
- optional health check Ollama
- emit app-wide degraded status when any critical dependency fails
- record recovery events when the system returns to healthy mode

### 4.5 Degraded Mode Behavior

- if Screenpipe fails:
  - stop autonomous classification
  - stop intervention generation
  - keep plan review UI available
  - allow manual pause and manual note entry
- if DB is temporarily busy:
  - retry writes with bounded backoff
  - keep current state in memory
  - surface non-fatal warning
- if Ollama is unavailable:
  - skip local AI fallback
  - widen uncertainty band
  - prefer silence or brief clarification

---

## 5. Domain Model

### 5.1 Shared Primitives

- `TaskId`
- `GoalId`
- `FocusBlockId`
- `EpisodeId`
- `ClassificationId`
- `InterventionId`
- `MemoryItemId`
- `Timestamp`
- `DurationSeconds`
- `Confidence`
- `ReasonCode`
- `EvidenceRef`

### 5.2 Planning Domain

- `DailyPlan`
  - date
  - plan status
  - imported at
  - imported from morning flow version
- `GoalContract`
  - title
  - success definition
  - intended hours today
  - estimated total effort remaining
  - estimate mode
  - risk level
- `TaskContract`
  - task title
  - associated goal
  - allowed support work
  - likely distractors
  - valid detours
  - reminder style
- `FocusBlock`
  - start window
  - end window
  - primary goal
  - optional secondary support scope
  - break rules

### 5.3 Evidence Domain

- `RawEvidenceWindow`
  - imported from Screenpipe adapter
- `NormalizedEvidence`
  - app names
  - window titles
  - URLs
  - OCR/accessibility keywords
  - interaction summary
  - audio/meeting hints
  - screenpipe refs
- `ContextWindow`
  - rolling 60-90 second window
- `ObservedEpisode`
  - 3-5 minute aggregate for progress reasoning
- `SequenceContext`
  - recent prior windows to disambiguate current activity

### 5.4 Classification Domain

- `FocusState`
  - `on_task`
  - `supporting_task`
  - `soft_drift`
  - `hard_drift`
  - `uncertain`
  - `break`
  - `meeting`
  - `idle`
  - `paused`
- `ClassificationDecision`
  - chosen state
  - candidate task/goal
  - confidence
  - explanation bullets
  - method used
  - whether user confirmation is still needed

### 5.5 Goal Progress Domain

- `ProgressEstimate`
  - percent complete
  - confidence
  - velocity
  - behind/ahead flag
- `ProgressSignal`
  - time-based
  - artifact-based
  - milestone-based
  - review-based
- `MilestoneCandidate`
  - inferred milestone
  - confidence
  - ask-user flag

### 5.6 Intervention Domain

- `InterventionPolicy`
  - silence windows
  - cooldowns
  - urgency ladders
- `InterventionCandidate`
  - type
  - message payload
  - justification
  - expiry
- `InterventionOutcome`
  - shown
  - dismissed
  - accepted
  - ignored
  - expired

### 5.7 Memory Domain

- `SessionEvent`
  - important action within the current day
- `DailyMemoryNote`
  - compact review-ready summaries
- `DurableMemoryItem`
  - stable truths that should survive across days
- `RuleProposal`
  - candidate learned signal not yet promoted

### 5.8 Learning Domain

- `CorrectionRecord`
  - user-labeled reclassification
- `SignalWeight`
  - feature -> weighted support or opposition
- `PatternCluster`
  - recurring evidence constellation
- `FalsePositivePattern`
  - rule candidate to reduce over-eager classification
- `FalseNegativePattern`
  - rule candidate to recognize valid work sooner

### 5.9 Explainability Domain

- `ReasonCode`
  - stable internal code for why a decision happened
- `ExplanationBullet`
  - user-readable line generated from reason codes plus evidence
- `WhyThisStateModel`
  - current state
  - strongest supporting evidence
  - strongest conflicting evidence
  - last correction that influenced this decision

---

## 6. Persistence Layer

### 6.1 Database Setup

- open SQLite with `better-sqlite3`
- enable `WAL`
- configure `busy_timeout`
- keep transactions short
- expose explicit checkpoint hook for maintenance

### 6.2 Migration System

- versioned schema migrations
- idempotent startup migration runner
- migration lock / guard
- rollback strategy for failed migration
- migration smoke test fixture database

### 6.3 Core Tables

- `daily_plans`
- `goal_contracts`
- `task_contracts`
- `focus_blocks`
- `observations`
- `context_windows`
- `episodes`
- `classifications`
- `progress_estimates`
- `interventions`
- `intervention_outcomes`
- `user_corrections`
- `signal_weights`
- `pattern_clusters`
- `daily_memory_notes`
- `durable_memory_items`
- `rule_proposals`
- `privacy_exclusions`
- `app_settings`
- `import_audit_log`

### 6.4 Repository Layer

- `DailyPlanRepo`
- `TaskRepo`
- `FocusBlockRepo`
- `ObservationRepo`
- `EpisodeRepo`
- `ClassificationRepo`
- `ProgressRepo`
- `InterventionRepo`
- `CorrectionRepo`
- `MemoryRepo`
- `RuleProposalRepo`
- `SettingsRepo`

### 6.5 Data Retention

- raw summaries in coach DB should be compact, not media-heavy
- keep Screenpipe refs, not raw duplicated screenshots/audio
- prune intermediate windows older than retention policy
- keep daily summaries and durable memories longer
- allow user to tune retention duration

### 6.6 Export / Import / Purge

- export full local data as JSON or SQLite backup
- import selected plan or correction bundles later
- one-click purge all coaching data
- purge must also remove generated rule proposals and cached embeddings
- purge must not mutate the user's Screenpipe data unless explicitly requested

### 6.7 Database Edge Cases

- WAL file grows unexpectedly
- `SQLITE_BUSY` during compaction
- partial write after crash
- duplicate import submission
- schema mismatch after app update
- storage full
- clock skew causing out-of-order inserts

---

## 7. Screenpipe Adapter

### 7.1 Availability And Capability Detection

- ping `/health`
- detect whether `/elements` is available
- detect whether `/frames/{id}/context` is available
- detect whether audio transcripts are enabled
- record Screenpipe version if exposed

### 7.2 Ingest Strategy

- `V1-first`
  - rely on REST polling
  - query `/search` for recent time windows
  - enrich selected frames with `/frames/{id}/context`
  - query `/elements` only when needed for ambiguity or explainability
- `Later`
  - add streaming adapter if the installed Screenpipe version exposes a stable event channel in practice

### 7.3 Polling Adapter

- maintain last successful ingest timestamp
- fetch lookback with slight overlap to tolerate dropped ticks
- dedupe by Screenpipe record IDs and timestamps
- normalize time zones to UTC internally
- ignore stale windows older than policy threshold

### 7.4 Evidence Normalization

- map Screenpipe app names to canonical app identifiers
- sanitize window titles
- normalize URLs to host + path tokens
- extract keywords from OCR/accessibility text
- summarize user input events
- tag likely meeting contexts
- attach screenpipe refs for explainability drill-down

### 7.5 Privacy Filter

- apply app exclusions before classification
- apply domain exclusions before keyword extraction
- drop private/incognito windows when detectable
- redact protected text fragments before storage
- never persist raw excluded evidence in coach DB

### 7.6 Context Aggregation

- build 10-15 second evidence windows
- aggregate to 60-90 second focus windows
- aggregate to 3-5 minute episodes
- preserve recent sequence ordering:
  - what came before
  - what followed
  - how long the context lasted

### 7.7 Meeting Detection

- detect conferencing apps
- detect audio-heavy, low-typing periods
- detect collaborator names or meeting titles when available
- classify meeting as:
  - on-task meeting
  - supporting meeting
  - ambiguous meeting
  - break/noise

### 7.8 Adapter Failure Handling

- Screenpipe returns partial results
- frame context missing for a known frame ID
- OCR text empty but accessibility present
- accessibility empty and OCR noisy
- duplicate results across overlapping polls
- Screenpipe down between two successful ticks
- slow queries exceeding scheduler budget

### 7.9 Screenpipe-Specific Edge Cases

- event-driven capture means "no new frame" can mean stability, not absence of work
- remote desktops, games, and some apps may produce empty accessibility text, so OCR fallback must be expected
- input events may show activity while visible text is unchanged
- audio capture may be disabled for privacy or permission reasons
- Screenpipe pipes run one at a time and are schedule-based, so they are not the runtime engine for the focus loop

---

## 8. Classification And Decision Pipeline

### 8.1 Deterministic Rules Layer

- direct app match rules
- direct domain match rules
- direct window title keyword rules
- collaborator/person rules
- focus-block-specific allow/deny rules
- hard exclusion rules
- break-mode overrides
- meeting-mode overrides

### 8.2 Weighted Evidence Scoring

- positive and negative feature weights
- contextual multipliers based on recent sequence
- recency weighting
- novelty penalty
- contradiction penalty
- confidence floor and ceiling

### 8.3 Retrieval Layer

- embed:
  - corrected examples
  - validated detours
  - durable task context rules
  - prior ambiguity resolutions
- retrieve top similar examples before local AI fallback
- surface retrieved examples into explanation logic for debugging

### 8.4 Local AI Fallback

- only invoke when:
  - deterministic rules conflict
  - score band remains ambiguous
  - retrieved examples are weak or contradictory
  - a novel context appears
- send compact evidence only
- require strict structured output
- reject malformed output
- never let the model directly trigger a notification

### 8.5 Stable Ambiguity Detection

- do not ask on first glimpse of a new context
- wait for stable uncertainty for roughly `30-45s`
- suppress ambiguity prompt during:
  - pause mode
  - break mode
  - lock screen
  - system sleep wake churn
  - active cooldown window

### 8.6 Focus State Machine

- `on_task`
  - requires high confidence and dwell time
- `supporting_task`
  - valid detour or declared support work
- `soft_drift`
  - suspicious but reversible deviation
- `hard_drift`
  - sustained off-task evidence
- `uncertain`
  - conflicting or novel evidence
- `break`
  - user-declared or inferred low-risk pause
- `meeting`
  - active conversation context
- `idle`
  - system inactivity or absent evidence
- `paused`
  - explicit user override

### 8.7 Hysteresis Rules

- require stronger evidence to enter `hard_drift` than to remain in it
- require sustained recovery to return from drift to `on_task`
- ignore micro-switches shorter than threshold
- avoid oscillating between `supporting_task` and `soft_drift`

### 8.8 Intervention Gate

- before any intervention:
  - check pause state
  - check break state
  - check cooldown
  - check notification permission
  - check current UI focus
  - check whether a better intervention is already pending

### 8.9 Explainability Output

- internal reason codes
- stable user-readable explanation bullets
- confidence rationale
- "what would change this decision" suggestion for debugging

---

## 9. Progress Estimation Engine

### 9.1 Estimation Modes

- `time_based`
- `milestone_based`
- `artifact_based`
- `hybrid`

### 9.2 Time-Based Signals

- minutes spent in aligned states
- uninterrupted aligned streak length
- pace against intended hours for today

### 9.3 Milestone Signals

- user-defined milestone checklist
- inferred milestone completion candidates
- manual confirmation impact on percent complete

### 9.4 Artifact Signals

- code repo activity
- document drafting/editing activity
- design artifact work
- communication deliverables sent
- issue/ticket updates if visible in context

### 9.5 Confidence Model

- high when multiple strong signals agree
- medium when time aligns but artifact evidence is weak
- low when only one noisy signal suggests progress

### 9.6 Progress Risk Detection

- behind expected pace
- too much support work without artifact movement
- repeated ambiguity in the same goal
- heavy context switching during a critical block

### 9.7 Milestone Confirmation Prompt

- ask only when evidence is strong enough
- present one-tap confirm / dismiss
- if dismissed, reduce over-eager detector confidence

### 9.8 Progress Edge Cases

- long thinking/review periods with little typing
- research-heavy work where artifacts appear late
- pair-programming or meeting-based progress
- support work that is necessary but not directly shippable
- user finishes a task much faster than estimate
- user edits goals midday

---

## 10. Morning Flow

### 10.1 Triggering

- first meaningful activity after unlock
- first menu bar open of the day
- manual "Start My Day" action
- manual plan reset

### 10.2 Morning Context Packet Builder

- recent unfinished goals from prior day
- yesterday's debrief outcomes
- durable memory relevant to today's likely work
- planned meetings if manually declared
- open questions from unresolved ambiguities

### 10.3 Prompt Generator

- build a copy-paste prompt for ChatGPT
- require the cloud conversation to coach toward:
  - top 1-3 priorities
  - success definitions
  - intended hours today
  - total remaining effort
  - allowed support work
  - likely distractors
  - if-then recovery rules
- end with strict import format

### 10.4 Focus For Today Import Parser

- accept only structured payload
- reject transcript-like freeform text
- validate 1-3 tasks
- validate per-task intended hours
- validate success definitions
- validate support work structure

### 10.5 Morning Import Persistence

- create `DailyPlan`
- create `GoalContracts`
- create `TaskContracts`
- create focus blocks if provided
- initialize progress baselines
- emit fresh `DashboardViewModel`

### 10.6 Morning Flow UI

- show prompt text
- copy button
- paste/import box
- validation errors
- success confirmation
- edit / re-import affordance

### 10.7 Morning Flow Edge Cases

- user never completes morning flow
- user pastes malformed response
- imported tasks exceed 3
- intended hours exceed realistic workday
- duplicated task titles
- support work is too vague to classify
- user changes mind midday

---

## 11. Daytime Coaching Features

### 11.1 Glanceable Menu Bar Status

- show current top-level state by color
- show current primary goal or task label
- show short timer or streak
- show confidence indicator
- show pause / break shortcut

### 11.2 State Color Model

- green = aligned
- blue = supporting
- yellow = uncertain / soft drift
- red = hard drift
- gray = break / idle / paused

### 11.3 Dashboard

- today's goals
- progress percent
- confidence percent
- current focus block
- aligned time vs intended hours
- recent explainability log
- unresolved ambiguities
- pending milestone confirmations

### 11.4 Soft Drift Handling

- state changes to yellow
- no notification immediately
- give self-correction grace period
- if recovery happens within dwell window:
  - no prompt
  - no negative event escalation

### 11.5 Hard Drift Handling

- trigger only after sustained high-confidence off-task evidence
- show neutral wording
- include quick options:
  - return now
  - intentional detour
  - take break
  - pause coaching
- enter cooldown after showing

### 11.6 Guilt-Free Pause

- one-click from menu bar
- configurable duration presets
- manual resume
- pause suppresses:
  - classification prompts
  - praise
  - drift redirects
- pause does not delete evidence; it changes policy behavior

### 11.7 Ambiguity HUD

- tiny transient panel
- anchored near menu bar
- one-click options:
  - Task A
  - Task B
  - support work
  - break
  - distraction
- optional "remember this pattern" toggle

### 11.8 Positive Reinforcement

- earned only after stable aligned work
- message must be:
  - specific
  - task-level
  - competence-supportive
  - sparse
- maximum once per focus block by default

### 11.9 Milestone Completion Prompt

- infer likely completion from artifact/progress evidence
- ask for confirmation
- update progress immediately if confirmed

### 11.10 Why Am I Seeing This?

- drill-down shows 2-3 evidence bullets
- list strongest recent indicators
- distinguish:
  - evidence for alignment
  - evidence for drift
  - confidence limiters

### 11.11 Notification Strategy

- use only for:
  - hard drift
  - earned praise
  - milestone confirmation
  - rare ambiguity prompt when HUD is missed
- do not notify on every state change

### 11.12 Daytime Feature Edge Cases

- repeated yellow/red oscillation
- user working in a valid but novel tool
- user in browser research for a valid task
- user on Slack for project discussion vs casual chat
- user ignores a notification
- notification permission denied
- app in full-screen presentation mode
- multiple monitors with unrelated contexts

---

## 12. Evening Flow

### 12.1 Debrief Packet Builder

- planned goals
- observed episodes
- aligned blocks
- support blocks
- drift blocks
- pauses and overrides
- progress signals
- estimate vs actual effort
- unresolved ambiguities
- suggested learning candidates

### 12.2 Evening Prompt Generator

- produce copy-paste prompt for ChatGPT
- ask for constructive review:
  - what moved forward
  - what counted as real progress
  - what blocked progress
  - what should be remembered
  - how tomorrow should be adjusted
- end with strict structured return format

### 12.3 Evening Debrief Import Parser

- validate structured payload
- parse:
  - clarified task boundaries
  - corrected ambiguity labels
  - candidate durable memories
  - suggestions for tomorrow
  - which milestones actually mattered

### 12.4 Memory Promotion

- create `DailyMemoryNote`
- create `RuleProposal` objects
- create reviewable `DurableMemoryItem` candidates
- do not auto-promote speculative text into truth

### 12.5 Evening UI

- show debrief packet preview
- copy button
- paste/import box
- validation and review step
- explain what will be stored

### 12.6 Evening Edge Cases

- user skips debrief entirely
- debrief import contradicts morning plan
- cloud conversation returns vague advice instead of structure
- candidate memory is too broad and would overfit
- imported tomorrow suggestions conflict with durable memory

---

## 13. Memory And Learning System

### 13.1 Session Memory

- record major state changes
- record interventions and outcomes
- record user corrections
- record validated detours

### 13.2 Daily Working Memory

- summarize the day into compact notes
- preserve unresolved questions
- preserve likely false positives / false negatives

### 13.3 Durable Memory

- things that remain true across days:
  - stable task-tool relationships
  - collaborator relevance
  - valid domains
  - recurring distractor patterns
  - praise / reminder preferences
- each durable memory needs:
  - source
  - confidence
  - recency
  - last validation date

### 13.4 Rule Proposals

- generated from:
  - repeated corrections
  - evening debrief imports
  - cluster analysis
  - local AI summary suggestions
- stay reviewable before promotion

### 13.5 Weight Updates

- positive reinforcement for correct predictions
- penalty for false positives
- penalty for false negatives
- decay stale weights over time

### 13.6 Retrieval Index

- embed compact text representations of:
  - corrections
  - durable memories
  - validated examples
  - support-work examples
- reindex after imports and rule promotions

### 13.7 Learning Edge Cases

- overfitting to one unusual day
- "Chrome always good" or "Slack always bad" false generalization
- stale collaborator/project names
- contradictory user corrections across contexts
- high-confidence memory derived from low-quality OCR

---

## 14. UI Layer

### 14.1 App Shell

- menu-bar-first app
- optional dashboard window
- settings window
- import/export modals
- launch-at-login integration

### 14.2 Bridge Client

- connect to local logic process
- request current snapshot on app open
- subscribe to async updates
- send typed actions
- reconnect automatically after process restart

### 14.3 App State Store

- `MenuBarState`
- `DashboardState`
- `PromptImportState`
- `PendingNotificationState`
- `ClarificationPanelState`
- `SettingsState`

### 14.4 Menu Bar Module

- icon renderer
- label renderer
- compact summary text
- status menu
- quick action buttons

### 14.5 Dashboard Module

- goals list
- progress cards
- confidence indicators
- explainability section
- recent events section
- unresolved ambiguity section

### 14.6 Clarification Module

- transient HUD
- keyboard shortcuts for fast selection
- accessibility labels
- timeout / auto-dismiss behavior

### 14.7 Morning And Evening Modules

- prompt preview
- copy prompt
- paste response
- validation errors
- import success state
- edit / retry flow

### 14.8 Notifications Module

- register categories
- action buttons
- deep-link back into app state
- handle action responses and forward as `UserActions`

### 14.9 Settings And Privacy Module

- app exclusions
- domain exclusions
- reminder preferences
- praise preferences
- data export
- delete all data
- launch at login control
- diagnostics panel

### 14.10 Review And History Module

- day timeline
- past daily plans
- past corrections
- reviewable durable memories
- reviewable rule proposals

### 14.11 UI Edge Cases

- logic process restarts while UI is open
- UI opens before logic is healthy
- notification action arrives when window state is stale
- user edits exclusions while a classifier tick is in flight
- no notification permission
- reduced-motion / accessibility requirements

---

## 15. Bridge Contract

### 15.1 Transport

- `V1-first`: local HTTP + event stream or WebSocket
- keep bridge transport replaceable
- keep payloads transport-agnostic

### 15.2 Outbound ViewModels

- `MenuBarViewModel`
- `DashboardViewModel`
- `NotificationViewModel`
- `ClarificationViewModel`
- `MorningPromptViewModel`
- `EveningPromptViewModel`
- `SettingsViewModel`
- `DiagnosticsViewModel`

### 15.3 Inbound UserActions

- `PauseAction`
- `ResumeAction`
- `TakeBreakAction`
- `ResolveAmbiguityAction`
- `AcknowledgeRedirectAction`
- `MarkMilestoneCompleteAction`
- `DismissMilestoneAction`
- `ImportFocusForTodayAction`
- `ImportEveningDebriefAction`
- `UpdateExclusionsAction`
- `UpdatePreferencesAction`
- `PurgeAllAction`

### 15.4 Contract Rules

- every payload validated at the logic boundary
- no UI-originated freeform action mutations
- version every payload family
- include correlation IDs for async flows
- include action result envelopes:
  - success
  - validation error
  - retryable failure
  - fatal failure

### 15.5 Bridge Edge Cases

- version mismatch between UI and logic
- duplicate action submission from double-click
- stale viewmodel applied after reconnect
- partial notification payload arriving after source state expired

---

## 16. Testing And Verification

### 16.1 Logic Unit Tests

- rule scoring
- state transitions
- hysteresis
- cooldown enforcement
- praise eligibility
- milestone inference thresholds
- memory promotion rules
- import validators

### 16.2 Repository Tests

- migrations
- CRUD correctness
- transaction rollback behavior
- retention and purge correctness
- busy/retry behavior

### 16.3 Screenpipe Adapter Tests

- sample `/search` payload parsing
- missing field tolerance
- duplicate result dedupe
- exclusion filtering
- frame context enrichment

### 16.4 AI Adapter Tests

- schema generation
- malformed structured output rejection
- fallback ordering
- no-model degraded behavior

### 16.5 Contract Tests

- generated JSON Schema snapshots
- UI bridge payload compatibility
- notification action payloads
- import payload backward compatibility

### 16.6 UI Unit Tests

- button click -> correct `UserAction`
- view state rendering for every major status
- validation error rendering
- reconnect behavior

### 16.7 UI Preview Matrix

- all menu bar colors
- no-plan day
- active hard drift
- active praise
- ambiguity prompt
- paused state
- Screenpipe degraded state

### 16.8 End-To-End Tests

- morning import -> aligned work -> praise -> evening export
- morning import -> soft drift -> recovery without prompt
- morning import -> hard drift -> redirect -> cooldown
- ambiguity prompt -> correction -> remembered pattern on next similar context
- data purge flow

### 16.9 Performance Tests

- ingest tick latency under normal load
- classification latency budget
- DB write pressure
- UI render response time
- cold start time

### 16.10 Privacy And Safety Tests

- excluded app evidence never stored in coach DB
- excluded domain evidence redacted before persistence
- purge removes local coaching state
- no accidental Screenpipe mutation during normal runtime

### 16.11 Manual Acceptance By Epic

- Epic 1: morning flow
- Epic 2: ambient awareness and progress
- Epic 3: gentle redirection and pause
- Epic 4: ambiguity resolution and remembering patterns
- Epic 5: positive reinforcement and milestone confirmation
- Epic 6: evening debrief and privacy

---

## 17. Packaging, macOS Integration, And Release

### 17.1 Process Topology

- ship Swift app bundle
- bundle headless logic runtime with app
- start logic process on app launch
- keep health handshake between UI and logic

### 17.2 Launch At Login

- register helper/login item via `SMAppService`
- handle approval and disabled states
- show recovery guidance when login registration fails

### 17.3 Permission Onboarding

- Screen Recording
- Accessibility
- Notifications
- optional microphone/system audio if used indirectly through Screenpipe
- explain why each permission matters

### 17.4 App Lifecycle Hooks

- app launch
- wake from sleep
- user switch
- lock/unlock
- quit
- crash restart

### 17.5 Code Signing And Notarization

- entitlements review
- hardened runtime review
- release build pipeline
- notarization verification

### 17.6 Updates And Data Migration

- safe DB migration on app update
- bridge version compatibility check
- release notes for new behavior-affecting logic

### 17.7 Release Edge Cases

- helper launches but logic process fails
- permissions revoked after install
- Screenpipe not installed or not running after app upgrade
- database migration fails on a user machine with old data

---

## 18. Dedicated Edge Case Inventory

This section centralizes cross-cutting failure modes that must appear in design, tests, and telemetry.

### 18.1 Observation Edge Cases

- Screenpipe unavailable on boot
- Screenpipe returns data late
- no new events during deep work because the visible screen barely changes
- OCR is noisy or empty
- accessibility text is empty
- browser URL unavailable
- user works in remote desktop or virtual machine
- multiple apps visible but only one focused

### 18.2 Classification Edge Cases

- same app valid for both task and distraction depending on context
- valid support work looks off-task without recent sequence context
- hard drift detected during a legitimate administrative detour
- break inferred when user is silently thinking
- meeting audio suggests work, but current plan has no meeting context

### 18.3 Progress Edge Cases

- progress happens mainly in reading, thinking, or whiteboarding
- user makes real progress in a meeting, not in an editor
- milestone appears complete but is immediately reopened
- estimates were wrong from the start

### 18.4 Behavioral Edge Cases

- user wants silence for an entire day
- user ignores every praise notification
- user finds praise annoying in some contexts but helpful in others
- user deliberately works outside the declared plan
- user has no morning plan but still wants passive status only

### 18.5 Privacy Edge Cases

- password manager visible
- banking / health / legal content appears briefly
- private browsing window
- personal chat mixed with work chat in same app
- accidental capture of another person's sensitive information during screen share

### 18.6 Operational Edge Cases

- laptop sleep between ingest and classify ticks
- timezone change or DST rollover
- clock correction by NTP
- disk almost full
- app crash during import
- duplicate helper instances

### 18.7 AI Edge Cases

- local model returns invalid JSON
- local model hallucinates certainty
- embeddings store becomes stale after rule edits
- no model installed
- model is too slow and causes intervention lag

### 18.8 UX Edge Cases

- notification clicked after the underlying state expired
- ambiguity HUD appears over full-screen work
- menu bar text truncates long task names
- color-only state is insufficient for accessibility

---

## 19. Suggested Delivery Sequence

### 19.1 Phase 1: Walking Skeleton

- repo structure
- bridge contract basics
- SQLite setup
- Screenpipe health probe
- menu bar app shell
- static viewmodels

### 19.2 Phase 2: Morning Contract And Passive Status

- morning prompt generation
- strict Focus For Today import
- daily plan persistence
- passive menu bar status with polling-based evidence collection

### 19.3 Phase 3: Drift Engine

- deterministic rules
- weighted scoring
- soft drift yellow state
- hard drift redirect
- cooldown and pause support

### 19.4 Phase 4: Progress And Explainability

- episode builder
- progress estimator
- dashboard
- why-am-I-seeing-this drill-down

### 19.5 Phase 5: Ambiguity And Learning

- ambiguity HUD
- correction capture
- pattern memory
- retrieval layer

### 19.6 Phase 6: Positive Reinforcement

- praise eligibility engine
- praise notifications
- milestone inference and confirmation

### 19.7 Phase 7: Evening Debrief

- debrief packet builder
- evening prompt generation
- structured debrief import
- daily memory note creation

### 19.8 Phase 8: Hardening

- privacy polish
- data export / purge
- degraded modes
- migration safety
- packaging and notarization

---

## 20. Traceability To Existing Product Scope

### 20.1 Direct Expansion Of v1

- `v1 1.1 Foundation & Infrastructure`
  - expanded into sections `3`, `4`, `6`, `15`, `16`, and `17`
- `v1 1.2 Domain Core`
  - expanded into sections `5`, `8`, `9`, `10`, `11`, and `13`
- `v1 1.3 Application Services`
  - expanded into sections `7`, `10`, `11`, and `13`
- `v1 1.4 Adapters`
  - expanded into sections `6`, `7`, and `15`
- `v1 1.5 Bridge Contract`
  - expanded into section `15`
- `v1 1.6 Testing`
  - expanded into section `16`
- `v1 2 UI Layer`
  - expanded into section `14`
- `v1 3 Integration & Deployment`
  - expanded into section `17`

### 20.2 Coverage Of User Story Epics

- `Epic 1`
  - section `10`
- `Epic 2`
  - sections `9` and `11`
- `Epic 3`
  - section `11`
- `Epic 4`
  - sections `8` and `13`
- `Epic 5`
  - sections `9`, `11`, and `13`
- `Epic 6`
  - sections `10`, `12`, `13`, and `14.9`

---

## 21. Source Links Used For Current Software Choices

- Screenpipe architecture: [docs.screenpi.pe/architecture](https://docs.screenpi.pe/architecture)
- Screenpipe pipes: [docs.screenpi.pe/pipes](https://docs.screenpi.pe/pipes)
- Apple `MenuBarExtra`: [developer.apple.com/documentation/swiftui/menubarextra](https://developer.apple.com/documentation/swiftui/menubarextra)
- Apple `SMAppService`: [developer.apple.com/documentation/servicemanagement/smappservice](https://developer.apple.com/documentation/servicemanagement/smappservice)
- Apple User Notifications: [developer.apple.com/documentation/usernotifications](https://developer.apple.com/documentation/usernotifications)
- SQLite WAL: [sqlite.org/wal.html](https://www.sqlite.org/wal.html)
- Ollama API: [docs.ollama.com/api/introduction](https://docs.ollama.com/api/introduction)
- Ollama structured outputs: [docs.ollama.com/capabilities/structured-outputs](https://docs.ollama.com/capabilities/structured-outputs)
- Ollama embeddings: [docs.ollama.com/capabilities/embeddings](https://docs.ollama.com/capabilities/embeddings)
- Zod JSON Schema: [zod.dev/json-schema](https://zod.dev/json-schema)
- `better-sqlite3`: [github.com/WiseLibs/better-sqlite3](https://github.com/WiseLibs/better-sqlite3)

---

## 22. Final Architectural Judgment

The cleanest implementation is:

- one headless `TypeScript` logic process
- one extremely dumb `SwiftUI/AppKit` menu-bar-first shell
- one app-owned `SQLite` database in `WAL` mode
- one Screenpipe adapter that stays read-oriented and privacy-filtered
- one optional local AI adapter that only runs after deterministic and retrieval layers fail

Anything that pushes judgment into Screenpipe pipes, business logic into Swift, or canonical product memory into raw Screenpipe storage will make the product harder to test, explain, and trust.
