An analysis of the Council's responses reveals unanimous agreement that **Response C** provides the most accurate, comprehensive, and actionable breakdown. It perfectly captures your core technical constraint ("make the logic layer and ui layer two distinct pieces that can be developed and tested independently" & "extremely dumb UI") while translating the architectural and psychological constraints from your documents into a strict, tree-based hierarchy.

By drawing from the collective insights of the council, here is the finalized, optimized decomposition tree. It enforces the "dumb UI" pattern through a strict Bridge boundary, ensuring true decoupled development.

---

# Decomposition Tree: Autonomous Focus Coach

## 0. Core Architectural Boundaries
To ensure independent testability and development, the layers are strictly separated by a **Bridge Contract**:
*   **The UI Must Not:** Access SQLite, connect to Screenpipe, run classification logic, generate prompts, track time, or make policy decisions.
*   **The UI Only:** Receives and renders structured `ViewModels` from the Bridge, captures user interactions, and forwards `UserActions` back to the Bridge.
*   **The Logic Layer Must Not:** Know about UI components, import Swift/AppKit, or block on UI responses.
*   **The Logic Layer Only:** Owns all business rules, SQLite persistence, Screenpipe adapters, classification, state machines, and emits state updates.

---

## 1. Logic Layer (TypeScript / Node.js)
*Developed and tested 100% headless. The autonomous "Brain" of the product.*

*   **1.1 Foundation & Infrastructure**
    *   1.1.1 Strict TypeScript domain models and Zod schemas
    *   1.1.2 SQLite database migration layer & repositories
    *   1.1.3 Scheduler Engine (10-15s ingest tick, 60-90s classify tick, 3m progress tick)
*   **1.2 Domain Core (Business & Psychological Rules)**
    *   1.2.1 **Planning Domain:** `Task`, `DailyPlan`, `FocusBlock` validation rules
    *   1.2.2 **Context Domain:** `Evidence`, `ContextWindow`, `Episode` rollups
    *   1.2.3 **Classification Domain:** Deterministic rule matching, statistical scoring, Focus State evaluation (Green/Blue/Yellow/Red/Gray)
    *   1.2.4 **Goal Matching Domain:** Direct, supporting, or ambiguous match evaluation
    *   1.2.5 **Progress Estimation Domain:** Time-based, Milestone-based, and Artifact-based estimators
    *   1.2.6 **Decision & Intervention Domain:** 
        *   Soft drift grace period timer (60-90s autonomy buffer)
        *   Hard drift escalation & cooldown enforcer (10-15m silence to prevent attention residue)
        *   Positive reinforcement (+R) logic (Marker signal / praise after 25-30m aligned work)
    *   1.2.7 **Memory Domain:** `SessionEvent`, `DailyMemoryNote`, `DurableMemoryItem`, memory promotion rules
    *   1.2.8 **Learning Domain:** User correction tracking, signal weight updating, work-group rule candidate generation
*   **1.3 Application Services (Workflows)**
    *   1.3.1 **Morning Exchange Service:** Context packet builder -> Prompt template injection -> `FOCUS_FOR_TODAY` payload parser and validator
    *   1.3.2 **Evening Exchange Service:** Debrief packet builder -> Prompt template injection -> `EVENING_DEBRIEF` parser and memory updater
    *   1.3.3 **Context Aggregator Service:** Raw event ingester -> 60s window aggregator -> Episode boundary detector
    *   1.3.4 **Classification & Ambiguity Service:** Orchestrates classification pipeline, triggers stable ambiguity detection (~45s)
    *   1.3.5 **Decision Coordinator:** Evaluates state machine, schedules interventions, handles user "Guilt-free Pause" requests
    *   1.3.6 **Memory Curator Service:** Compresses daily notes, surfaces unhandled ambiguities, runs pre-compaction flush
*   **1.4 Adapters (External I/O)**
    *   1.4.1 **Screenpipe Adapter:** Websocket/polling consumer, evidence normalizer (drops data matching privacy blocklists *before* processing)
    *   1.4.2 **SQLite Adapter:** Implementation of all domain repositories (`DailyPlanRepo`, `MemoryRepo`, etc.)
    *   1.4.3 **Local AI Adapter:** Bounded tasks only (ambiguity resolution fallback, summarizing logs)
*   **1.5 The Bridge Contract (Separation API)**
    *   1.5.1 **State Serializers:** Converts complex domain state into flat, dumb ViewModels (`MenuBarViewModel`, `DashboardViewModel`, `NotificationViewModel`, `ClarificationViewModel`)
    *   1.5.2 **Action Router:** Ingests Zod-validated `UserActions` (`PauseAction`, `ResolveAmbiguityAction`, `ImportPlanAction`) and directs to Services
    *   1.5.3 **Event Emitter:** Pushes asynchronous updates to the UI (via WebSockets or local HTTP/IPC)
*   **1.6 Testing Infrastructure (Logic)**
    *   1.6.1 **Test DB Factory:** In-memory SQLite for repository testing
    *   1.6.2 **Fixture Library:** JSON mocks for Screenpipe windows, obvious on-task scenarios, ambiguous episodes, and realistic import payloads
    *   1.6.3 **Unit Tests:** State transitions, scoring thresholds, hysteresis/cooldown mathematical validation
    *   1.6.4 **Integration Tests:** Full morning-to-evening pipelines (evidence ingest -> classify -> memory promotion) completely stripped of UI dependencies

---

## 2. UI Layer (macOS Swift / AppKit / SwiftUI)
*Extremely dumb presentation shell. Acts solely as a projection of ViewModels and an emitter of UserActions.*

*   **2.1 Foundation & Bridge Client**
    *   2.1.1 IPC / HTTP client to connect to Logic Layer Process
    *   2.1.2 App State Container (Holds `MenuBarState`, `DashboardState`, `PendingNotifications` purely as received from Logic)
    *   2.1.3 Background Helper setup (`SMAppService` for login items)
*   **2.2 Menu Bar Module**
    *   2.2.1 Status Icon Renderer (Shows Green/Blue/Yellow/Red/Gray color state purely based on ViewModel)
    *   2.2.2 Dropdown HUD Metrics (Active Task Title, Progress %, String literal Timer)
    *   2.2.3 1-Click Action Buttons ("Pause", "Break") -> Emits `PauseAction`
*   **2.3 Dashboard Module**
    *   2.3.1 Read-Only Progress Display (Goals vs. Estimated Effort)
    *   2.3.2 "Why am I seeing this?" Explainability Log (Renders an array of human-readable bullet points pre-generated by Logic)
*   **2.4 Clarification & Notification Module**
    *   2.4.1 macOS Local Notifications Presenter (Earned Praise toast, Hard Drift redirect toast) -> Button clicks emit string actions back to Logic
    *   2.4.2 Transient Ambiguity HUD (Dark, fast Popover anchored to menu bar with 1-click buttons: "Task A", "Task B", "Support", "Remember Context?") -> Emits `ResolveClarificationAction`
*   **2.5 Exchange Modules (Cloud-Assisted Coaching Prompts)**
    *   2.5.1 **Morning Modal:** Renders Logic-generated ChatGPT prompt text + "Copy" button. Text area for paste -> Emits `ImportFocusForTodayAction`. Renders validation errors if Logic rejects the format.
    *   2.5.2 **Evening Modal:** Renders Logic-generated Debrief text + "Copy" button. Text area for paste -> Emits `ImportEveningDebriefAction`.
*   **2.6 Settings & Privacy Module**
    *   2.6.1 Exclusion List UI (Apps/Domains list editor) -> Emits `UpdateExclusionsAction`
    *   2.6.2 "Delete All Data" hard-wipe 1-click button -> Emits `PurgeAllAction`
*   **2.7 UI Testing Infrastructure**
    *   2.7.1 **Mock Bridge Server:** Stub Node.js server that emits static ViewModels to UI testing suite (e.g., arbitrarily tells the UI to turn "Yellow" to test rendering)
    *   2.7.2 **SwiftUI Previews:** Render all component states locally without any Logic process running
    *   2.7.3 **UI Unit Tests:** Verify that clicking UI buttons correctly parses and emits the required JSON `UserAction` payload to the network layer.

---

## 3. Integration & Deployment
*How the two disconnected halves ship together as a unified macOS product.*

*   **3.1 Process Architecture & Orchestration**
    *   3.1.1 Logic Layer bundling (esbuild/webpack to a single Node.js script or packaged Node binary)
    *   3.1.2 Process lifecycle management (Swift app spawns Node.js background process on launch, monitors health, kills process on quit)
*   **3.2 End-to-End Testing Boundary**
    *   3.2.1 Automated workflows testing the IPC bridge (e.g., SwiftUI UI test framework clicks "Import" -> Mock LLM text passed to actual Logic process -> logic processes the plan -> SwiftUI asserts the Menu Bar successfully turns Green).
*   **3.3 macOS App Bundling**
    *   3.3.1 Plist Entitlements (Accessibility/Screen Recording configuration for Screenpipe, Local Network bindings if using HTTP for the Bridge)
    *   3.3.2 Code Signing and Apple Hardened Runtime Notarization