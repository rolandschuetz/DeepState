Based on the comprehensive architectural and psychological constraints provided in your documentation, the core philosophy of this software is rooted in **Self-Determination Theory (SDT) and Positive Reinforcement (+R)**. 

To "softly lead" the user toward their highest-impact goals, the software must act as a **self-authored focus coach** rather than a surveillance tool. It achieves this by utilizing implementation intentions (morning setup), a variable but earned reinforcement schedule (praise), grace periods for self-correction (handling "soft drift"), and strict local-first data ownership.

Here is the synthesized product backlog of User Stories, organized by Epic, designed to build intrinsic motivation and deep focus.

---

## Vision & Design Principles
1. **Autonomy over control:** The user always has override, pause, and dismiss options without friction.
2. **Competence over judgment:** Feedback is task-focused, not personality-focused. Errors (distractions) are treated as neutral feedback, not moral failures.
3. **Sparse over frequent:** Interruptions are rare, earned, and respect strict cooldown periods to avoid attention residue.
4. **Progress over time:** Success is measured by completing goals and artifacts, not just logging hours in an app.

---

### Epic 1: Intentional Mornings via Cloud Coaching
*Psychological mechanism: proximal goals, coaching dialogue, and implementation intentions. The local app should not run this conversation itself. It should prepare a strong prompt for a more capable cloud model and import back a strict daily focus payload.*

**US-1.1: Generate Morning Coaching Prompt for ChatGPT**
**As a** knowledge worker starting my day,
**I want** the app to generate a copy-paste prompt for ChatGPT,
**So that** ChatGPT can coach me through defining the 1-3 most important tasks, their true size, and today’s intended focus hours.
* **Acceptance Criteria:**
  * The app does not run the full morning coaching conversation locally.
  * The prompt explicitly tells ChatGPT to coach the user in a structured, non-sloppy way.
  * The prompt asks ChatGPT to distinguish between:
    * total remaining effort of a task or goal
    * intended hours to work on it today
  * The prompt asks for the user’s 1-3 most important tasks.
  * The prompt asks for estimates per task and in total.
  * The prompt ends with a strict final output format the user can copy back into the app as today’s focus.

**US-1.2: Import "Focus For Today" Back Into the App**
**As a** user who finished the ChatGPT morning routine,
**I want to** paste the final structured result back into the app,
**So that** the local logic layer can track today’s work against a clean daily contract.
* **Acceptance Criteria:**
  * The imported payload contains 1-3 tasks.
  * Each task includes:
    * title
    * success definition
    * estimated total remaining effort
    * intended hours for today
    * allowed support work
  * The app validates the format before accepting it.
  * The local logic layer uses only the imported structured contract, not the full ChatGPT transcript.

**US-1.3: Morning Prompt Includes Support Context and Guardrails**
**As a** user whose work spans multiple tools and contexts,
**I want** the morning ChatGPT coaching flow to ask about valid support work, likely detours, and risky distraction patterns,
**So that** the local app gets better task boundaries without pretending to be the main planning coach.
* **Acceptance Criteria:**
  * The generated prompt instructs ChatGPT to ask about allowed support contexts.
  * The generated prompt instructs ChatGPT to clarify what counts as progress for each task.
  * The app stores imported support contexts as daily rules for local classification.

---

### Epic 2: Ambient Awareness & Honest Progress
*Psychological mechanism: Goal-gradient effect and shaping. Highlighting accumulated progress using glanceable, non-intrusive awareness.*

**US-2.1: Glanceable Menu Bar Status**
**As a** user in the middle of a focus block,
**I want to** glance at my Mac menu bar and instantly see my alignment state via color codes,
**So that** I maintain ambient awareness of my focus without being interrupted.
* **Acceptance Criteria:**
  * Green = aligned; Blue = supporting task; Yellow = uncertain/soft drift; Red = hard drift; Gray = break.
  * Updates iteratively based on the Logic Layer's 60-90s aggregation window. No sound or popups for state changes.

**US-2.2: Evidence-Based Progress Estimation**
**As a** results-driven user,
**I want** my tracking dashboard to show progress based on completed milestones and detected artifacts (e.g., making commits, drafting a doc),
**So that** I am rewarded for moving the needle, not just keeping a window active.
* **Acceptance Criteria:**
  * Dashboard displays a "Progress %" alongside a separate "Confidence %".
  * Time spent influences the score, but doesn't guarantee completion alone. 
  * "Risk Prompts" trigger only if a critical goal is severely behind its estimated pace.

**US-2.3: System Explainability ("Why am I seeing this?")**
**As a** user who needs to trust my AI coach,
**I want to** see the exact evidence behind any classification or progress bump,
**So that** I know the system isn't guessing blindly and can correct it if it's wrong.
* **Acceptance Criteria:**
  * Any drill-down provides 2-3 human-readable evidence bullets (e.g., "Last 15m: typing in Repo X, reading Stripe docs").

---

### Epic 3: Gentle Redirection & Autonomy (Handling "Drift")
*Psychological mechanism: Removing shame from distraction. Delaying interventions to prevent "Attention Residue."*

**US-3.1: Grace Period for "Soft Drift"**
**As a** user who briefly opens a news site while thinking,
**I want** the system to change the menu bar to yellow but remain completely silent for 60-90 seconds,
**So that** I have the autonomy to catch my own distraction and return to work without the software nagging me.
* **Acceptance Criteria:**
  * Soft drift triggers a UI color change but no macOS notification.
  * If the user returns within the dwell window, no intervention is logged. 

**US-3.2: Non-Judgmental "Hard Drift" Interventions**
**As a** user who has completely abandoned a focus block for an extended period,
**I want** to receive a neutral, factual prompt (e.g., "This seems outside your Focus Block. Return now, or is this an intentional detour?"),
**So that** I can course-correct easily without feeling scolded.
* **Acceptance Criteria:**
  * Triggers only after high-confidence, sustained off-task scoring.
  * Includes a 1-click "Intentional Detour" escape hatch.
  * Enforces a strict 10-15 minute cooldown after any notification to prevent spamming.

**US-3.3: The Guilt-Free Pause Button**
**As a** user whose brain is tired or who encounters an unexpected fire to put out,
**I want to** quickly click the menu bar and select "Take a Break" or "Pause Coaching",
**So that** the system respects my human need to stop, keeping me in control.
* **Acceptance Criteria:**
  * 1-click access. Halts all logic layer evaluations, drift rules, and notifications until the pause duration ends.

---

### Epic 4: The Collaborative Brain (Resolving Ambiguity)
*Psychological mechanism: The agent doesn't pretend to be omniscient; it asks for help, placing the user in the role of the "Boss".*

**US-4.1: 1-Click Ambiguity Resolution**
**As a** user doing research that the system doesn't immediately recognize,
**I want to** see a tiny, transient HUD popover asking me where this activity belongs (Goal A, Goal B, Support, Break),
**So that** I can teach the agent in under 2 seconds without breaking flow.
* **Acceptance Criteria:**
  * Triggers only if the `Ambiguity Resolver` detects stable uncertainty for ~45 seconds.
  * Never appears during the first 30 seconds of a new context.

**US-4.2: Teach the System Persistent Patterns**
**As a** user who repeats certain work patterns,
**I want to** tell the system "Remember this context pattern for future tasks,"
**So that** it becomes smarter and interrupts me less over time.
* **Acceptance Criteria:**
  * After answering a classification question, an optional "Remember this?" toggle appears.
  * Stored conditionally (e.g., "App + Domain + Keywords -> Supports Goal A"), not as an absolute truth (e.g., "Chrome is always productive").

---

### Epic 5: Positive Reinforcement (The Marker Signal)
*Psychological mechanism: Immediate, specific marker-signals increase self-efficacy and dopamine, cementing the habit of deep work.*

**US-5.1: Earned Praise for Sustained Focus**
**As a** user who has maintained a long block of deep work,
**I want to** receive a gentle, highly specific notification of praise after 25-30 minutes,
**So that** my brain associates sustained effort with positive emotion and competence.
* **Acceptance Criteria:**
  * Notification fires only after stable alignment is confirmed.
  * Language must be task-level (e.g., "28 minutes strong on the Pricing Page"), avoiding empty or personality-level cheerleading ("You are so disciplined!").
  * Limited to a maximum of one praise notification per focus block.

**US-5.2: Confirm Milestone Completions**
**As a** user who just finished a sub-goal,
**I want** the system to proactively ask, "It looks like you finished [Milestone X]. Mark complete?",
**So that** I experience a tangible sense of momentum and progress.
* **Acceptance Criteria:**
  * Triggered by underlying artifact completion (e.g., PR submitted, Figma file exported).
  * Accepting the prompt visibly advances the progress bar and triggers brief positive UI feedback in the dashboard.

---

### Epic 6: Evening Debrief via Cloud Coaching & Privacy
*Psychological mechanism: reflection, honest progress review, and constructive debriefing. The app should prepare the evidence-rich debrief packet locally, but the reflective coaching conversation should happen in ChatGPT.*

**US-6.1: Export Detailed Evening Debrief Packet**
**As a** user finishing my workday,
**I want** the app to generate a detailed debriefing document that I can copy into ChatGPT,
**So that** I can have a better end-of-day debrief conversation with a more capable cloud model.
* **Acceptance Criteria:**
  * The app creates a detailed debrief packet rather than trying to run the full debrief conversation locally.
  * The packet includes:
    * planned tasks
    * observed work episodes
    * aligned and ambiguous blocks
    * progress evidence
    * interruptions, pauses, and corrections
    * estimate vs. actual effort signals
    * unresolved questions or patterns
  * The packet is written in a way that is useful for reflective coaching, not just raw logs.

**US-6.2: Generate Evening ChatGPT Prompt**
**As a** user ending my day,
**I want** the app to generate a second copy-paste prompt for ChatGPT,
**So that** ChatGPT can coach me through a constructive evening review based on the debrief packet.
* **Acceptance Criteria:**
  * The prompt tells ChatGPT to discuss what happened, what moved forward, what was blocked, and what should be learned.
  * The prompt avoids guilt-inducing framing.
  * The prompt ends with a strict final output format that the user can paste back into the app.

**US-6.3: Import Debrief Outcomes Back Into the App**
**As a** user who finished the evening debrief discussion in ChatGPT,
**I want to** paste the structured debrief result back into the app,
**So that** the local memory and learning system can improve tomorrow’s classification and planning.
* **Acceptance Criteria:**
  * The imported payload may include:
    * what really counted as progress
    * clarified task boundaries
    * corrected ambiguity labels
    * candidate durable memories
    * suggestions for tomorrow
  * The app treats this as structured learning input, not as raw chat history.

**US-6.4: Model Update & Corrective Labeling**
**As a** user who wants a smarter coach tomorrow,
**I want to** review and import debrief-driven corrections from the evening flow,
**So that** the SQLite memory engine promotes only validated facts into durable rules.
* **Acceptance Criteria:**
  * The system distinguishes between:
    * raw debrief export
    * ChatGPT discussion
    * final imported structured corrections
  * Proposed durable memory changes remain reviewable.

**US-6.5: Absolute Local-First Transparency**
**As a** privacy-conscious professional,
**I want to** explicitly declare which apps or domains the system is *never* allowed to process,
**So that** I feel incredibly safe running a context-aware coach.
* **Acceptance Criteria:**
  * Granular exclusion lists (e.g., password managers, banking domains).
  * App features a 1-click "Delete all coaching data and history" button.
  * All canonical data remains strictly in the local SQLite DB.

---

### Recommended "V1 MVP" Slice
To implement this quickly and get the psychological "soft lead" effect right away, prioritize:
1. **Epic 1 (US 1.1 & 1.2):** Morning ChatGPT prompt generation and import of structured "Focus For Today".
2. **Epic 2 (US 2.1):** The color-coded macOS Menu Bar status (no sound, no popups initially).
3. **Epic 3 (US 3.1 & 3.2):** Silent grace periods for soft drift, followed by a neutral redirect notification with a 15-minute cooldown.
4. **Epic 6 (US 6.1 & 6.2):** Evening debrief export and ChatGPT prompt generation.
5. **Epic 6 (US 6.5):** The privacy exclusions so the user trusts the tool immediately.
