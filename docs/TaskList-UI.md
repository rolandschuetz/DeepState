By architecting the software with a strict boundary—**the headless TypeScript layer holds all the logic and memory, while the macOS UI is purely a dumb rendering shell**—both developers can largely work in parallel once Phase 1 (Bridge Contracts) is complete. 

This task list reflects the tightened V1 MVP architecture:

- one unified `GET /stream` endpoint that emits a single `SystemState` envelope
- one unified `POST /command` endpoint for all Swift-to-TypeScript actions
- one top-level `Mode` enum: `booting | no_plan | running | paused | degraded_screenpipe | logic_error`
- one reduced focus-state model: `aligned | uncertain | soft_drift | hard_drift | paused`
- one `is_support` flag for aligned support work instead of separate focus states
- two scheduler ticks only: `15s` fast ingest and `90s` slow evaluation
- two memory layers only for MVP: `Daily Memory` and `Durable Rules`, both in SQLite
- strict schema-versioned JSON for morning and evening cloud-coach exchange

---

## 2. 🖥️ Mac Developer To-Do's (UI Layer)
*Tech Stack: Swift, SwiftUI, AppKit, SMAppService, UserNotifications. Keep the Swift App as a "Dumb Terminal" reacting passively to the unified TS stream.*

**Phase 0: App Shell & Unified Bridge Client**
- [x] Initialize macOS SwiftUI app. Remove dock icon and configure standard entitlements.
- [x] Define Swift models mapping exactly to the shared JSON `SystemState` schema block, and write test decoders against the TS-generated unit fixtures.
- [x] Implement `BridgeClient` managing a persistent `URLSession` SSE connection (`GET /stream`) mapping directly to app environment variables.
- [x] Implement `BridgeClient` single POST dispatcher (`POST /command`) for all outbound data actions.
- [x] Request a fresh current snapshot on app open and auto-reconnect after logic-process restarts without applying stale state blindly.
- [x] Introduce a thin app-side state store (`MenuBarState`, `DashboardState`, `PromptImportState`, `PendingNotificationState`, `ClarificationPanelState`, `SettingsState`) driven only by bridge payloads.
- [x] Map the global TS `Mode` to the top-level SwiftUI router wrapper checking for `booting`, `no_plan`, `running`, `paused`, `degraded_screenpipe`, and `logic_error`.
- [x] Build a small diagnostic UI referencing the `SystemHealthViewModel` detailing Screenpipe/Database connection integrity.
- [x] Surface bridge connectivity/version-mismatch problems and command result failures in the diagnostics UI instead of failing silently.

**Phase 1: Paste Sanitizer & Morning Flow**
- [x] Write a 20-line **Paste Sanitizer** String Extension. This function must catch manual copy/paste sloppiness before submission by automatically stripping markdown code fences (```json), stripping out conversational intro/outro dialogue, and normalizing smart quotes globally into standard quotation marks.
- [x] Create `MorningFlowView` displaying the read-only morning prompt and `Copy to Clipboard` feature.
- [x] Add a multiline text area for ChatGPT's response. Run `.pasteSanitize()` on the text content, encapsulate it inside the `import_coaching_exchange` object, and dispatch via `POST /command`.
- [x] Decode TS parser errors inline cleanly so the user can easily re-edit their payload string.
- [x] Add explicit success confirmation, edit/re-import affordance, and duplicate-submit protection for in-flight morning imports.

**Phase 2: Menu Bar Status**
- [x] Create a minimal `MenuBarExtra` view implementation.
- [x] Bind icon tint colors natively to the `MenuBarViewModel` state payload logic:
  - `aligned` -> Green
  - `aligned` + `is_support == true` -> Blue
  - `uncertain` / `soft_drift` -> Yellow
  - `hard_drift` -> Red
  - `paused` / `no_plan` / `degraded` -> Gray
- [x] Render the active task label, timer, and current focus scope within the dropdown.
- [x] Render a compact confidence indicator and non-color state label so the menu bar remains readable and accessible.
- [x] Add "Pause Coaching" and explicit "Take a Break" actions routing unified actions cleanly back to TS.

**Phase 3: Explainability Dashboard & Settings**
- [ ] Build the main dashboard window to track active focus goals/hours remaining against progress percentages.
- [ ] Add dashboard sections for unresolved ambiguities, pending milestone confirmations, recent events, and the last explainability log.
- [ ] Build the "Why am I seeing this?" accordion section. Note: The UI must **blindly traverse and render** the incoming `{ code, detail, weight }` JSON explainability array passed via `SystemState`. No inferential context evaluation is handled in Swift natively.
- [ ] Build Privacy exclusions UI text-fields showing the TS-seeded default domain strings. Dispatch UI updates to `update_exclusions` payloads automatically.
- [ ] Add settings controls for reminder preferences, praise preferences, local data export, and diagnostics without duplicating logic decisions in Swift.
- [ ] Form a deeply nested destructive "Delete All Coaching Data" UI flow wired natively to the TS `purge_all` command.
- [ ] Wire `SMAppService` setup correctly for launch-at-login execution.

**Phase 4: Interventions & Clarification HUD**
- [ ] Request `UNUserNotificationCenter` permissions. Map denial states gracefully to an overarching warning flag on the dashboard if permissions are withheld.
- [ ] Push native Local Notifications reacting uniquely to `SystemState.intervention` command flags (e.g., Hard drift, Praise).
- [ ] Register notification categories and deep-link action responses back into the correct app state before forwarding them to TS.
- [ ] Display the "Recovery Anchor" text string (e.g., `"Back. Continue at..."`) directly from TS as is. Under no circumstances rewrite Logic messaging in Swift.
- [ ] Catch dynamic Notification actions explicitly via `Intentional Detour` / `Return Now` and pipe user responses directly downstream back to `POST /command`.
- [ ] Mount a `ClarificationHUD` via an invisible transient `NSPanel`. Unhide this element **only** if the SSE active stream passes a valid `ClarificationViewModel`. Provide simple click-options corresponding to the task scopes and dispatch `resolve_ambiguity` payloads upon selection.
- [ ] Add keyboard shortcuts, accessibility labels, timeout/auto-dismiss behavior, and stale-state handling for the Clarification HUD and notification responses.

**Phase 5: Evening Flow & Review UI**
- [ ] Replicate the Morning Flow setup: Create `EveningDebriefView`, mount the TS-generated debrief payload, provide a `Copy` mechanism. 
- [ ] Add the paste receptacle for ChatGPT's response, run the Paste Sanitizer logic over it, and trigger the evening `import_coaching_exchange` command submission.
- [ ] Show a review/confirmation step explaining what evening data will be stored before final import acceptance.
- [ ] Supply a very simple table UI rendering proposals trapped in `SystemState.dashboard.reviewQueue`. Implement simple Checkbox selection for promoting/rejecting new Durable Rules logic changes.
