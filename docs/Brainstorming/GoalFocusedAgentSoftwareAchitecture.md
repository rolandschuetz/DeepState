# GoalFocusedAgent Software Architecture

## Goal

Build a local-first `GoalAgent` that tracks progress toward the `main goals of the day`, estimates how far each goal has advanced, identifies when the user is drifting away from those goals, and updates itself on a `few-minute cadence` instead of trying to react to every single UI event.

The system should be split into three explicit layers:

1. `UI layer`
2. `Logic layer`
3. `Screenpipe input layer`

This follows the strongest pattern from `Brainstorming/Psychology.md` and `Brainstorming/System-Design.md`:

- `Screenpipe` should stay the sensing and evidence layer.
- The app-owned `GoalAgent` should own judgment, progress estimation, learning, and policy.
- The Mac UI should stay thin, explainable, and easy to override.

## Product Position

This is not a chatbot and not just a focus timer.

It is a `goal-progress coach` with one core job:

- understand the user’s declared daily goals
- observe what the user is actually doing
- estimate whether that work moves a declared goal forward
- keep a running progress model with confidence and remaining-risk estimates
- surface only sparse, useful feedback

The key distinction is:

- `FocusAgent` asks: "Are you on the current task right now?"
- `GoalAgent` asks: "Is the last few minutes of work moving one of today’s important goals forward, and by how much?"

That makes the architecture slightly different. The runtime should be `episode-based`, not tick-based.

## Core Design Principle

Do not classify apps.

Classify `progress toward goals`.

That means the system must reason on three levels:

1. `Declared goal`
2. `Observed work episode`
3. `Estimated contribution of that episode to goal progress`

This avoids the weak model of:

- `Chrome = distraction`
- `Slack = off task`
- `Terminal = productive`

Instead, it supports the stronger model:

- `Chrome + pricing research + current goal = valid progress`
- `Slack + collaborator + launch discussion = support work`
- `Terminal + unrelated side project repo = off-goal drift`

## Recommended Architecture

```text
[ UI Layer ]
  Daily goals setup
  Menu bar summary
  Goal progress dashboard
  Clarification popovers
  Sparse notifications
  Review/history screens

          |
          v

[ Logic Layer ]
  Goal Planner
  Episode Builder
  Goal Matcher
  Progress Estimator
  Schedule / Cadence Engine
  Intervention Policy
  Learning Engine
  GoalAgent DB

          |
          v

[ Screenpipe Input Layer ]
  /ws/events or recent polling
  /search
  /elements
  /frames/{id}/context
  local Screenpipe evidence store
```

## Why This Split Is Correct

### Screenpipe input layer

Screenpipe already gives the product the hard part:

- screen and app context
- browser URL context
- OCR and accessibility text
- UI element text
- user input events
- timestamps and local history

That makes it an excellent `input layer`.

It should not become the canonical place for:

- goal definitions
- progress estimation rules
- state transitions
- learning logic
- product-specific schema

### Logic layer

The real `GoalAgent` belongs here because the important behavior is deterministic and stateful:

- how goals are defined
- how evidence is grouped into episodes
- how progress is estimated
- when ambiguity is high enough to ask the user
- how confidence changes over time
- when to stay silent

### UI layer

The UI should only:

- collect the daily goal contract
- show current inferred direction
- show progress estimates and confidence
- allow fast correction
- expose review and settings

It should not own business logic.

## Runtime Model

The `GoalAgent` should run on a `few-minute cadence`, not continuously interrupt the user.

Recommended default cadence:

- `every 3 minutes` while user activity is present
- `every 10 minutes` while idle or in break mode
- immediate manual refresh when the user opens the menu bar or submits a correction

This cadence is the right compromise for a goal-tracking product:

- fast enough to keep progress fresh
- slow enough to avoid jitter and overreaction
- better aligned with daily-goal estimation than second-by-second monitoring

## Input Layer: Screenpipe Adapter

This layer should normalize Screenpipe data into internal evidence windows.

### Responsibilities

- fetch the last `3-5 minutes` of evidence
- normalize app / URL / window / OCR / UI text into one structure
- keep references back to Screenpipe records
- avoid duplicating raw media
- expose a clean contract to the logic layer

### Internal Output Contract

The Screenpipe adapter should emit `ObservedEpisodeInput` objects.

Example:

```json
{
  "episode_start": "2026-04-18T09:12:00Z",
  "episode_end": "2026-04-18T09:15:00Z",
  "active_apps": ["Cursor", "Google Chrome"],
  "urls": [
    "https://linear.app/acme/issue/123",
    "https://docs.stripe.com/payments"
  ],
  "window_titles": [
    "checkout.tsx - acme-web",
    "Stripe Docs - Payments"
  ],
  "keywords": ["checkout", "pricing", "payment", "launch"],
  "interaction_summary": {
    "typing_seconds": 96,
    "scroll_events": 14,
    "app_switches": 2
  },
  "screenpipe_refs": {
    "frame_ids": [1001, 1002, 1008],
    "element_ids": [42, 44]
  }
}
```

### Important Boundary

The input layer may compute `summaries`.

It must not decide:

- which goal this belongs to
- how much progress was made
- whether the user should be interrupted

Those decisions belong to the logic layer.

## Logic Layer

This is the actual product brain.

It should be implemented as deterministic application logic with selective LLM use only for:

- ambiguous goal matching
- converting user-written goal text into initial structured rules
- generating natural-language summaries

The LLM should not be the default runtime loop.

## Logic Modules

### 1. Goal Planner

Runs:

- at first meaningful activity of the day
- when the user opens the app for the first time that day
- when the user starts a new plan manually

The planner should capture:

- `1-3 main goals` for the day
- success definition for each goal
- expected deliverable or visible output
- estimated total effort
- allowed support work
- expected detours
- reminder style
- whether progress is best measured by time, checklist, artifact, or hybrid evidence

The planner should convert each goal into a structured `GoalContract`.

Example:

```json
{
  "goal_title": "Ship pricing page revision",
  "success_definition": "New pricing page variant is implemented and reviewed",
  "estimate_type": "hybrid",
  "estimated_total_minutes": 180,
  "milestones": [
    "Decide pricing structure",
    "Implement page copy and layout",
    "Get review feedback"
  ],
  "allowed_contexts": [
    "Cursor in repo acme-web",
    "Figma pricing file",
    "Docs or research on SaaS pricing"
  ],
  "support_contexts": [
    "Slack with launch collaborators",
    "Linear issue discussion"
  ]
}
```

### 2. Episode Builder

This module turns raw evidence windows into `meaningful work episodes`.

Responsibilities:

- merge short context windows into one coherent episode
- distinguish quick context switches from real transitions
- preserve recent sequence context
- mark an episode as focused work, support work, break, or ambiguous

Recommended defaults:

- raw ingest window: `3 minutes`
- merge lookback: `9-15 minutes`
- minimum episode to estimate progress: `2 minutes`

### 3. Goal Matcher

This module asks:

`Which daily goal, if any, did this episode most likely support?`

It should use a hierarchy:

1. deterministic rules first
2. weighted evidence scoring second
3. semantic LLM fallback third
4. user clarification only when ambiguity persists

Inputs:

- active apps
- URLs
- window titles
- OCR / UI keywords
- recent continuity
- current daily plan
- prior user corrections

Outputs:

- `matched_goal_id`
- `match_type`: direct, supporting, ambiguous, none
- `confidence`
- `top_evidence`

### 4. Progress Estimator

This is the key module that makes the `GoalAgent` different from a basic focus coach.

The estimator should not assume that `time spent = progress`.

Instead, each goal should declare an `estimate mode`:

- `time-based`
  Best for tasks like admin blocks, meetings, outreach batches.
- `milestone-based`
  Best for goals with clear sub-steps.
- `artifact-based`
  Best for goals where visible deliverables matter.
- `hybrid`
  Best default for product and knowledge work.

### Progress estimation model

For each goal, maintain:

- `estimated_total_effort`
- `aligned_minutes`
- `support_minutes`
- `milestones_completed`
- `artifact_signals_detected`
- `last_progress_delta`
- `progress_percent`
- `confidence_percent`
- `risk_level`
- `eta_to_completion`

Recommended v1 formula for `hybrid` goals:

```text
progress_percent =
  0.40 * milestone_completion_ratio +
  0.35 * artifact_evidence_ratio +
  0.25 * normalized_aligned_time_ratio
```

Where:

- `milestone_completion_ratio` comes from user confirmations or strong evidence
- `artifact_evidence_ratio` comes from output signals like file changes, review comments handled, draft created, doc updated, PR opened
- `normalized_aligned_time_ratio` is capped progress from aligned work time vs estimate

Important rule:

`aligned time` can raise confidence, but should not alone imply completion.

### Confidence model

Track confidence separately from progress.

Example:

- `progress = 55%`
- `confidence = 82%`

This means:

- the system believes meaningful progress happened
- but it still treats the number as an estimate, not a fact

Confidence should increase when:

- evidence is stable
- the goal match is high-confidence
- artifacts are visible
- the user confirms milestones

Confidence should decrease when:

- the episode is ambiguous
- multiple goals compete for the same evidence
- progress is inferred from time only
- the user frequently corrects the classification

### 5. Schedule / Cadence Engine

This module owns the every-few-minutes loop.

The loop should be:

1. fetch recent Screenpipe evidence
2. build or extend an episode
3. match the episode to a goal
4. estimate progress delta
5. compare actual progress vs planned progress
6. decide whether to stay silent, update UI, or ask for clarification
7. persist a progress snapshot

Recommended thresholds:

- silent update for normal progress movement
- clarification only after `2 consecutive ambiguous cycles`
- drift reminder only after `2-3 cycles` with no match to any active goal
- cooldown after any prompt: `10 minutes`

### 6. Intervention Policy

This module converts estimates into user-facing behavior.

The agent should mostly be quiet.

Allowed intervention types:

- `ambient progress update`
  Menu bar state changes only.
- `clarification`
  "Was the last few minutes for Goal A, Goal B, or a break?"
- `risk prompt`
  "Goal 1 is behind plan by ~35 minutes. Continue or rescope?"
- `completion confirmation`
  "Looks like milestone 2 is done. Mark it complete?"

Not recommended for v1:

- moralizing drift messages
- reward spam
- second-by-second praise
- auto-blocking websites

### 7. Learning Engine

This module should learn from:

- user corrections
- manually completed milestones
- accepted or dismissed prompts
- stable repeated associations
- repeated false assumptions

It should update:

- goal-context rules
- support-work rules
- estimate reliability weights
- reminder aggressiveness preferences

Nightly or end-of-day learning is a good place for heavier summarization.

## GoalAgent Data Model

Use a separate local SQLite database owned by the app.

Suggested tables:

- `goals`
  Daily goal definitions and long-lived goal templates.
- `daily_goal_plans`
  Goal rank, estimate, target completion window, reminder preferences.
- `goal_milestones`
  Ordered sub-steps and completion state.
- `goal_context_rules`
  App, URL, window, keyword, repo, person, file, and negative rules.
- `observed_episodes`
  Aggregated 3-15 minute episodes with Screenpipe references.
- `goal_matches`
  Episode-to-goal classification results with confidence and evidence.
- `progress_snapshots`
  Point-in-time estimate of progress, confidence, risk, and ETA.
- `goal_artifacts`
  Optional visible deliverables such as docs changed, PR created, files touched.
- `user_corrections`
  Manual relabels, milestone confirmations, estimate adjustments.
- `agent_events`
  Prompts shown, notifications sent, clarifications answered.

## Progress Tracking Strategy

The critical product choice is to track `goal progress`, not only `time attribution`.

Each goal should therefore have two parallel measures:

1. `Effort progress`
   How much aligned work time has been invested?
2. `Outcome progress`
   How much visible completion signal exists?

The displayed progress bar should be the weighted combination of both.

Recommended UI display:

- `Goal A: 55% complete`
- `Confidence: High`
- `Behind estimate by ~20m`
- `Last evidence: coding + pricing research + review comment reply`

This is much more honest than a fake precision timer.

## UI Layer

The UI should stay thin and glanceable.

### Primary surface: Menu bar

Show:

- current top goal
- current inferred episode label
- progress percent
- confidence state
- risk state

Suggested states:

- `green` = aligned with top goal
- `blue` = aligned with a supporting goal
- `yellow` = ambiguous
- `red` = off-goal drift
- `gray` = break / idle / paused

### Secondary surface: Goal dashboard

This is where the user sees:

- today’s top goals
- estimate vs actual progress
- milestone completion
- remaining time estimate
- recent evidence summary
- corrections history

This screen should explain `why` the agent thinks a goal moved.

### Tertiary surface: Clarification popover

Use a small popover or HUD-style panel only for unresolved ambiguity.

Example actions:

- `This was Goal 1`
- `This was Goal 2`
- `This was support work`
- `This was a break`
- `Ignore this episode`

The interaction must be under `2 seconds`.

### Notifications

Use local notifications sparingly and only for:

- large deviation from plan
- milestone completion confirmation
- persistent ambiguity the user has ignored

Do not use notifications for routine praise every cycle.

## Screenpipe’s Role

Screenpipe should remain the `input layer`, not the `agent home`.

Use Screenpipe for:

- recent evidence retrieval
- historical context lookups
- optional memory mirroring
- optional scheduled summaries

Do not use Screenpipe pipes as the core `GoalAgent` loop.

Why:

- pipes are scheduled jobs, not the right place for canonical product state
- the main logic needs app-owned schema and state transitions
- progress estimation needs persistent local state across runs
- the UI needs a direct relationship with the logic layer

Screenpipe pipes are still useful for:

- morning summaries
- end-of-day reviews
- weekly analytics
- exporting progress notes elsewhere

## Recommended V1 Behavior

### Morning flow

1. User defines `1-3 main goals`
2. User adds success definitions and rough estimates
3. Agent generates initial context rules and milestone suggestions
4. User confirms or edits them

### Daytime loop

Every `3 minutes`:

1. fetch evidence from Screenpipe
2. update current episode
3. estimate contribution to goals
4. refresh dashboard and menu bar state
5. stay silent unless ambiguity or plan-risk crosses threshold

### End-of-day flow

1. summarize progress per goal
2. show estimate accuracy
3. ask which milestones were actually completed
4. learn better rules for tomorrow

## Recommended V1 Implementation Order

1. Build the `Goal Planner` and `daily goal schema`
2. Build the `Screenpipe adapter` and episode normalization
3. Build the `Goal Matcher`
4. Build the `Progress Estimator`
5. Build the `menu bar + dashboard UI`
6. Add clarification flows
7. Add learning and end-of-day review

## Hard Rules For The Architecture

- `UI layer` may collect input and display state, but not own goal logic.
- `Logic layer` is the only canonical place for matching, estimation, and policy.
- `Screenpipe input layer` may provide evidence and summaries, but not product judgment.
- Goal progress must always be stored with `confidence`, not as a fake absolute truth.
- Time spent should influence progress, but should never be the sole definition of progress.
- The agent should run on a `few-minute cadence`, with explicit cooldowns for prompts.

## Final Recommendation

The best setup is a `local Mac menu bar app` with a background helper that runs a `GoalAgent` every `3 minutes`, uses `Screenpipe` only as the input and evidence layer, stores all goal state and estimation logic in its own local DB, and shows progress through a thin UI composed of a menu bar summary, a dashboard, and sparse clarification popovers.

That gives the product the right separation:

- `UI layer` = trust, visibility, correction
- `Logic layer` = planning, matching, estimation, learning
- `Screenpipe input layer` = observation and evidence

And it gives the user the right experience:

- clear daily goals
- believable progress estimates
- low interruption cost
- local ownership of data
- a system that tracks movement toward outcomes, not just app usage
