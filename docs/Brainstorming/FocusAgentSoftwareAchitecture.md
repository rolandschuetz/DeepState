# FocusAgent Software Architecture

## Goal

Build a local-first `FocusAgent` that helps a user stay aligned with a declared priority, recognizes `soft drifts` and `hard drifts`, learns from corrections, and stays psychologically supportive instead of becoming another distraction.

The system should be split into three explicit layers:

1. `UI layer`
2. `Logic layer`
3. `screenpi.pe input layer`

This follows the strongest pattern from `Brainstorming/Psychology.md` and `Brainstorming/System-Design.md`:

- `screenpi.pe` / Screenpipe should remain the sensing and memory substrate.
- The FocusAgent should own judgment, learning, and intervention policy.
- The Mac app should own user interaction, visibility, and trust.

## Core Design Principle

Do not build a chatbot that watches the user.

Build a `self-authored focus coach` with:

- morning priority declaration
- conservative daytime classification
- rare and precise interventions
- one-click correction flows
- end-of-day learning

The architecture should optimize for:

- low interruption cost
- high interpretability
- local ownership of data
- incremental learning from corrections
- separation of sensing from judgment

## Layered Architecture

```text
[ UI Layer ]
  Menu bar status
  Popover / correction UI
  Local notifications
  Settings / review screens

          |
          v

[ Logic Layer ]
  Planner
  Activity Aggregator
  Drift Classifier
  Decision Engine
  Reinforcement Engine
  Learning Engine
  Local Coach DB

          |
          v

[ screenpi.pe Input Layer ]
  /ws/events
  /search
  /elements
  /ui-events
  /frames/{id}/context
  local screenpipe memory
```

## 1. screenpi.pe Input Layer

This layer is responsible only for `observation`, not judgment.

### Responsibilities

- subscribe to real-time activity from Screenpipe
- fetch recent evidence windows
- normalize raw events into a common internal format
- attach references back to Screenpipe artifacts
- never store duplicate raw capture unless strictly needed

### Input Sources

- `app name`
- `window title`
- `browser URL`
- `OCR / accessibility text`
- `UI elements`
- `input events` such as typing, click, scroll, clipboard, app switch
- optional `audio transcript` for meetings or spoken planning

### Output Contract

The input layer should emit normalized `ActivityEvidence` objects to the logic layer.

Example:

```json
{
  "window_start": "2026-04-18T09:15:00Z",
  "window_end": "2026-04-18T09:15:15Z",
  "active_app": "Google Chrome",
  "window_title": "Pricing comparison - Competitor X",
  "browser_url": "https://competitor.com/pricing",
  "keywords": ["pricing", "plan", "enterprise"],
  "ui_actions": ["scroll", "typing"],
  "screenpipe_refs": {
    "frame_ids": [123, 124],
    "search_query_id": "recent_window_918"
  }
}
```

### Why this separation matters

If Screenpipe owns classification, the product becomes hard to debug and hard to evolve.

If Screenpipe stays the input layer:

- the sensing substrate can improve independently
- the FocusAgent can change rules without touching capture
- the UI can explain decisions in product language instead of raw capture language

## 2. Logic Layer

This is the actual FocusAgent.

The logic layer should be implemented as a deterministic application core with selective LLM use only for ambiguity and language generation.

### Internal Modules

#### 2.1 Planner

Runs at:

- morning start
- first meaningful work signal of the day
- manual restart after a break

Collects:

- top priority
- optional supporting priorities
- definition of done
- allowed tools, URLs, people, windows
- expected detours
- forbidden distractions
- focus block duration
- reminder style

Output:

- `DailyPlan`
- `TaskContextRules`

#### 2.2 Activity Aggregator

Consumes raw `ActivityEvidence` and builds rolling windows.

Recommended windows:

- ingest every `10-15s`
- aggregate over `60-90s`
- maintain recent context over `2-5m`

Purpose:

- smooth noisy app switches
- detect whether a context is sustained or momentary
- infer sequence context, not just current app

#### 2.3 Drift Classifier

Classifies current activity into:

- `on_task`
- `supporting_task`
- `soft_drift`
- `hard_drift`
- `uncertain`
- `intentional_break`
- `meeting`
- `idle`
- `paused`

This should use a hierarchy:

1. deterministic rules
2. weighted signal scoring
3. semantic LLM fallback
4. user clarification if uncertainty persists

#### 2.4 Decision Engine

Converts classification into state transitions and intervention decisions.

Owns:

- hysteresis
- confidence thresholds
- cooldowns
- no-interrupt windows
- escalation ladder

#### 2.5 Reinforcement Engine

Generates three kinds of responses:

- `praise`
- `redirect`
- `clarify`

Rules:

- praise should be rare, earned, and specific
- redirect should be autonomy-supportive, not moralizing
- clarify should be one-click and fast

#### 2.6 Learning Engine

Learns from:

- explicit user corrections
- accepted reminders
- dismissed reminders
- stable high-confidence aligned blocks
- recurring false positives
- recurring false negatives

Output:

- updated signal weights
- new contextual rules
- better task associations

### Canonical Data Store

Use a separate local SQLite database for the FocusAgent, not the Screenpipe DB.

Suggested entities:

- `tasks`
- `daily_plans`
- `task_rules`
- `allowed_detours`
- `observations`
- `classifications`
- `drift_events`
- `coach_events`
- `user_corrections`
- `focus_sessions`
- `tool_affinities`
- `notification_history`

## 3. UI Layer

The UI layer should be thin, glanceable, and non-intrusive.

### Primary Surface: Menu Bar

Always-visible status:

- current declared priority
- current inferred state
- confidence
- block timer
- color state

Recommended colors:

- `green` = aligned
- `yellow` = uncertain / soft drift risk
- `red` = hard drift
- `gray` = paused / break / idle

### Secondary Surface: Local Notifications

Use only for:

- milestone praise after sustained aligned work
- drift reminder after stable drift
- clarification request when ambiguity persists

Never use notifications for chatter.

### Tertiary Surface: Popover / Quick Correction

Used when the user needs to teach the model quickly.

Actions:

- belongs to current task
- belongs to another task
- intentional detour
- break
- pause coaching 10m

### Settings / Review

Needed for:

- editing tasks and rules
- changing coaching tone
- reviewing daily summaries
- correcting major ambiguous blocks
- managing exclusions and trust settings

## Soft Drift vs Hard Drift

This is the key behavioral distinction.

### Soft Drift

A `soft drift` is a context shift that is not clearly wrong, but is no longer strongly advancing the declared outcome.

Examples:

- opening Slack during a deep work block
- research that might still support the task
- checking email without explicit admin mode
- switching to a browser tab with loosely related material

Properties:

- ambiguous or partially legitimate
- often recoverable without interruption
- should first show up as a silent state change or gentle reminder

Soft drift should typically trigger:

1. menu bar color change
2. no prompt for a short dwell period
3. soft reminder only if sustained

### Hard Drift

A `hard drift` is a context shift with strong evidence that the activity is outside the declared focus block.

Examples:

- social media unrelated to the task
- entertainment or personal browsing during a focus block
- unrelated shopping, banking, or messaging
- jumping to a different project with no declared detour

Properties:

- high confidence mismatch
- low ambiguity
- stronger intervention is justified

Hard drift should typically trigger:

1. state transition to `hard_drift`
2. short confirmation dwell
3. redirect notification or popover
4. cooldown after intervention

## Drift Detection Plan

### Signal Model

The system should not learn `tool -> task` as a flat truth.

It should learn `evidence patterns -> task likelihood`.

Signals can include:

- app
- URL/domain/path
- window title
- keywords in OCR/accessibility text
- UI element labels
- people names
- repo or file names
- recent sequence context
- time block mode

Each signal should have:

- `polarity`: positive, negative, conditional
- `weight`
- `scope`
- `confidence`
- `source`: user, learned, inferred

### Scoring Strategy

For each rolling window:

1. score evidence against active task
2. score evidence against allowed detours
3. score evidence against known distraction patterns
4. compute confidence and drift severity

Suggested bands:

- `>= 0.75`: on_task
- `0.45 - 0.74`: supporting_task or uncertain
- `0.25 - 0.44`: soft_drift
- `< 0.25`: hard_drift

These values should be configurable.

### Time-Based State Rules

Recommended V1 defaults:

- `soft drift watch`: 30-60s sustained weak alignment
- `soft drift reminder`: 90-120s
- `hard drift confirm`: 30-60s
- `uncertain ask`: 30-45s stable ambiguity
- `praise`: after 25-30m of stable aligned work
- `cooldown`: 10-15m after any explicit interruption

The point is to classify quickly but interrupt slowly.

## State Machine

```text
paused
  -> planning
  -> on_task

on_task
  -> supporting_task
  -> soft_drift
  -> uncertain
  -> break
  -> meeting

supporting_task
  -> on_task
  -> soft_drift
  -> uncertain

soft_drift
  -> on_task
  -> supporting_task
  -> hard_drift
  -> uncertain

hard_drift
  -> on_task
  -> intentional_break
  -> paused

uncertain
  -> on_task
  -> supporting_task
  -> soft_drift
  -> hard_drift

break / meeting / idle
  -> planning
  -> on_task
```

## Intervention Policy

The escalation ladder should be:

1. `silent`
   menu bar state only
2. `soft`
   short reminder
3. `clarify`
   one-click correction prompt
4. `manual lock-in mode`
   optional future mode, only user-enabled

### Message Design Rules

- never shame
- never exaggerate
- never interrupt too often
- always preserve user autonomy
- always make recovery easy

Good examples:

- `This looks slightly outside your current block. Return now or mark it intentional.`
- `I am not sure if this supports Pricing Page or Admin. Which is it?`
- `28 minutes clean on your top priority. Keep going.`

## Daily Learning Loop

At end of day, the system should:

1. summarize aligned focus blocks
2. show major ambiguous windows
3. ask for fast relabeling on the most important unknown chunks
4. update task rules
5. store compact learnings for tomorrow

This is where long-term accuracy should improve.

## V1 Delivery Plan

### Phase 1: Foundation

- create native Mac menu bar shell
- launch at login
- connect to Screenpipe local endpoints
- build local FocusAgent SQLite schema
- implement planner flow

### Phase 2: Core Classification

- normalize Screenpipe activity windows
- implement deterministic rules
- implement weighted scoring
- add soft drift / hard drift distinction
- add state machine and cooldowns

### Phase 3: Feedback

- menu bar state colors
- local notifications
- quick correction popover
- pause / break / intentional detour actions

### Phase 4: Learning

- save corrections
- update signal weights
- detect recurring false alarms
- generate end-of-day review

### Phase 5: Optional V2

- LLM ambiguity resolution
- overnight rule compaction
- richer meeting detection
- cross-device sync
- optional stricter focus mode

## Recommended Technical Boundary

### UI Layer

Should know:

- current state
- current task
- recommended user action

Should not know:

- raw Screenpipe query logic
- scoring internals
- learning internals

### Logic Layer

Should know:

- all policies
- all thresholds
- scoring and drift rules
- learning behavior

Should not know:

- SwiftUI presentation details
- direct menu bar rendering

### screenpi.pe Input Layer

Should know:

- Screenpipe API contracts
- event ingestion
- normalization
- reference linking

Should not know:

- what counts as praise
- what counts as soft or hard drift in product terms
- UI behavior

## Final Product Decision

The best V1 is:

- `screenpi.pe / Screenpipe` as the local input and memory layer
- one local `FocusAgent logic core` as the behavioral brain
- one native `Mac UI shell` as the interaction surface

The system should classify `progress toward the declared outcome`, not just app usage.

That is the difference between a real focus coach and an annoying activity monitor.
