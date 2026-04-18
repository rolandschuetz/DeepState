# Software Architecture

## Purpose

This document consolidates the architecture decisions across the `Brainstorming` notes, with priority given to:

- `Brainstorming/FocusAgentSoftwareAchitecture.md`
- `Brainstorming/GoalFocusedAgentSoftwareAchitecture.md`

The result is a general architecture for a local-first macOS coaching product that:

- helps the user stay aligned with declared priorities
- estimates progress toward daily goals
- intervenes rarely and explainably
- learns from corrections over time

## Core Decisions

1. `ScreenPi / Screenpipe` is the `context-gathering layer`, not the product brain.
2. The app-owned `logic layer` owns judgment, state, progress estimation, intervention policy, and learning, and should be implemented in `TypeScript`.
3. The `UI layer` stays thin, glanceable, and easy to override.
4. The canonical product memory lives in the app’s own local SQLite database, not in the Screenpipe database.
5. The runtime should be mostly deterministic, with LLM support only for ambiguity, planning help, summaries, and rule proposals.
6. The product should optimize for low interruption cost, interpretability, local ownership, and autonomy-supportive coaching.
7. `Context` and `memory` are different things. The system should not inject all remembered information into every runtime decision.
8. Memory should be layered into session history, daily working memory, durable long-term memory, and searchable retrieval.
9. The `logic layer` and `UI layer` should be testable as independent pieces with a strict boundary between them.
10. `Intentional Mornings` and `The Evening Debrief` should not run as rich local coaching conversations inside this app. The app should prepare structured context for a more capable cloud model and then import back a strict structured result.

## High-Level Architecture

```text
[ UI Layer ]
  Menu bar status
  Goal / focus dashboard
  Clarification popovers
  Local notifications
  Morning prompt export
  Evening debrief export
  Structured import screens
  Settings and review

          |
          v

[ Logic Layer ]
  Planner
  Context Aggregator / Episode Builder
  Focus Classifier
  Goal Matcher
  Progress Estimator
  Decision / Intervention Engine
  Memory Engine
  Learning Engine
  Local AI Adapter
  App SQLite DB

          |
          v

[ ScreenPi / Screenpipe Context Layer ]
  /ws/events
  /search
  /elements
  /ui-events
  /frames/{id}/context
  local Screenpipe memory
```

## 1. ScreenPi / Screenpipe Context Layer

This layer is responsible for `observation only`.

It should gather and normalize:

- active app
- window title
- browser URL
- OCR and accessibility text
- UI elements
- input events such as typing, click, scroll, clipboard, and app switches
- optional audio transcript or meeting context

Its responsibilities are:

- subscribe to real-time events or poll recent windows
- fetch recent evidence from Screenpipe
- normalize raw context into app-owned evidence objects
- keep references to Screenpipe records instead of duplicating raw media

It must not decide:

- whether the user is on task
- which goal an episode belongs to
- whether progress happened
- whether the user should be interrupted

### Output Contract

The context layer should emit normalized rolling windows or episodes such as:

```json
{
  "start_at": "2026-04-18T09:12:00Z",
  "end_at": "2026-04-18T09:15:00Z",
  "active_apps": ["Cursor", "Google Chrome"],
  "window_titles": ["checkout.tsx - repo", "Stripe Docs - Payments"],
  "urls": ["https://docs.stripe.com/payments"],
  "keywords": ["checkout", "payment", "launch"],
  "interaction_summary": {
    "typing_seconds": 96,
    "scroll_events": 14,
    "app_switches": 2
  },
  "screenpipe_refs": {
    "frame_ids": [1001, 1002],
    "element_ids": [42, 44]
  }
}
```

## 2. Logic Layer

This is the actual product brain.

It should combine the strongest ideas from the `FocusAgent` and `GoalAgent` notes:

- `Focus question`: is the current work aligned with the active focus block?
- `Goal question`: is the recent work episode moving one of today’s goals forward?

The logic layer should answer both, but on top of the same evidence model.

### Implementation Language and Runtime

The logic layer should be built in `TypeScript`.

Recommended stack:

- `TypeScript`
- `Node.js`
- no heavy application framework in the domain core
- `Zod` for schema validation at the boundaries
- SQLite adapter behind repository interfaces

Important architectural rule:

The core logic should not depend on:

- SwiftUI
- AppKit
- UI state management
- notification APIs
- Screenpipe transport details

Those belong in adapters, not in the domain core.

### Cloud-Assisted Planning and Reflection Boundary

The system should explicitly separate two kinds of intelligence:

- `local runtime intelligence`
  fast, deterministic, private, always-on focus classification and memory updates
- `cloud coaching intelligence`
  richer reflective and planning conversations that are better handled by a more capable model such as ChatGPT

For this product, two workflows should be handled through `copy-paste cloud coaching` rather than local agent conversation:

1. `Intentional Mornings`
2. `The Evening Debrief`

The local app should do these jobs:

- gather and structure relevant context
- generate a strong prompt for ChatGPT
- tell the user what to copy
- validate the structured result pasted back into the app
- store only the imported structured result as canonical local state

The local app should not do these jobs:

- simulate a rich morning coaching dialogue
- simulate a rich evening reflection dialogue
- keep the full cloud conversation as canonical memory

Important rule:

The app should persist the structured import, not the full ChatGPT transcript.

### Main Modules

#### Planner

Runs at first meaningful activity of the day, first app open, or manual restart, but the rich coaching conversation itself should happen in ChatGPT, not inside the app.

Captures:

- top 1-3 goals or priorities
- success definition
- focus blocks
- allowed contexts
- valid detours and support work
- likely distractors
- reminder style
- estimate mode and effort expectations

Outputs:

- `DailyPlan`
- `GoalContract`
- `FocusBlock`
- task and goal rules

The local planner should therefore behave as:

1. generate a morning export packet
2. render a copy-paste ChatGPT prompt
3. accept a strict structured `Focus For Today` import
4. validate and store that import

#### Context Aggregator / Episode Builder

Transforms short raw windows into meaningful context windows and episodes.

Recommended defaults:

- ingest every `10-15s`
- aggregate over `60-90s` for focus state
- build `3-5 minute` episodes for goal-progress estimation
- keep `2-15 minutes` of recent sequence context

This is the bridge between noisy capture and stable judgment.

#### Focus Classifier

Classifies current activity into states such as:

- `on_task`
- `supporting_task`
- `soft_drift`
- `hard_drift`
- `uncertain`
- `break`
- `meeting`
- `idle`
- `paused`

Decision order:

1. deterministic rules
2. weighted evidence scoring
3. retrieval from prior corrections
4. LLM fallback for unresolved ambiguity
5. user clarification only when ambiguity persists

#### Goal Matcher

Matches recent episodes to one of today’s declared goals.

Outputs:

- matched goal
- match type: direct, supporting, ambiguous, or none
- confidence
- top evidence

This avoids naive app-based assumptions like `Chrome = distraction`.

#### Ambiguity Resolver

This module exists for situations where the system cannot confidently decide what the user is doing.

Typical ambiguous cases:

- research that may support more than one task
- communication that could be either useful coordination or drift
- admin work with unclear relevance
- a new app, site, repo, or document the system has not seen before
- work that belongs to a broader `group of work` rather than one specific task

The resolver should decide whether to:

1. stay silent and wait for more evidence
2. ask the user a fast clarification question
3. store the episode as unresolved for end-of-day review

The clarification flow should be lightweight and explicit.

Example prompt:

- `Does the current work belong to one of today’s tasks?`

Example answer choices:

- `Task 1`
- `Task 2`
- `Support work`
- `Admin`
- `Break`
- `Not related`

Optional follow-up:

- `Should I remember this kind of work as belonging to this task in the future?`

The resolver should never ask broad open-ended questions during focused work if a one-click disambiguation is possible.

#### Progress Estimator

Estimates whether a recent episode contributed to goal completion.

Supported estimate modes:

- `time-based`
- `milestone-based`
- `artifact-based`
- `hybrid`

Important rule:

`time spent` can improve confidence, but should not by itself imply completion.

Track separately:

- progress percent
- confidence percent
- risk level
- ETA / remaining effort

#### Decision / Intervention Engine

Owns:

- state transitions
- dwell times
- hysteresis
- confidence thresholds
- cooldowns
- no-interrupt windows
- escalation policy

Default escalation ladder:

1. silent UI update
2. gentle reminder
3. clarification prompt
4. stronger lock-in mode only if the user explicitly enables it

#### Memory Engine

The memory engine should adopt the strongest ideas from OpenClaw’s memory architecture while keeping this app’s SQLite database as canonical.

The key lessons are:

- memory should be explicit and inspectable
- `context` is not the same as `memory`
- small durable memory can be loaded by default
- larger daily notes should be searched on demand
- memory should be curated instead of growing as an unstructured dump
- before compressing old session history, the system should first flush durable facts into memory

For this product, the memory engine should manage four distinct layers:

1. `session history`
2. `daily working memory`
3. `durable long-term memory`
4. `retrieval index`

The logic layer should own all four.

#### Morning / Evening Exchange Engine

This module should handle the two cloud-assisted workflows:

- morning planning exchange
- evening debrief exchange

Its responsibilities:

- build export packets from local context
- generate exact copy-paste prompts
- define strict return formats
- validate pasted structured results
- convert accepted imports into canonical local state

It should not own the coaching conversation itself.

#### Learning Engine

Learns from:

- user corrections
- accepted or dismissed prompts
- confirmed milestones
- stable high-confidence aligned blocks
- repeated false positives and false negatives

Updates:

- signal weights
- goal and task rules
- valid detours
- support-work patterns
- reminder aggressiveness preferences
- reusable mappings between evidence patterns and tasks or work groups

### Logic Layer Plan

The TypeScript logic layer should be organized as independent modules with narrow interfaces.

Recommended structure:

```text
logic/
  src/
    domain/
      planner/
      exchange/
      classification/
      goals/
      progress/
      decisions/
      memory/
      learning/
      shared/
    application/
      use-cases/
      services/
      ports/
    adapters/
      screenpipe/
      sqlite/
      llm/
      scheduler/
      ui-bridge/
    index.ts
```

Responsibilities by layer:

- `domain`
  pure business rules, state transitions, scoring, and memory promotion rules
- `application`
  orchestration of use-cases and coordination between domain and adapters
- `ports`
  interfaces for persistence, Screenpipe access, retrieval, scheduling, and UI callbacks
- `adapters`
  concrete implementations for SQLite, Screenpipe APIs, LLM calls, and scheduler hooks

Recommended implementation phases:

1. `shared` domain types and schemas
2. planner and daily-plan contracts
3. morning and evening exchange contracts
4. context aggregation and episode builder
5. focus classifier and ambiguity resolver
6. goal matcher and progress estimator
7. decision engine and intervention policy
8. memory engine and promotion rules
9. learning engine
10. adapter implementations
11. UI bridge integration

### UI Boundary Contract

The UI should not call domain internals directly.

It should communicate with the logic layer through a small boundary such as:

- `startDay(planInput)`
- `generateMorningPrompt(context)`
- `importFocusForToday(payload)`
- `ingestEvidence(evidenceBatch)`
- `resolveAmbiguity(answer)`
- `pauseCoaching(duration)`
- `getCurrentState()`
- `getDashboardSnapshot()`
- `generateEveningDebriefPacket()`
- `generateEveningPrompt(packet)`
- `importEveningDebrief(payload)`
- `runMemoryCuration()`

This keeps the UI replaceable and keeps the logic independently testable.

### Ambiguity Handling and User Teaching

Ambiguity is a first-class product behavior, not an error case.

When evidence is unclear, the system should prefer `brief teaching interactions` over hidden guessing.

Recommended runtime behavior:

1. detect a stable ambiguous window
2. wait for dwell time so momentary noise does not trigger a prompt
3. ask the user whether the current work belongs to a task, support work, admin, break, or none
4. optionally ask whether this pattern should be remembered in the future
5. save the answer as a labeled example and update task or work-group memory

This lets the product improve over time without pretending certainty it does not have.

### Task and Work-Group Memory

The system should remember not only `single task mappings`, but also broader `groups of work`.

Examples:

- `pricing research`
- `launch coordination`
- `customer support`
- `admin`
- `meeting preparation`

This is important because many work episodes do not map cleanly to one exact task, but do belong to a repeatable work pattern.

The memory model should therefore support:

- `task memory`
  direct association to a specific task or goal
- `work-group memory`
  reusable association to a broader category of work
- `negative memory`
  patterns that usually do not belong to the user’s intended work
- `conditional memory`
  patterns that are valid only in some contexts

Memory should be built from:

- explicit user clarification answers
- repeated confirmed episodes
- end-of-day relabeling

Memory should store evidence patterns such as:

- app
- domain or URL pattern
- repo or file name
- window title pattern
- OCR or UI keywords
- people or channel names
- recent sequence context

Important rule:

Do not store flat truths like `Slack = Task A`.

Store conditional patterns like:

- `Slack + launch channel + collaborator names + active pricing goal -> launch coordination work group`
- `Chrome + docs + repo continuity + recent coding -> supports current implementation task`
- `Mail + invoice keywords + no admin block -> likely unrelated`

### Memory Architecture

Inspired by OpenClaw, the system should separate memory into distinct layers with different purposes instead of treating all notes as one giant memory blob.

#### 1. Session History

This is the append-only event and transcript layer.

It should contain:

- raw user interactions
- agent classifications
- clarification prompts and answers
- intervention events
- system decisions
- tool and retrieval traces when needed for audit

This layer is useful for:

- audit
- debugging
- replay
- evaluation

It is not the same as durable memory and should not be injected wholesale into runtime context.

#### 2. Daily Working Memory

This is the short-lived operating memory for the current day.

It should contain:

- today’s plan
- recent ambiguous episodes
- temporary context links
- unresolved follow-ups
- likely task associations not yet promoted into durable rules

OpenClaw’s `memory/YYYY-MM-DD.md` pattern is useful here.

For this product, the equivalent should exist as:

- canonical rows in SQLite
- optional human-readable daily note mirrors such as `memory/YYYY-MM-DD.md`

Only recent daily memory should be considered by default. Older daily notes should usually be accessed through retrieval rather than direct injection.

#### 3. Durable Long-Term Memory

This is the curated layer for things the product should keep remembering across days and weeks.

It should contain:

- stable user preferences
- recurring task and goal templates
- known work groups
- allowed and disallowed patterns
- validated conditional mappings
- durable coaching preferences
- repeated ambiguity resolutions that have earned promotion

OpenClaw’s `MEMORY.md` concept is useful here, but this product should keep SQLite as canonical and optionally generate a concise human-readable mirror.

Important rule:

Durable memory must stay compact and high signal.

It should not become:

- a dump of every episode
- a session transcript copy
- a changelog
- a place for stale temporary notes

#### 4. Retrieval Index

The system should build a searchable index over memory rather than loading everything into every decision.

The OpenClaw approach here is strong:

- chunk memory into small units
- combine semantic retrieval with keyword retrieval
- use hybrid search by default
- keep recent information easier to surface
- reduce duplicate near-identical recalls

For this product, retrieval should support:

- hybrid semantic + keyword search
- temporal decay for old daily notes
- diversity-aware reranking so results are not repetitive
- optional indexing of selected external documents such as project docs or notes

Runtime rule:

- durable memory can be small enough to load directly
- daily notes and older evidence should be pulled through retrieval only when needed

### Memory Promotion and Curation

One of the best OpenClaw ideas is that not everything should be promoted directly into long-term memory.

This architecture should adopt the same principle.

Memory should move through these stages:

1. observed in session history
2. stored in daily working memory
3. optionally marked as a candidate for durable memory
4. promoted only after confirmation, repetition, or high-confidence validation

Promotion triggers can include:

- explicit user clarification
- repeated confirmed episodes
- end-of-day review
- stable reuse across multiple days

The system should support a reviewable promotion log so the user can inspect what became durable memory and why.

### Memory Flush Before Compaction

Another strong OpenClaw pattern is pre-compaction memory flush.

Before the system summarizes or compresses old session history, it should first run a silent logic pass that extracts:

- durable facts
- unresolved questions
- candidate rule updates
- important decisions

and writes them into the correct memory layers.

This prevents accidental loss of valuable context during transcript compaction.

Important rule:

The full raw session history should remain on disk for audit even if the active runtime context is compacted.

### Scheduled Memory Curator

OpenClaw’s heartbeat model is useful, but it should be adapted carefully here.

This product should have a lightweight scheduled `Memory Curator` run inside the logic layer.

Its jobs:

- compact today’s working memory
- surface unresolved ambiguities
- propose durable memory promotions
- clean stale temporary notes
- maintain concise human-readable memory mirrors

This should run on a slower cadence than the runtime classifier and use a small curated context, not the full day transcript.

Recommended timing:

- end of focus block
- end of day
- optional low-frequency background sweep

### Identity, Policy, and Memory Must Be Separate

Another useful OpenClaw lesson is separating identity files from memory.

For this product, the equivalent rule is:

- product policy is not memory
- task and goal contracts are not personality
- durable memory is not the place for changing core rules

The user’s goal system, trust boundaries, and protected policies should be stored separately from learned memory and should not be rewritten automatically without human approval.

#### Local AI Adapter

AI is a narrow supporting service, not the main runtime brain.

Use it for:

- ambiguity classification
- coach message drafting
- proposed rule updates
- local parsing help for imported structured payloads when needed
- small local summarization tasks inside the runtime or memory engine

Do not use it for:

- every runtime tick
- canonical state transitions
- silent goal rewrites
- constant conversational monitoring
- replacing the richer ChatGPT morning or evening coaching conversations

### Runtime Model

The system should be conservative and stateful.

Recommended cadence:

- frequent evidence ingest every `10-15s`
- focus-state evaluation over `60-90s`
- goal-progress evaluation every `3 minutes`
- slower cadence while idle or in break mode

Recommended behavioral defaults:

- `soft drift watch`: after `30-60s` of weak alignment
- `soft drift reminder`: after `90-120s` of sustained drift
- `uncertain ask`: after `30-45s` of stable ambiguity or `2 consecutive ambiguous cycles`
- `praise`: after `25-30m` of stable aligned work
- `cooldown`: `10-15m` after an interruption

The product should classify quickly but interrupt slowly.

### Morning Workflow

The morning workflow should be:

1. local app gathers available context
2. local app generates a `Morning Context Packet`
3. local app renders a detailed `ChatGPT Morning Coach Prompt`
4. user copies prompt into ChatGPT
5. ChatGPT coaches the user interactively
6. user copies the final structured `Focus For Today` block back into the app
7. local app validates and stores the result

The morning packet may include:

- current date
- yesterday carry-over items if known
- recent durable task memory
- known work groups
- optional suggested priorities from prior context

The imported result should become the only canonical daily plan input used by the local runtime.

### Morning Prompt Template

The app should generate a prompt substantially like this:

```text
You are my morning focus coach.

Your job is not to give me a generic productivity pep talk. Your job is to coach me into a clear, realistic, structured plan for today.

Coaching style:
- Be direct, thoughtful, and practical.
- Ask one coaching turn at a time when useful.
- A single turn may bundle a few tightly related clarifications from the same step.
- Use a default budget of no more than 5 questions total, including the opening prompt, unless more is clearly necessary to avoid a bad plan.
- Push for clarity when I am vague.
- Help me distinguish what is truly important from what merely feels urgent.
- Do not let me hide behind broad goals or fuzzy wording.
- If my plan is unrealistic, say so clearly and help me reduce scope.
- Stop asking questions once the plan is good enough to be realistic and trackable.
- Avoid motivational fluff.

Your objective:
Help me identify the most important 1, 2, or 3 tasks for today, with realistic estimates.

Important distinction:
- A task or goal may have a large total remaining size, for example 40 hours of work.
- But I may only want to spend 5 hours on it today.
- You must explicitly separate:
  1. total remaining effort
  2. intended work time for today

You must coach me to produce:
- the 1-3 most important tasks for today
- a short success definition for each
- estimated total remaining effort for each task
- intended hours for today for each task
- intended total work hours for today overall
- allowed support work for each task
- likely confusion points or detours that should still count as valid support work

How to run the conversation:
1. First, understand my current situation and possible obligations.
2. Then force prioritization down to at most 3 important tasks.
3. Challenge unrealistic scope.
4. Gather task definitions efficiently by grouping related clarifications instead of asking a separate question for every field.
5. Help me separate deep work from support work.
6. Make sure the plan is concrete enough that software can later track it.
7. When the plan is good enough, stop asking questions and produce the final output exactly in the format below.

Things you should actively coach for:
- What is the real outcome, not just the activity?
- What would count as done or clearly moved forward today?
- Is this truly one of the top tasks, or should it be excluded?
- What part of this larger project belongs to today specifically?
- How many hours do I actually want to spend on focused work today?
- What support activities are legitimate parts of the work?
- Where am I likely to misclassify useful work as distraction or distraction as useful work?

If I give bad answers:
- Ask follow-up questions.
- Offer candidate interpretations.
- Ask me to choose.
- Reduce ambiguity.
- Prefer a compact clarifying question over a long chain of tiny questions.

Do not finish until you have enough clarity to produce the final block.
Do not keep asking questions just to make the plan more polished if it is already usable.

Final output requirements:
- Output only one final block when we are done.
- The block must be easy to copy back into software.
- Use the exact headings and field names below.

FINAL OUTPUT FORMAT

FOCUS_FOR_TODAY
Date: YYYY-MM-DD
TotalIntendedWorkHours: <number>
TaskCount: <1-3>

Task1Title: <text>
Task1SuccessDefinition: <text>
Task1TotalRemainingEffortHours: <number>
Task1IntendedHoursToday: <number>
Task1ProgressType: <time-based|milestone-based|artifact-based|hybrid>
Task1AllowedSupportWork: <comma-separated list>
Task1LikelyDetoursThatStillCount: <comma-separated list>

Task2Title: <text or omit if not used>
Task2SuccessDefinition: <text or omit if not used>
Task2TotalRemainingEffortHours: <number or omit if not used>
Task2IntendedHoursToday: <number or omit if not used>
Task2ProgressType: <time-based|milestone-based|artifact-based|hybrid or omit if not used>
Task2AllowedSupportWork: <comma-separated list or omit if not used>
Task2LikelyDetoursThatStillCount: <comma-separated list or omit if not used>

Task3Title: <text or omit if not used>
Task3SuccessDefinition: <text or omit if not used>
Task3TotalRemainingEffortHours: <number or omit if not used>
Task3IntendedHoursToday: <number or omit if not used>
Task3ProgressType: <time-based|milestone-based|artifact-based|hybrid or omit if not used>
Task3AllowedSupportWork: <comma-separated list or omit if not used>
Task3LikelyDetoursThatStillCount: <comma-separated list or omit if not used>

NotesForTracker: <short text>
END_FOCUS_FOR_TODAY

Here is the local context packet to use:
<INSERT_MORNING_CONTEXT_PACKET_HERE>
```

### Evening Workflow

The evening workflow should be:

1. local app gathers the day’s structured evidence
2. local app builds a detailed `Evening Debrief Packet`
3. local app renders a detailed `ChatGPT Evening Debrief Prompt`
4. user copies both into ChatGPT
5. ChatGPT runs the reflective debrief discussion
6. user copies the final structured debrief result back into the app
7. local app validates and stores only that result

The evening packet should be detailed and evidence-rich.

It should include:

- imported morning plan
- progress snapshots
- aligned work blocks
- support work blocks
- ambiguous windows
- corrections
- pauses and breaks
- estimate vs actual signals
- candidate memory updates
- unresolved questions

### Evening Prompt Template

The app should generate a prompt substantially like this:

```text
You are my evening debrief coach.

Your job is to help me understand what really happened today, what genuinely counted as progress, what was ambiguous, what I learned, and what should carry forward.

Coaching style:
- Be honest, calm, and specific.
- Avoid guilt, shaming, and fake productivity judgments.
- Help me interpret the evidence.
- Ask follow-up questions where the evidence is unclear.
- Separate real progress from mere activity.
- Help me identify what should be remembered by my local focus-tracking software.

Your objective:
Use the debrief packet below to run a structured end-of-day debrief conversation with me.

You should help me clarify:
- what truly moved forward
- what did not move forward
- what looked ambiguous but was actually valid work
- what looked valid but was actually drift
- what support work should be remembered for future classification
- what task boundaries should be corrected
- what should carry into tomorrow

Rules:
- Do not moralize.
- Do not reduce the discussion to a vague summary.
- Use the packet evidence actively.
- Ask direct questions when the packet is inconclusive.
- Prefer concrete interpretations over abstract advice.

End goal:
Produce one strict final block that I can paste back into my software.

FINAL OUTPUT FORMAT

EVENING_DEBRIEF_RESULT
Date: YYYY-MM-DD
OverallDaySummary: <short text>

Task1Outcome: <text>
Task1DidProgressOccur: <yes|no|partial>
Task1WhatCountedAsRealProgress: <text>
Task1WhatWasSupportWork: <text>
Task1WhatWasMisclassifiedOrAmbiguous: <text>

Task2Outcome: <text or omit if not used>
Task2DidProgressOccur: <yes|no|partial or omit if not used>
Task2WhatCountedAsRealProgress: <text or omit if not used>
Task2WhatWasSupportWork: <text or omit if not used>
Task2WhatWasMisclassifiedOrAmbiguous: <text or omit if not used>

Task3Outcome: <text or omit if not used>
Task3DidProgressOccur: <yes|no|partial or omit if not used>
Task3WhatCountedAsRealProgress: <text or omit if not used>
Task3WhatWasSupportWork: <text or omit if not used>
Task3WhatWasMisclassifiedOrAmbiguous: <text or omit if not used>

NewSupportPatternsToRemember: <comma-separated list>
PatternsToNotRemember: <comma-separated list>
CorrectionsForTaskBoundaries: <text>
CarryForwardToTomorrow: <text>
CoachingNoteForTomorrow: <short text>
END_EVENING_DEBRIEF_RESULT

Here is the detailed local debrief packet:
<INSERT_EVENING_DEBRIEF_PACKET_HERE>
```

### Logic Layer Testing Plan

The logic layer should have its own test suite and must be runnable without the macOS UI.

Recommended test stack:

- `Vitest` for unit and integration tests
- `TypeScript` strict mode enabled
- test fixtures for evidence windows, plans, and ambiguity answers
- in-memory or temporary SQLite databases for repository tests
- parser tests for imported morning and evening payloads
- snapshot or golden tests for generated prompt templates and export packets

Test categories:

#### 1. Unit Tests

Test pure domain logic in isolation:

- planner output normalization
- morning prompt generation
- morning import parsing and validation
- evidence scoring
- ambiguity thresholds
- goal matching
- progress estimation
- state transitions
- memory promotion rules
- reminder cooldown rules
- evening debrief packet generation
- evening prompt generation
- evening import parsing and validation

These tests should not touch real databases, real network calls, or UI code.

#### 2. Contract Tests

Test ports and adapters against stable contracts:

- Screenpipe adapter converts raw inputs into normalized evidence correctly
- SQLite repositories satisfy expected read/write behavior
- LLM adapter returns validated schemas only
- UI bridge receives only serialized view models, not internal mutable state

#### 3. Integration Tests

Test realistic logic flows across modules:

- morning packet created, prompt generated, structured focus imported, daily plan stored
- daily plan created, evidence ingested, ambiguity asked, correction stored, memory updated
- work episode matched to goal, progress snapshot written, dashboard state updated
- evening debrief packet generated, structured debrief imported, learning updates staged
- compaction flush writes durable facts before session compression

These tests should exercise the application layer with real adapters only where useful.

#### 4. Regression Tests

Every bug in classification, ambiguity handling, or memory promotion should produce a regression test using the exact evidence pattern that failed.

#### 5. Evaluation Fixtures

Create a growing fixture library of real or synthetic examples such as:

- realistic morning planning imports
- obvious on-task work
- valid support work
- soft drift
- hard drift
- ambiguous research
- repeated admin patterns
- realistic evening debrief imports
- memory promotion and non-promotion cases

This becomes the long-term reliability suite for the logic layer.

### Independent Testing Rule

The logic layer test suite must be runnable on its own.

Passing criteria:

- logic tests pass without launching the UI
- UI tests can mock the logic boundary
- no test in the logic suite imports UI frameworks
- no business-rule assertion depends on visual components

## 3. UI Layer

The UI should stay native, sparse, and easy to trust.

### Primary Surface: Menu Bar

The menu bar is the always-visible control surface.

It should show:

- current top goal or focus block
- current inferred state
- progress or alignment summary
- confidence
- timer
- pause / snooze / break controls

Suggested color model:

- `green` = aligned with active priority
- `blue` = supporting work
- `yellow` = uncertain or soft drift
- `red` = hard drift or off-goal
- `gray` = break, idle, or paused

### Secondary Surface: Dashboard

This screen should show:

- today’s goals and priorities
- progress vs estimate
- milestones
- recent evidence summary
- corrections history
- major ambiguous periods
- end-of-day review

It should explain `why` the system made a judgment.

### Tertiary Surface: Clarification Popover

Use a small anchored popover for fast corrections.

Typical actions:

- this belongs to Goal 1
- this belongs to Goal 2
- this was support work
- this belongs to a known work group
- this was an intentional detour
- this was a break
- remember this pattern for later
- pause coaching for 10 minutes

This interaction should be resolvable in a few seconds.

### Notifications

Use local notifications only for high-value moments:

- earned praise after sustained aligned work
- drift reminders after stable off-task evidence
- clarification requests when ambiguity persists
- risk prompts when a key goal is materially behind plan

Do not use notifications for chatter.

## Data Ownership

The canonical store should be the app’s own SQLite database.

Suggested tables:

- `sessions`
- `session_events`
- `goals`
- `daily_goal_plans`
- `focus_blocks`
- `goal_milestones`
- `context_rules`
- `work_groups`
- `work_group_rules`
- `daily_memory_notes`
- `durable_memory_items`
- `memory_candidates`
- `memory_promotions`
- `memory_retrieval_chunks`
- `observed_episodes`
- `focus_classifications`
- `goal_matches`
- `progress_snapshots`
- `user_corrections`
- `labeled_examples`
- `ambiguity_events`
- `coach_events`
- `notification_history`

Additional table intent:

- `sessions`
  logical session boundaries for runtime and review
- `session_events`
  append-only transcript and decision history for audit and replay
- `work_groups`
  reusable categories like admin, research, launch coordination, review work
- `work_group_rules`
  learned patterns associated with those categories
- `daily_memory_notes`
  short-lived working memory entries for a given day
- `durable_memory_items`
  compact long-term memory entries the system should keep reusing
- `memory_candidates`
  unpromoted possible durable memories collected from learning
- `memory_promotions`
  audit trail for what was promoted, rejected, or downgraded
- `memory_retrieval_chunks`
  chunked searchable units for hybrid retrieval
- `labeled_examples`
  user-confirmed ambiguous episodes used for learning
- `ambiguity_events`
  prompts shown, answers given, and whether the memory should be updated

Screenpipe remains the ingestion memory and evidence source.

If useful, selected compact facts can be mirrored back into Screenpipe memories, but the app DB remains canonical.

For inspectability, the system may also generate concise human-readable mirrors inspired by OpenClaw:

- `MEMORY.md`
  readable durable memory summary
- `memory/YYYY-MM-DD.md`
  readable daily working memory
- `MEMORY_REVIEW.md`
  promotion and curation log

These files should be generated from or synchronized with the canonical SQLite store, not treated as the single source of truth.

## Product Rules

- never moralize or shame
- always allow pause, snooze, break, and override
- optimize for autonomy and competence support
- keep feedback specific, rare, and earned
- prefer explainability over fake precision
- learn from corrections, not from blind tool stereotypes

## V1 Recommendation

The strongest V1 is:

- a native macOS menu bar app
- ScreenPi / Screenpipe as context gathering
- one app-owned logic core
- one local SQLite database
- deterministic state machine and scoring pipeline
- optional local AI for ambiguity and summaries only
- menu bar, popover, notifications, morning prompt export/import, and evening debrief export/import

## Final Design Rule

Do not classify apps.

Classify whether the recent evidence is advancing the user’s declared focus or goals.
