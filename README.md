# DeepState - Local-only self-survailance

DeepState is a local-first macOS focus coach for people who do knowledge work on their computer and want gentle accountability during the workday.

The app is designed to act more like a calm "boss" or coach than a timer or blocker. Instead of simply tracking app usage, it tries to understand what you said you wanted to work on, compare that plan against your current context, and nudge you only when it has enough evidence to do so.

## What The App Is For

The core use case is:

- start the day by defining 1-3 important tasks
- let the app observe your work context locally during the day
- keep an ambient sense of whether you are on task, doing legitimate support work, drifting, or paused
- surface progress, ambiguity, and risk in a lightweight way
- end the day with a structured review that improves tomorrow's plan

This is aimed at people who need help staying aligned with declared priorities without using heavy-handed website blocking, noisy reminders, or cloud-hosted monitoring.

## Product Idea In One Sentence

DeepState is a menu bar productivity coach that combines:

- a native macOS app for the visible UI
- a local TypeScript runtime for classification, rules, persistence, and state
- Screenpipe as the sensing layer
- structured ChatGPT exchanges for morning planning and evening reflection

## How The App Works

### 1. Morning plan import

The app does not try to run a full planning conversation locally.

Instead, it generates a structured prompt for ChatGPT, the user pastes that prompt into ChatGPT, and then pastes the structured response back into the app. The imported result becomes the local plan for the day.

That plan includes things like:

- the day's 1-3 tasks
- success definitions
- intended work time
- allowed support work
- valid detours that still count

### 2. Daytime local coaching

During the day, the app reads local context through Screenpipe and routes that through its own logic runtime. The runtime owns the actual product judgment:

- whether the user appears aligned
- whether current work looks like valid support work
- whether the user may be drifting
- whether the system is uncertain and needs clarification
- whether progress is happening

The intended interaction style is sparse and explainable rather than chatty.

### 3. Ambient status and lightweight interventions

The macOS menu bar is the fastest feedback surface. It can show the current state at a glance through a color-coded status model:

- green: aligned
- blue: support work
- yellow: uncertainty or soft drift
- red: hard drift
- gray: paused, idle, or unavailable

When appropriate, the app can also:

- allow pause or break actions from the menu bar
- surface ambiguity items for review
- deliver rare notifications
- offer earned praise for sustained focus
- keep diagnostics visible when the runtime or Screenpipe is degraded

### 4. Evening debrief

At the end of the day, the app builds a structured debrief packet and prompt for ChatGPT. The user can review the day with a stronger cloud model, then paste the structured result back into the app so the system can retain only the validated, app-owned learning.

## Main Features

- Native macOS menu bar app built with SwiftUI/AppKit integration
- Dashboard for current focus, task progress, recent episodes, corrections, ambiguity queue, and diagnostics
- Morning flow with copy-to-clipboard prompt generation and structured import
- Evening debrief flow with payload review and structured import
- Local TypeScript runtime that exposes a bridge server and owns canonical state
- Shared schema/contracts package between the Swift app and the logic runtime
- Local SQLite persistence for plans, episodes, corrections, privacy settings, health, and review data
- Screenpipe integration for local observation and evidence normalization
- Privacy exclusions so certain apps/domains can be kept out of processing
- Delete-all-coaching-data flow for app-owned data
- Launch-at-login support
- Native notification handling and action routing
- Diagnostics and health reporting for bridge, database, scheduler, and Screenpipe

## Current Application Surfaces

From the codebase, the user-facing app is centered around these screens and flows:

- `MenuBarExtraView`: quick status, pause/break actions, morning flow, evening debrief, diagnostics
- `DashboardWindowView`: detailed dashboard with focus, progress, recent events, ambiguity items, review queue, privacy exclusions, settings, and destructive actions
- `MorningFlowView`: copy the generated prompt and import the ChatGPT result
- `EveningDebriefView`: copy the debrief prompt, review the pasted result, and import it
- `ModeRouterView`: handles empty, booting, paused, degraded, and error states
- `DiagnosticsView`: shows whether the local stack is healthy enough to trust

## Architecture Overview

The repository is intentionally split into three layers.

### `INeedABossAgent/`

The native macOS application.

Responsibilities:

- render the menu bar and dashboard UI
- receive the latest full system snapshot from the local runtime
- send user commands back to the runtime
- handle native platform concerns such as notifications, clipboard, launch at login, and windows

### `logic/`

The app's local decision engine, implemented in TypeScript.

Responsibilities:

- boot and run the local runtime
- manage the SQLite database
- ingest and normalize Screenpipe data
- apply privacy filtering
- hold the system state machine
- build morning and evening exchange payloads
- parse and validate imported coaching exchanges
- manage interventions, ambiguity handling, review queues, and diagnostics

### `shared-contracts/`

The strict boundary between UI and runtime.

Responsibilities:

- define the outbound `SystemState`
- define inbound commands
- centralize schema validation
- generate stable JSON schema for contract safety and testing

## Important Product Principles

The app is built around a few strong constraints that show up throughout the code and docs:

- Local-first by default: canonical app data stays local
- Screenpipe is a sensor, not the product brain
- The Swift app is mostly a renderer and command sender
- The TypeScript runtime owns business logic and state
- Morning planning and evening reflection are intentionally offloaded to structured ChatGPT exchanges
- Interventions should be rare, explainable, and autonomy-supportive
- Privacy exclusions and purge flows are first-class features, not afterthoughts

## General Runtime Model

At a high level, the app's runtime model looks like this:

1. The Swift app connects to the local bridge server.
2. The TypeScript runtime publishes a full `SystemState` snapshot stream.
3. The runtime probes health, opens SQLite, runs migrations, and checks Screenpipe.
4. Screenpipe observations are normalized into app-owned evidence.
5. The runtime updates focus state, progress state, and intervention candidates.
6. The UI renders the latest state without re-deriving business logic on its own.
7. User actions are sent back as typed commands.

## Repository Overview

- [`INeedABossAgent`](/Users/rolandschuetz/Projects/INeedABossAgent/INeedABossAgent): SwiftUI/AppKit macOS application
- [`logic`](/Users/rolandschuetz/Projects/INeedABossAgent/logic): TypeScript runtime and persistence layer
- [`shared-contracts`](/Users/rolandschuetz/Projects/INeedABossAgent/shared-contracts): bridge schemas and shared types
- [`docs`](/Users/rolandschuetz/Projects/INeedABossAgent/docs): architecture notes, user stories, task lists, and product rationale
- [`fixtures`](/Users/rolandschuetz/Projects/INeedABossAgent/fixtures): test fixtures and contract samples
- [`INeedABossAgentTests`](/Users/rolandschuetz/Projects/INeedABossAgent/INeedABossAgentTests): native app tests

## Technology Stack

- SwiftUI and AppKit for the macOS client
- TypeScript on Node.js for the runtime
- SQLite for app-owned local persistence
- Zod for schemas and validation
- Server-Sent Events and HTTP JSON for the bridge
- Screenpipe for local desktop context sensing
- ChatGPT for structured morning and evening coaching exchanges

## Status Of The Codebase

This repository already contains substantial foundation work for the full product:

- the native shell and dashboard exist
- the shared contract layer exists
- the local runtime exists
- morning and evening exchange flows exist
- diagnostics, privacy, and purge flows exist
- a large automated test suite exists across Swift and TypeScript

Some parts of the long-term product vision are more advanced in the architecture/docs than in the currently active runtime behavior, but the intended shape of the application is clear throughout the implementation.
