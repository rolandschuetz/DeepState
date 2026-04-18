# Local-First AI Layer with Gemma 4 and Ollama

This plan assumes the core product remains a local-first focus coach built on top of ScreenPipe. The AI layer should support that architecture, not replace it.

## Core Principle

Use Gemma 4 through Ollama as a narrow local reasoning service.

Do not make the LLM the main runtime brain.

The main product logic should still live in code:

- ScreenPipe = sensing and raw memory
- Coach Core = state machine, policies, thresholds, cooldowns, reinforcement logic
- Coach DB = canonical local product memory
- Ollama + Gemma 4 = ambiguity resolution, planning help, summaries, rule proposals

The decisive rule is:

Classify progress and intent, not apps.

## Why this is the right split

The two brainstorming documents converge on the same product truth:

- deterministic logic should handle most classifications
- the system should interrupt rarely and conservatively
- learning should come from corrections and evidence
- the product must remain privacy-preserving and user-owned

Putting Gemma 4 behind Ollama supports that well:

- everything stays local on-device
- no cloud dependency is required for the core loop
- the AI layer can be swapped or upgraded without rewriting the coach
- we can constrain model outputs with structured JSON
- we avoid turning the product into a prompt soup

## Recommended AI Responsibilities

Gemma 4 should only be used for tasks where local heuristics are too rigid and full determinism is not enough.

### 1. Morning planning

Turn a freeform user intention into structured plan objects:

- top priorities
- definition of done
- allowed contexts
- forbidden contexts
- valid detours
- reminder preferences
- if-then recovery rules

Example output:

- task title
- success definition
- valid apps and domains
- likely distractors
- supporting contexts
- escalation preference

### 2. Ambiguity classification

Call Gemma 4 only when:

- deterministic rules conflict
- weighted evidence remains inconclusive
- a novel context appears
- there is a likely task switch
- a new correction should be generalized

This should happen after a dwell window, not on every polling cycle.

### 3. Coach message drafting

Use the model to phrase:

- competence-supportive praise
- autonomy-supportive drift reminders
- uncertainty prompts
- end-of-day review language

The model should not decide whether to interrupt. It should only draft the message once the state machine already decided that a message is justified.

### 4. Nightly learning and compaction

Use the model to:

- summarize correction patterns
- propose new task signals
- identify false-positive patterns
- compress labeled examples into reusable rules
- draft end-of-day summaries

These should be written back as proposed updates, not silently promoted into truth.

## What Gemma 4 should not do

Do not use Gemma 4:

- on every 10 to 15 second runtime tick
- as the canonical state machine
- as the source of truth for task alignment
- as a replacement for the local DB schema
- as the only learning mechanism
- as a constant chat companion

The product should feel like a self-authored focus coach, not a chatbot that is watching the user.

## Proposed Local AI Stack

### Inference runtime

- Ollama running locally on `localhost:11434`
- Coach Core talks to Ollama through a small internal adapter
- All model interactions use strict schemas and short bounded prompts

### Models

Use a tiered setup:

- `gemma4:e4b`
  - default live model
  - ambiguity classification
  - short coach copy
  - lightweight planning
- `gemma4:e2b`
  - low-power fallback
  - emergency degraded mode
- `gemma4:26b`
  - heavier nightly summaries
  - rule compaction
  - more difficult planning or synthesis
- `embeddinggemma`
  - embeddings for retrieval over local memory and labeled examples

I would start with `gemma4:e4b` as the main real-time model because it is the best balance between responsiveness and local capability. `gemma4:26b` should be optional and only used when the machine can support it without harming the UX.

## Retrieval Layer

Do not send large raw histories into the model.

Instead, add a local retrieval layer based on `embeddinggemma`.

Embed and index:

- task definitions
- daily plans
- user corrections
- labeled examples
- known false positives
- known valid detours
- signal patterns derived from previous days

At inference time, retrieve only the top relevant items and include those in the prompt.

This keeps prompts:

- small
- fast
- explainable
- grounded in the user’s own corrections

## Proposed Runtime Pipeline

### Fast loop

Every 10 to 15 seconds:

1. Pull or subscribe to new ScreenPipe events
2. Build a rolling snapshot for the last 60 to 180 seconds
3. Extract compact evidence:
   - active app
   - browser URL
   - window title
   - OCR/accessibility text summary
   - input events
   - recent sequence context
4. Run deterministic rules first
5. Run weighted evidence scoring second
6. Retrieve top similar labeled examples with `embeddinggemma`
7. If still uncertain, call Gemma 4
8. Feed the structured result back into the state machine
9. Decide whether to stay silent, prompt, praise, or ask for clarification

### Decision order

The order should always be:

1. hard rules
2. weighted scoring
3. retrieval
4. LLM
5. user clarification

That order is important for speed, cost, privacy, and behavioral stability.

## Structured Prompt Contract

All runtime model calls should return strict JSON.

Suggested ambiguity output:

```json
{
  "classification": "on_task",
  "task_id": "task_pricing_page",
  "confidence": 0.82,
  "reason_codes": [
    "recent_sequence_support",
    "matching_project_keywords",
    "allowed_browser_context"
  ],
  "supporting_evidence": [
    "url contains competitor domain",
    "recent context includes Figma and Notion spec"
  ],
  "proposed_signal_updates": [
    {
      "signal_type": "domain",
      "pattern": "competitor-example.com",
      "polarity": "positive",
      "weight": 0.45
    }
  ]
}
```

Suggested states:

- `on_task`
- `supporting_task`
- `off_task`
- `uncertain`
- `break`
- `meeting`
- `paused`

The state machine in code should validate and clamp all model outputs before using them.

## Suggested Internal AI API

The Coach Core should not call Ollama ad hoc from random code paths. Create one internal AI service with a narrow interface:

- `planDay(input) -> StructuredDayPlan`
- `classifyAmbiguity(input) -> AmbiguityResult`
- `draftCoachMessage(input) -> CoachMessage`
- `summarizeDay(input) -> DaySummary`
- `proposeRuleUpdates(input) -> RuleUpdateProposal[]`
- `embedTexts(input) -> Vector[]`

That makes the AI layer replaceable and testable.

## Local Data Ownership

The canonical store should remain a separate local SQLite database controlled by the app.

Recommended categories:

- tasks
- daily_plans
- task_signals
- observations
- user_corrections
- focus_sessions
- coach_events
- retrieval_documents
- embedding_index_metadata

ScreenPipe remains the ingestion memory, not the app’s canonical schema.

## Safety and Reliability Rules

The AI layer must be conservative.

### Runtime rules

- time out model calls aggressively
- cache recent classifications when context has not materially changed
- never interrupt solely because the model had a low-confidence guess
- require dwell-time before reminders
- require stronger confidence before praise than before silence
- cap model calls per hour

### Product rules

- always allow pause, snooze, break, and override
- never moralize or shame
- never report fake precision like "41 percent inefficient"
- never let the AI silently rewrite the user’s goals

## Phased Rollout Plan

### Phase 1: Local AI adapter

Build the Ollama integration layer only.

Deliverables:

- local AI service wrapper
- schema-validated responses
- prompt templates in versioned files
- model selection config
- timeout and retry policy

### Phase 2: Planning + ambiguity only

Use Gemma 4 for:

- morning planning
- uncertainty resolution
- coach copy drafting

Keep all primary runtime classification deterministic and rule-heavy.

### Phase 3: Retrieval over corrections

Add `embeddinggemma` and local retrieval for:

- user corrections
- task examples
- valid detours
- false-positive memory

This is where the system starts feeling personalized without becoming opaque.

### Phase 4: Nightly learning

Add nightly or end-of-day compaction:

- summarize ambiguous chunks
- propose new task signals
- update retrieval documents
- suggest rule weight changes

These should be reviewable and reversible.

### Phase 5: Optional multimodal enrichment

Only after the text-first version is stable:

- optional screenshot-based ambiguity resolution
- optional richer visual context
- optional meeting and spoken-topic classification

This should not block v1.

## V1 Recommendation

The simplest strong v1 is:

- ScreenPipe for sensing
- one native local coach core
- one local SQLite database
- one Ollama adapter
- `gemma4:e4b` for ambiguity and planning
- `embeddinggemma` for retrieval
- deterministic state machine as the main runtime brain

That gives a real local-first AI layer without making the product fragile, expensive, or psychologically noisy.

## Final Product Rule

The AI layer should make the coach more adaptive, not more talkative.

If the model is working correctly, the user should mostly notice:

- fewer false alarms
- better ambiguity handling
- better daily planning
- better summaries
- better learning from corrections

They should not feel that an LLM is constantly sitting in the loop.
