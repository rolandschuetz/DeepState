# Manual Test Plan

This document explains how to manually exercise the visible features of INeedABossAgent so you can see what the app does end to end.

It is written as a human walkthrough, not as an automated QA script.

## Goal

By following this plan, you should be able to verify:

- the menu bar app launches and connects to the local runtime
- the dashboard renders the current system state
- the morning flow generates a prompt and accepts a structured import
- the app shows plan, focus, progress, explainability, privacy, diagnostics, and settings surfaces
- notification and pause/break flows are visible
- the evening debrief flow works
- destructive and settings actions behave correctly

## Preconditions

Before testing:

- the macOS app is buildable and runnable from Xcode
- the frontend dev/runtime the project expects is already running
- Screenpipe is available if you want to see real sensing behavior
- you are prepared to allow notifications if you want to see notification-related UI clearly

## Test Strategy

Run these sections in order:

1. Launch and connection
2. Empty state and no-plan behavior
3. Morning flow
4. Dashboard and menu bar surfaces
5. Privacy and settings
6. Diagnostics and failure visibility
7. Evening debrief
8. Destructive flow

## 1. Launch And Connection

### What to do

- Launch the app from Xcode.
- Confirm the menu bar icon appears.
- Open the menu bar dropdown.
- Open the dashboard window from the menu bar.

### What you should see

- A brain/head icon in the macOS menu bar.
- A dropdown with:
  - current status text
  - timer or scope text when available
  - `Open Dashboard`
  - `Pause Coaching`
  - `Take a Break`
  - morning flow section when available
  - evening debrief section when available
  - diagnostics
- A dashboard window that either shows the full dashboard or a fallback router state such as:
  - `Booting`
  - `No Plan Loaded`
  - `Connecting`
  - `Reconnecting`
  - `Screenpipe Degraded`
  - `Logic Error`

### Pass criteria

- The app launches.
- The menu bar UI opens without crashing.
- The dashboard window opens.
- Some bridge/runtime state is visible, even if the app is not yet fully running.

## 2. Empty State And No-Plan Behavior

This verifies what the app looks like before a daily plan is loaded.

### What to do

- Launch the app on a clean state or after deleting coaching data.
- Open the dashboard and menu bar before importing any morning plan.

### What you should see

- The app should land in a state equivalent to `No Plan Loaded` or similar.
- The mode router should explain that a morning plan is needed before the coach can classify focus.
- The morning flow should be the primary visible next action.

### Pass criteria

- The app clearly communicates that focus classification depends on importing a morning plan.
- The user can discover the morning flow without guessing.

## 3. Morning Flow

This is the most important user-visible feature to test first.

## 3A. Happy Path Import

### What to do

- Open the menu bar dropdown.
- Locate the `Morning Flow` section.
- Click `Copy to Clipboard`.
- Paste the generated prompt somewhere to confirm it copied.
- Use ChatGPT or create a manual JSON payload that matches the morning-plan contract.
- Paste the response into the `ChatGPT Response` text box.
- Click `Import Response`.

### Suggested sample payload

Use today's date if needed.

```json
{
  "schema_version": "1.0.0",
  "exchange_type": "morning_plan",
  "local_date": "2026-04-18",
  "total_intended_work_seconds": 14400,
  "notes_for_tracker": "Prioritize the product-facing README and manual test plan.",
  "tasks": [
    {
      "title": "Write README",
      "success_definition": "README explains the app use case, features, and architecture.",
      "total_remaining_effort_seconds": 5400,
      "intended_work_seconds_today": 7200,
      "progress_kind": "artifact_based",
      "allowed_support_work": [
        "Reading architecture docs",
        "Inspecting SwiftUI screens",
        "Reviewing runtime files"
      ],
      "likely_detours_that_still_count": [
        "Updating related docs"
      ]
    },
    {
      "title": "Write test plan",
      "success_definition": "A manual test plan exists for the visible app features.",
      "total_remaining_effort_seconds": 3600,
      "intended_work_seconds_today": 3600,
      "progress_kind": "artifact_based",
      "allowed_support_work": [
        "Reading dashboard and menu bar code",
        "Checking diagnostics behavior"
      ],
      "likely_detours_that_still_count": [
        "Refining README wording"
      ]
    }
  ]
}
```

### What you should see

- A success message after import.
- The morning import text area becomes effectively complete unless you choose `Edit and Re-import`.
- The dashboard should now show:
  - a plan for the day
  - task cards
  - planned work totals
  - current focus and other sections
- The app should move away from the no-plan state.

### Pass criteria

- Copy works.
- Import works.
- The imported plan becomes visible in the dashboard.
- The mode changes from no-plan to a normal running-style state or startup state with a loaded plan.

## 3B. Invalid Morning Import

This is useful because it lets you see validation and error feedback.

### What to do

- Open `Morning Flow`.
- Paste invalid content such as plain prose or incomplete JSON.
- Click `Import Response`.

Example invalid content:

```text
Today I want to work on a few things. Please just trust me.
```

### What you should see

- An error result in the morning flow section.
- Validation-related feedback or a parsing failure message.
- Diagnostics may also show a command failure row.

### Pass criteria

- The app rejects invalid imports.
- The failure is visible to the user instead of failing silently.

## 4. Dashboard And Menu Bar Surfaces

Once a plan is loaded, walk through each visible feature.

## 4A. Menu Bar Status

### What to do

- Open the menu bar repeatedly during runtime.
- Observe title, runtime label, timer, scope, and confidence text.

### What you should see

- A status title that reflects the current task or primary label.
- A runtime label such as running, paused, support, or other mode output.
- A timer if focused time is available.
- Scope text showing either support work or the active goal.
- Confidence text when present.

### Pass criteria

- The menu bar contains meaningful real-time state, not just a static app menu.

## 4B. Current Focus Section

### What to do

- Open the dashboard.
- Inspect the `Current Focus` tiles.

### What you should see

- `Runtime`
- `Scope`
- `Confidence`
- Possibly a `Recovery Anchor`

### Pass criteria

- The section renders without layout issues.
- Values update from app state rather than looking hardcoded.

## 4C. Progress Section

### What to do

- Inspect the `Progress` section after a successful morning import.

### What you should see

- top-level metrics for:
  - aligned
  - support
  - drift
  - planned
- task cards with:
  - title
  - progress percentage
  - status text
  - optional ETA
  - optional confidence
  - optional risk
  - aligned/support/drift time

### Pass criteria

- Imported tasks appear here.
- The section is understandable as the central “how is the day going?” surface.

## 4D. Explainability

### What to do

- Expand `Why am I seeing this?`

### What you should see

- Explainability items with:
  - a code
  - a human-readable detail
  - a weight value

### Pass criteria

- The disclosure group opens and closes correctly.
- Entries, if present, are legible and clearly tied to classification logic.

## 4E. Recent Events

### What to do

- Inspect the `Recent Events` section.

### What you should see

- Recent episodes and/or corrections.
- Each card should show:
  - title
  - detail
  - timestamp

### Pass criteria

- The section renders even if empty.
- If populated, it gives a readable activity history.

## 4F. Ambiguities

### What to do

- Inspect `Unresolved Ambiguities`.

### What you should see

- Either `No outstanding ambiguity items.` or one or more queue cards.

### Pass criteria

- Empty state is clean.
- Populated state is readable.

Note:

- Triggering a real ambiguity item may require runtime conditions that are not trivial to force manually. It is acceptable if this section stays empty during a normal manual pass.

## 4G. Pending Milestone Confirmations

### What to do

- Inspect `Pending Milestone Confirmations`.
- If items exist, toggle `Promote` and `Reject`.

### What you should see

- Either an empty state or local checkbox-style toggles.
- The explanatory note that selections stay local until the bridge exposes a durable-rule review command.

### Pass criteria

- The section renders.
- Toggle state changes visibly.

## 5. Pause, Break, Notifications, Privacy, And Settings

## 5A. Pause Coaching

### What to do

- In the menu bar, click `Pause Coaching`.
- Reopen the menu bar and dashboard.

### What you should see

- The app should transition into a paused state.
- The mode router or status labels should reflect `Paused`.
- Menu bar/runtime labels should communicate that coaching is paused.

### Pass criteria

- Pause changes the visible state.
- The app does not appear to keep presenting itself as actively coaching.

## 5B. Take A Break

### What to do

- In the menu bar, click `Take a Break`.

### What you should see

- A pause/break style state very similar to paused behavior.
- Depending on runtime state, labels may mention break semantics.

### Pass criteria

- The action is accepted.
- The UI changes in a visible way.

## 5C. Notification Permission Surfaces

### What to do

- Open dashboard `Settings`.
- Inspect `Reminder Preferences` and `Praise Preferences`.
- If safe on your machine, toggle macOS notification permission for the app and reopen the dashboard.

### What you should see

- Notification permission status:
  - `Unknown`
  - `Granted`
  - `Denied`
- If denied, a yellow warning section near the top of the dashboard.
- `Open Notification Settings` button.
- Praise-related status text about whether logic is muting notifications.

### Pass criteria

- Notification state is visible in the UI.
- Denied permissions produce an obvious warning state.

## 5D. Privacy Exclusions

### What to do

- Open the `Privacy Exclusions` section.
- Edit an existing exclusion if any are present.
- Remove an exclusion if you want to test deletion.

### What you should see

- A list of exclusion entries, or an empty-state message.
- Edits and removals should dispatch through the bridge.

### Pass criteria

- Exclusions are visible and interactive.
- The section feels like live app data, not static copy.

Note:

- The exact default entries come from the logic runtime. If the section is empty, verify that the empty state appears cleanly.

## 5E. Local Data Folder

### What to do

- In `Settings`, click `Reveal Local Data Folder`.

### What you should see

- Finder opens the app support directory for the app.

### Pass criteria

- The button reveals a real local folder.

## 5F. Launch At Login

### What to do

- In `Settings`, toggle `Launch INeedABossAgent at login`.

### What you should see

- Status text updates to something like:
  - `Enabled`
  - `Disabled`
  - `Requires approval in System Settings.`
  - `App registration missing.`
- If the OS blocks the action, an error should be shown instead of silent failure.

### Pass criteria

- The toggle is wired to a real system capability.
- Success or failure is visible.

## 6. Diagnostics And Failure Visibility

## 6A. Normal Diagnostics

### What to do

- Open diagnostics in the menu bar.
- Open the `Diagnostics` section in the dashboard.

### What you should see

- At minimum, a bridge row.
- When system health is available, rows for:
  - overall
  - Screenpipe
  - database
- Possible command failure rows if a previous command failed.

### Pass criteria

- Diagnostics are visible in both the compact and dashboard contexts.

## 6B. Command Failure Visibility

### What to do

- Repeat the invalid morning import from section 3B.
- Then inspect diagnostics again.

### What you should see

- A `Command` diagnostics row with:
  - a status such as validation error or fatal failure
  - details including command kind and message

### Pass criteria

- Command failures are discoverable after they happen.

## 6C. Degraded Runtime Visibility

If you can safely simulate it:

### What to do

- Stop or disconnect the local runtime or Screenpipe temporarily.
- Reopen the app/menu bar/dashboard.

### What you should see

- Bridge or Screenpipe status should move to a degraded/failed/disconnected state.
- The dashboard may fall back to router content such as `Screenpipe Degraded`, `Connecting`, or `Reconnecting`.

### Pass criteria

- Failures are visible and understandable.
- The app degrades visibly instead of appearing healthy while broken.

## 7. Evening Debrief

This is the second major product flow.

## 7A. Happy Path Evening Import

Precondition:

- A morning plan for the same `local_date` must already be imported.

### What to do

- Open the menu bar dropdown.
- Locate `Evening Debrief`.
- Click `Copy to Clipboard`.
- Confirm the prompt text copies.
- Paste a valid evening debrief JSON response into the `ChatGPT Response` area.
- Click `Review Import`.
- Inspect the review summary.
- Click `Confirm Import`.

### Suggested sample payload

```json
{
  "schema_version": "1.0.0",
  "exchange_type": "evening_debrief",
  "local_date": "2026-04-18",
  "overall_day_summary": "The README and manual test plan were completed and clarified the product surface.",
  "task_outcomes": [
    {
      "task_title": "Write README",
      "did_progress_occur": "yes",
      "what_counted_as_real_progress": "Replaced setup-only documentation with a product-facing overview."
    },
    {
      "task_title": "Write test plan",
      "did_progress_occur": "yes",
      "what_counted_as_real_progress": "Created a feature-by-feature manual test plan."
    }
  ],
  "new_support_patterns_to_remember": [
    "Reading SwiftUI view files can count as support work when writing docs about the app."
  ],
  "patterns_to_not_remember": [],
  "carry_forward_to_tomorrow": "Review runtime behavior against the docs and add deeper QA notes if needed.",
  "coaching_note_for_tomorrow": "Start by validating the highest-risk runtime paths before polishing documentation.",
  "tomorrow_suggestions": [
    "Test more degraded-state behavior.",
    "Try a real Screenpipe-backed work session."
  ]
}
```

### What you should see

- A review summary before import.
- A successful import result after confirmation.
- The evening exchange should move toward completed state.
- The dashboard summary text should mention that the evening debrief was imported and that rule proposals should be reviewed.
- You may see new review items derived from remembered patterns or corrections.

### Pass criteria

- Copy works.
- Review works.
- Confirm import works.
- The app visibly reflects that the debrief was accepted.

## 7B. Invalid Evening Import

### What to do

- Paste invalid JSON or the wrong exchange type.
- Click `Review Import` and then attempt import if possible.

### What you should see

- Either a limited review summary followed by failure on import, or a direct import failure.
- Error feedback instead of silent acceptance.

### Pass criteria

- Invalid evening payloads do not get silently accepted.

## 8. Delete All Coaching Data

This is the most sensitive user-facing action.

### What to do

- Open the dashboard.
- Scroll to `Delete All Coaching Data`.
- Expand the first disclosure.
- Expand final confirmation.
- Type the exact confirmation phrase:

```text
DELETE ALL COACHING DATA
```

- Click `Delete All Coaching Data`.

### What you should see

- The delete button should stay disabled until the phrase matches exactly.
- After running, app-owned coaching data should be cleared.
- The app may return to a no-plan or startup-like state.
- The warning text explicitly says Screenpipe raw data should remain untouched.

### Pass criteria

- The destructive flow is intentionally hard to trigger accidentally.
- After deletion, app-owned plan/progress/review state is cleared.
- The app remains usable after the purge.

## Recommended One-Pass Demo Flow

If you just want the shortest path to see most features:

1. Launch the app.
2. Open menu bar and dashboard.
3. Observe the no-plan state.
4. Import a valid morning plan.
5. Inspect Current Focus, Progress, Explainability, Recent Events, Privacy, Settings, and Diagnostics.
6. Trigger an invalid morning import once to see failure handling.
7. Use `Pause Coaching` and `Take a Break`.
8. Review notification settings and reveal the local data folder.
9. Import a valid evening debrief.
10. Inspect review queue and updated dashboard summary.
11. Run the delete-all-coaching-data flow last.

## Known Limits Of Manual Testing

- Some runtime-driven features depend on live sensing and may not appear on demand:
  - sustained praise notifications
  - real hard-drift notifications
  - ambiguity HUD popovers
  - rich recent episodes and correction history
- If Screenpipe or the runtime is not fully active, you can still verify the visible app shell, but not every dynamic coaching behavior.

## What To Record While Testing

For each section, capture:

- what you clicked
- what state you expected
- what actually happened
- whether the behavior was correct, missing, confusing, or broken

Screenshots are especially useful for:

- no-plan state
- successful morning import
- notification denied warning
- diagnostics failure state
- successful evening debrief import
- delete-all confirmation flow

