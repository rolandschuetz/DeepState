# Concept 1
You are not building a chatbot. You are building a local just-in-time focus coach on top of ScreenPipe.

ScreenPipe already gives you the sensing and memory layer: continuous local capture of screen/audio, app names, browser URLs, user input, UI events, local storage in ~/.screenpipe/, a REST API on localhost:3030, real-time streaming endpoints including /ws/events, and scheduled pipes defined as markdown files. That makes it the right substrate. It does not make ScreenPipe pipes the right place for your entire real-time coach, because pipes are scheduled agents, run on intervals, and ScreenPipe serializes pipe execution.  ￼

The architecture I would build

[ScreenPipe Engine]
  capture + local memory + event stream
  /search, /ws/events, /elements, /memories

            ↓

[Focus Coach Core]
  - morning planner
  - context/session builder
  - task classifier
  - reinforcement engine
  - uncertainty resolver
  - learning writer

            ↓

[Coach DB]
  tasks
  daily plans
  task signals
  corrections
  focus sessions
  notification history

            ↓

[macOS UI Shell]
  MenuBarExtra
  local notifications
  popover for corrections
  settings/history

The decisive split
	•	ScreenPipe = sensor + raw memory
	•	Your app = judgment + learning + feedback
	•	macOS UI shell = interaction surface

That split keeps the system simple, local, fast, and debuggable. ScreenPipe remains the event recorder. Your product remains the behavioral system.  ￼

Where the agent should be defined

Define the agent in three layers, not one:

1) The real agent belongs in code

This is the state machine and policy engine:
	•	on-task
	•	off-task
	•	uncertain
	•	intentional break
	•	meeting
	•	paused

This must live in code because it needs deterministic thresholds, hysteresis, cooldowns, and reliability. Do not bury this in one giant prompt.

2) The language layer belongs in versioned prompt files

Use prompt files for:
	•	morning planning question flow
	•	ambiguity resolution prompt
	•	end-of-day reflection
	•	nightly rule-compaction prompt

These prompts belong in your repo, versioned like any other product logic.

3) The learned user-specific knowledge belongs in your own local DB

This includes:
	•	which tools/URLs/windows belong to which task
	•	which tools are distractions
	•	allowed detours
	•	correction history
	•	reinforcement preferences
	•	false-positive patterns

This data is user state, not product logic.

What to do with ScreenPipe pipes

Use pipes for:
	•	morning backup prompt
	•	end-of-day review
	•	weekly analytics
	•	offline retraining / summarization
	•	writing summaries into notes, tasks, CRM, etc.

Do not use pipes as the core always-on loop. ScreenPipe documents pipes as scheduled markdown-defined agents, and its docs explicitly position them for periodic automations.  ￼

How the system should continually work

The best v1 is one native macOS menu bar app that launches at login, talks to ScreenPipe locally, and stores its own SQLite DB.

Apple’s current macOS service management guidance says to use SMAppService for login items / launch agents on macOS 13+, and Apple’s menu bar guidance explicitly supports app-specific functionality from the menu bar even when the app is not frontmost.  ￼

The runtime loop
	1.	Start at login / first work signal
	•	Do not ask at a fixed 09:00.
	•	Ask at first meaningful work activity after unlock, or when the user clicks the menu bar item for the first time that day.
	2.	Morning planning protocol
Replace the single question “What are my priorities?” with a structured mini-protocol:
	•	top 1–3 priorities
	•	for each priority: what outcome defines success?
	•	what apps / URLs / docs count as valid work?
	•	what detours are allowed?
	•	what should trigger a reminder?
	•	what counts as done?
This is implementation-intention design, not generic journaling. “If-then” planning improves translation of intentions into action, especially when the goal intention is already strong.  ￼
	3.	Subscribe to ScreenPipe event stream
	•	consume /ws/events for real-time OCR/audio/UI events
	•	optionally use /search for recent lookback windows
	•	use /elements and frame context when you need structured UI or page-level evidence
ScreenPipe exposes real-time event streaming, search filters by app/window/URL/time, and stores UI elements, OCR, audio, and input events locally.  ￼
	4.	Build short rolling snapshots
Every 10–15 seconds, aggregate:
	•	active app
	•	browser URL
	•	window title
	•	OCR/accessibility text
	•	recent clicks / typing / clipboard
	•	recent sequence context from the last 2–5 minutes
	5.	Classify with a hierarchy
	•	deterministic rules first
	•	weighted signal scoring second
	•	LLM fallback third
	•	user question last
	6.	Only ask the LLM on ambiguity
The LLM should wake on:
	•	conflicting evidence
	•	novel app/url/window combinations
	•	task switches
	•	user corrections worth generalizing
The LLM should not run continuously.

Use this state machine
	•	On-task
	•	confidence > 0.75
	•	stable for 3 minutes
	•	Positive reinforcement
	•	still on-task after 25–30 minutes
	•	no reinforcement more than once per block
	•	Off-task drift
	•	confidence < 0.25
	•	stable for 2–3 minutes
	•	not in approved break mode
	•	Uncertain
	•	confidence in middle band for 60–90 seconds
	•	ask a classification question
	•	Cooldown
	•	after any interruption, wait 10 minutes before another prompt unless drift is extreme

That dwell-time logic matters because task switching creates attention residue; frequent false interrupts will damage performance more than they help.  ￼

How to classify “belongs to the task”

Do not model this as “tool → task.”

That is too dumb.

Chrome, Slack, ChatGPT, Mail, Notes, Terminal, and Finder are all ambiguous. The real mapping is:
	•	task
	•	outcome
	•	allowed contexts
	•	forbidden contexts
	•	supporting sub-activities
	•	recent sequence context

Use a layered evidence model

For each task, store:
	•	positive signals
	•	app = Cursor
	•	URL contains github.com/org/repo
	•	window title contains landing-page
	•	OCR contains project keywords
	•	UI elements match Figma / Linear / Notion project names
	•	negative signals
	•	URL contains X / YouTube / unrelated email
	•	window title contains personal banking
	•	OCR contains non-task entertainment keywords
	•	conditional signals
	•	Slack is valid only if recent context includes project collaborator names
	•	Browser research is valid only if it follows active work on the same project
	•	Email is valid only inside a predeclared admin block

ScreenPipe’s available evidence supports exactly this: app names, URLs, window names, OCR/accessibility text, structured UI elements, and input events like clicks, typing, clipboard, app switches, and scroll.  ￼

Where to save the learned information

Canonical store: your own SQLite DB

This is the correct answer.

Use ScreenPipe’s DB as ingestion memory. Use your own DB as the product brain.

ScreenPipe stores frames, OCR, elements, audio, transcriptions, UI events, and tags in its own local SQLite. It also exposes a Memories API for saved extracted knowledge. That makes ScreenPipe perfect as a source and optional mirror, not as your canonical product schema.  ￼

Suggested schema
	•	tasks
	•	id
	•	title
	•	goal_outcome
	•	default_priority
	•	active
	•	daily_plans
	•	date
	•	task_id
	•	rank
	•	success_definition
	•	allowed_detours
	•	reminder_style
	•	task_signals
	•	task_id
	•	signal_type (app, url, window, keyword, person, file, ui_element)
	•	pattern
	•	polarity (positive, negative, conditional)
	•	weight
	•	scope
	•	source (user, derived, llm)
	•	confidence
	•	last_confirmed_at
	•	observations
	•	timestamp_start
	•	timestamp_end
	•	top_evidence_json
	•	predicted_task_id
	•	confidence
	•	user_corrections
	•	observation_id
	•	chosen_task_id
	•	was_intentional_break
	•	note
	•	focus_sessions
	•	task_id
	•	started_at
	•	ended_at
	•	alignment_score
	•	reinforcement_sent
	•	coach_events
	•	reminders
	•	praise
	•	uncertainty prompts
	•	user dismissals

Mirror selected facts into ScreenPipe memories

Also write compressed knowledge into ScreenPipe’s Memories API:
	•	“Task X usually uses Figma + Notion + domain Y”
	•	“Slack with John about Project Z belongs to Task X”
	•	“Mail.app is off-task unless inside admin block”

That gives future agents and MCP tools direct access to the learned context while your app DB stays canonical. ScreenPipe’s memories endpoint exists for exactly this kind of saved knowledge.  ￼

The best visual feedback on a Mac

Primary surface: MenuBarExtra

Use a menu bar extra as the always-visible, low-friction control surface.

Show:
	•	current declared priority
	•	current inferred task
	•	confidence
	•	focus timer
	•	state color / symbol:
	•	green = aligned
	•	amber = uncertain
	•	red = drift
	•	gray = paused/break

Apple explicitly supports menu bar extras for app-specific functionality when the app is running, even when it is not active. This is the right persistent surface for your product.  ￼

Secondary surface: local notifications

Use local notifications for only three cases:
	•	milestone praise after sustained focus
	•	drift reminder after stable off-task evidence
	•	uncertainty prompt that needs a decision

Apple’s notification guidance is clear: notifications should be timely and important, and alerts are disruptive and lose impact when overused. Also, notification handling supports custom actions.  ￼

Tertiary surface: anchored popover

For uncertainty or manual correction, open a popover from the menu bar item:
	•	“This looks like Project Alpha. Correct?”
	•	buttons:
	•	yes
	•	belongs to another task
	•	intentional detour
	•	pause coaching 10m

Apple describes popovers as transient and anchored to existing content. That is exactly what you want for lightweight correction.  ￼

Avoid by default: floating overlay panel

Do not make a floating panel your default feedback surface. Panels float above other windows and are meant for supplementary controls. They are too intrusive for an always-on coach. Use a floating panel only in an explicit “focus mode.”  ￼

The actual feedback design that works psychologically

Your product is a JITAI: a just-in-time adaptive intervention. That means the whole system wins or loses on timing, tailoring, and restraint. The design literature defines JITAIs as interventions that deliver the right type and amount of support at the right time based on changing context, and digital behavior-change reviews repeatedly find that self-monitoring, goal setting, prompts/cues, descriptive feedback, and positive reinforcement are the core ingredients.  ￼

Use these psychological levers

1) Self-monitoring
Always show:
	•	current priority
	•	current inferred task
	•	elapsed aligned time today

That alone changes behavior.

2) Goal setting + implementation intentions
Every morning, define:
	•	the goal
	•	the proof of being on it
	•	the derailers
	•	the recovery move

Example:
	•	“Priority: pricing page.”
	•	“Valid contexts: Figma, Notion spec, competitor pages.”
	•	“If I drift into X, then I return immediately or mark it intentional.”

That structure is stronger than a generic todo list.  ￼

3) Competence-supportive praise
Praise must be:
	•	specific
	•	earned
	•	tied to the chosen goal

Good:
	•	“27 minutes locked on pricing page. Stay on it.”
	•	“You kept the block clean. Keep shipping.”

Bad:
	•	“Amazing job!!!”
	•	“You are so productive!”

Self-determination theory consistently shows that autonomy and competence support strengthen intrinsic motivation, and positive performance feedback works because it supports competence.  ￼

4) Autonomy-supportive correction
Your reminders should never sound like a scolding parent.

Good:
	•	“This looks outside Priority 1. Return now or mark it as intentional.”
	•	“I’m not sure this belongs. Which task is it supporting?”

Bad:
	•	“Stop wasting time.”
	•	“You are distracted.”

Autonomy support matters for motivation and engagement.  ￼

5) Graded escalation
Use this ladder:
	•	silent menu bar color change
	•	soft reminder
	•	explicit uncertainty prompt
	•	temporary lock-in mode only if user asked for it

Do not jump straight to interruption.

6) Intentional break mode
Add:
	•	pause 10m
	•	admin block
	•	meeting block
	•	research detour
	•	personal break

Without this, the app becomes a liar because real workdays include legitimate context switching.

7) End-of-day learning loop
At day end:
	•	show aligned hours by task
	•	show ambiguous periods
	•	ask for 1-click relabeling of the biggest unknown chunks
	•	update rules

That is where learning compounds.

The simplest strong product version

V1
	•	native macOS menu bar app
	•	launch at login
	•	ScreenPipe as data source
	•	your own SQLite DB
	•	rule engine + weighted scorer
	•	LLM fallback on ambiguity only
	•	menu bar + notifications + popover
	•	morning planner + end-of-day review

V2
	•	split heavy inference into helper process via XPC
	•	nightly compaction / model updates
	•	cross-device sync
	•	team mode / shared taxonomy

Apple’s XPC docs position XPC services as lightweight helper tools managed by launchd, which is the right direction once you outgrow a single-process app.  ￼

The sharpest design rule

Classify progress, not apps.

A good system does not ask:
	•	“Is he in Chrome?”

It asks:
	•	“Does the recent evidence advance the declared outcome?”

That one distinction decides whether this becomes a useful coach or an annoying nanny.

Extremely smart questions that decide the project
	1.	Is this a private tool for you, or the seed of a product you want to sell?
	2.	Do you want the agent to optimize for attention, time attribution, or output shipped? Those are different products.
	3.	Are priorities top-level outcomes (“close client X”), concrete tasks (“write landing page”), or modes (“deep work / admin / meetings”)?
	4.	What counts as a legitimate detour: research, Slack coordination, email, AI chat, calendar, short breaks?
	5.	How expensive is a false positive reminder compared with a missed reminder? That should set your confidence thresholds.
	6.	Do you want the system to learn only from explicit corrections, or also from sustained confirmed focus blocks?
	7.	Should meetings count as “on task” only when they directly support a declared priority, or always count as legitimate work?
	8.	Do you want local-only inference, or are you fine sending ambiguous snapshots to a cloud model?
	9.	Do you want the reinforcement style to be calm, hard-edged, competitive, or identity-based? That changes adherence.
	10.	Do you want App Store distribution? If yes, sandboxing, login-item architecture, and permissions become stricter immediately.
	11.	Should the agent ever auto-block distractions, or remain purely advisory? That is a completely different trust contract.
	12.	What is the smallest unit you want to learn: app, URL, project, document, person, or recurring workflow?

The highest-leverage next step is to answer questions 2, 3, 4, 5, and 11 first. Until those are nailed, the architecture stays blurry.


# Concept 2

Yes. Build this as a local-first Mac menu-bar coach.

ScreenPipe is the sensing layer.
Your app is the brain.
Your own SQLite DB is the learning memory.

That split is correct because ScreenPipe already gives you the hard observability primitives: local capture of screen/audio, structured text via accessibility with OCR fallback, a local API on localhost:3030, event streams (/ws/events, SSE), compressed activity summaries, UI event search, UI element search, tags, memories, and local storage in ~/.screenpipe/. You do not need to build capture first. You need to build judgment, feedback, and learning on top of it.  ￼

1. The right architecture

[ScreenPipe]
   ├─ /ws/events
   ├─ /activity-summary
   ├─ /search
   ├─ /ui-events
   ├─ /elements
   ├─ /tags
   └─ /memories
        │
        ▼
[Activity Aggregator]
        │
        ▼
[Task Classifier]
   ├─ deterministic rules
   ├─ semantic LLM pass
   └─ uncertainty detector
        │
        ▼
[Decision Engine]
   ├─ on-task
   ├─ off-task
   ├─ uncertain
   ├─ break
   └─ meeting/support work
        │
        ▼
[Feedback Engine]
   ├─ praise
   ├─ redirect
   └─ clarification question
        │
        ▼
[Mac UI Layer]
   ├─ menu bar status
   ├─ local notifications
   └─ quick correction popover

[Learning Store]
   ├─ tasks
   ├─ daily plans
   ├─ context rules
   ├─ episodes
   ├─ corrections
   └─ feedback history

The key design choice is this:

Do not build one giant agent. Build four narrow agents inside one product.
	1.	Planner agent
Runs in the morning. Captures today’s priorities in a structured way.
	2.	Classifier agent
Watches recent activity and decides which task it belongs to.
	3.	Coach agent
Decides whether to praise, remind, or ask.
	4.	Learner agent
Digests corrections and updates task-context rules overnight.

That is far more robust than a single magical prompt.

2. Where the agent should be defined

Define the agent in your own app repo and config, not only inside ScreenPipe pipe.md.

ScreenPipe pipes are just scheduled .md prompt files with interval/daily/cron/manual schedules. They are excellent for batch jobs and summaries. They are not the right place to encode your entire coaching brain, especially because you want low-latency, stateful, user-specific behavior during the day. ScreenPipe’s own docs position pipes as scheduled agents, while the platform separately exposes real-time event streaming via WebSocket and SSE.  ￼

Define the agent here
	•	Policy layer in versioned YAML/JSON:
	•	task schema
	•	scoring weights
	•	feedback thresholds
	•	uncertainty thresholds
	•	reminder styles
	•	Prompt layer for LLM subroutines:
	•	planner prompt
	•	semantic classifier prompt
	•	nightly learner prompt
	•	Code layer:
	•	state machine
	•	scoring logic
	•	cooldown logic
	•	persistence
	•	UI actions

Best split
	•	ScreenPipe = raw evidence
	•	Your supervisor service = decision maker
	•	Your DB = source of truth for learned mappings
	•	ScreenPipe tags/memories = mirrored annotations for searchability and audit trail

3. How it should continually work on macOS

Run the continuous coach as a user-level background helper, not as a system daemon.

Apple’s guidance is clear: launch daemons run in system context and cannot access the window server or present GUI; launch agents run in the logged-in user context and can communicate in the user session. On modern macOS, SMAppService is the Apple API for registering LoginItems, LaunchAgents, and LaunchDaemons. For a utility that stays out of the Dock, Apple also provides the agent-style app mode via LSUIElement.  ￼

Correct Mac process model
	•	Menu bar app
SwiftUI/AppKit shell. Visible. Very thin.
	•	Supervisor helper
Always-on user-level helper launched at login.
	•	IPC between them
XPC is the clean Apple-native choice for splitting app + helper, and Apple explicitly calls XPC the easiest way to launch and communicate with a daemon/service.  ￼

Continuous loop

Use an episode-based loop, not frame-by-frame classification.

ScreenPipe itself is event-driven: app switch, window focus, click/scroll, typing pause, clipboard copy, plus idle fallback around every ~5 seconds. That means your classifier should aggregate 30–90 seconds of context into an “episode” before judging, instead of reacting to every microscopic change.  ￼

Ingestion strategy

Use this order:
	1.	Primary: /ws/events
Real-time OCR, audio, and UI events.  ￼
	2.	Secondary: /activity-summary
Cheap compressed summary for the last window. Returns app usage, recent texts, audio summary, and time range. This is perfect for lightweight classification.  ￼
	3.	Deep dive when needed:
	•	/ui-events for app switches, window focus, keystrokes, clipboard, clicks, scrolls
	•	/elements for semantic UI text with app/time filters
	•	/search for browser URL, app, window name, text retrieval  ￼

Classifier stack

Do this in layers:

Layer 1: deterministic
	•	app name
	•	browser domain / URL
	•	window title regex
	•	known allowed/disallowed contexts
	•	continuity with prior episode

Layer 2: semantic
	•	recent visible text
	•	UI element text
	•	recent typed text / clipboard
	•	audio transcript if meeting/research work matters

Layer 3: uncertainty
	•	if score is ambiguous, ask the user

That is the right architecture because “tools belong to task” is too primitive. The same app can be both productive and destructive. Chrome is the obvious example. Slack too. You need context mapping, not merely app mapping. ScreenPipe’s API already exposes app name, window name, browser URL, UI events, and UI element text, which is exactly what makes this possible.  ￼

Recommended decision thresholds for v1
	•	On-task: confidence > 0.80 for 10+ minutes
	•	Off-task: confidence < 0.35 for 2–3 minutes
	•	Uncertain: 0.35–0.80 sustained for 60–90 seconds
	•	Praise: first praise after 25–35 minutes aligned, then max once per focus block
	•	Reminder cooldown: no repeat reminder inside 10 minutes unless drift worsens

That gives you a strong coach without turning into notification spam.

4. Where to save “what tools belong to what task”

Use your own SQLite database as the source of truth.
Do not write your custom schema into ScreenPipe’s SQLite file.

ScreenPipe already stores its own metadata in ~/.screenpipe/db.sqlite, exposes raw_sql, supports tags, and supports arbitrary “memories.” That makes it tempting to piggyback on its DB. Don’t. Your product needs an upgrade-safe schema that you own. Use ScreenPipe as evidence storage, not as your business-logic database. Mirror labels back into ScreenPipe through tags and memories for traceability.  ￼

Store this schema

tasks
- id
- date
- priority_rank
- title
- outcome_definition
- notes

task_context_rules
- id
- task_id
- context_type   // app, domain, window_regex, keyword, ui_role, semantic_pattern
- value
- relation       // core, support, distraction
- weight
- source         // manual, learned, corrected
- confidence
- confirmations_count

episodes
- id
- start_ts
- end_ts
- top_app
- top_domain
- window_title
- text_summary
- predicted_task_id
- predicted_state
- confidence

corrections
- id
- episode_id
- user_task_id
- user_state
- note

feedback_events
- id
- episode_id
- feedback_type  // praise, redirect, ask
- shown_at
- acted_on

daily_plans
- id
- date
- plan_json

Store contexts, not just tools

Bad model:
	•	Chrome -> task A

Correct model:
	•	Chrome + github.com/client-x + PR window title -> task A
	•	Chrome + docs.google.com/spec + keywords -> task B
	•	Chrome + youtube.com unrelated -> distraction
	•	Slack + #client-x + recent continuity -> support for task A

Learning rule
	•	Explicit correction beats inference
	•	One correction creates a weak learned rule
	•	Three consistent corrections promote it to a stronger rule
	•	Manual rules always outrank learned rules

Mirror into ScreenPipe

Use ScreenPipe as an audit layer:
	•	add tags like task:priority1, task:support, state:off-task
	•	create daily memories summarizing what the system learned
	•	attach memories to representative frame_ids where helpful  ￼

5. Best visual feedback on a Mac

The best UI is:

Menu bar extra + actionable local notifications + popover correction UI

That is the winning combo.

Apple’s MenuBarExtra is specifically meant for persistent utility controls in the system menu bar, and Apple documents both menu and window-style presentations, including a popover-like window style. Apple’s notification framework is built for timely, relevant local notifications, and actionable notifications let the user respond directly from the notification interface.  ￼

What to show

Persistent menu bar status
	•	green = aligned
	•	amber = uncertain
	•	red = drifted
	•	show current task + streak timer

Example:
	•	P1 · 28m
	•	? · unclear
	•	Off

Local notification for praise
	•	“28 minutes aligned with Priority 1. Stay on it.”

Local notification for drift
	•	“This looks unrelated to today’s priorities. Resume Priority 1?”

Actionable notification for uncertainty
Buttons:
	•	Priority 1
	•	Priority 2
	•	Break
	•	Other

Popover from menu bar
Use this for:
	•	morning planning
	•	editing allowed/disallowed contexts
	•	reviewing corrections
	•	seeing “why did I get this reminder?”

What to avoid
	•	floating bubble always on screen
	•	modal alerts
	•	sound-heavy nudges
	•	praise every few minutes

Those become wallpaper fast and then they become irritants.

6. Psychological design: what actually works

The correct psychological model is JITAI + implementation intentions + progress monitoring + autonomy-supportive feedback.

JITAIs are explicitly designed to deliver the right amount and type of support at the right time, adapting to the person’s changing state and context. Monitoring goal progress is an effective self-regulation strategy, and interventions that increase the frequency of progress monitoring tend to improve goal attainment. Implementation intentions — “if X happens, I do Y” — help translate goals into action, with a medium-to-large overall effect in the cited meta-analysis.  ￼

Also, motivation works better when the system supports autonomy, competence, and relatedness. Deci and Ryan’s self-determination theory is extremely relevant here: people sustain better motivation and well-being when environments support competence and autonomy rather than control and alienation.  ￼

And there is one hard warning from the interruption literature: too many notifications degrade performance and increase strain. A 2023 field experiment found that reducing notification-caused interruptions benefited both performance and strain. So your system must be sparse, stateful, and selective.  ￼

What this means in product terms

Morning prompt should be stronger than:
“What are my priorities today?”

Ask this instead:
	1.	What are today’s top 1–3 priorities?
	2.	What does done look like for each?
	3.	Which apps/sites/people are valid contexts for each?
	4.	Which temptations should trigger a reminder?
	5.	If you drift, what should I ask:
	•	“Resume?”
	•	“Which task is this?”
	•	“Take a break or refocus?”

That is implementation-intention capture.

Praise style
Use competence feedback, not fake cheerleading.

Good:
	•	“You stayed aligned with Priority 1 for 31 minutes.”
	•	“This block is clean. Keep going.”

Bad:
	•	“Amazing superstar!!!”
	•	gamified infantilizing nonsense

Drift style
Use discrepancy + next step, not guilt.

Good:
	•	“This does not match today’s priorities. Resume Priority 1 or classify this as support work?”

Uncertainty style
Make it one-tap and low-friction.

Good:
	•	“Does this belong to Priority 1, Priority 2, admin, or break?”

Other psychological options that fit this product
	1.	Focus blocks
Let the user start a 25/50-minute block deliberately.
	2.	Support work mode
Not everything is core deep work. Admin, communication, and research need a legitimate category.
	3.	Break mode
A real break should not be treated as failure.
	4.	End-of-day review
Show:
	•	what actually got attention
	•	where drift happened
	•	what rules got learned
	5.	Escalation ladder
	•	first drift: subtle reminder
	•	repeated drift: explicit question
	•	repeated confirmed distraction: optional blocker integration later

7. Best MVP

Build this first:
	•	local-only
	•	one Mac menu-bar app
	•	one user-level supervisor helper
	•	one SQLite DB
	•	ScreenPipe as input source
	•	deterministic classifier first
	•	LLM only for ambiguity and nightly learning
	•	actionable notifications
	•	manual corrections
	•	no cloud
	•	no multi-device sync
	•	no autonomous control of apps yet

That MVP is clean, powerful, and shippable.

8. Extremely smart questions that will lock the architecture

Answer these and the product becomes sharp:
	1.	What is the real unit of work?
Task, project, client, role, or outcome?
	2.	Is “support work” valid work?
Email, Slack, research, meetings, admin — are these separate tasks or support for a priority?
	3.	Which failure hurts more?
False positive (“you’re distracted” while working) or false negative (silent drift)?
	4.	What is the intervention latency you want?
60 seconds, 3 minutes, 10 minutes?
	5.	Should the system optimize for completion or allocation?
Finish one thing, or spend time according to plan?
	6.	How should breaks be treated?
Neutral, encouraged, or limited?
	7.	What should happen in browsers?
On-task by default unless blacklisted, or off-task by default unless matched to a priority?
	8.	Do you want daily plans to overwrite learned rules, or only bias them?
This decides whether learning is global or day-specific.
	9.	Should meetings suppress reminders automatically?
If yes, what counts as a real meeting?
	10.	Does the product have permission to add friction later?
Example: blocklist, countdown before opening distracting apps, site blockers.
	11.	What privacy boundary is non-negotiable?
Fully local forever, or optional encrypted sync later?
	12.	What tone should the coach have?
Spartan, warm, strict, blunt, humorous?

The smartest product choice is question 3. That single answer determines your thresholds, UI aggression, and whether users love or uninstall it.

Final recommendation

Build a native Mac menu-bar coach that runs as a user-level helper, consumes ScreenPipe’s real-time events and summaries, stores learned task-context rules in your own SQLite, mirrors labels back into ScreenPipe tags/memories, and uses sparse actionable notifications plus a menu-bar popover for feedback and correction. That is the right architecture.


# Concept 3

Yes. Then the whole product changes.

This is not a productivity assistant.
It is a Focus Guardian.

The design law is simple:

The agent must interrupt less than the distractions it prevents.

Apple explicitly treats alerts as interruptions and local notifications as mechanisms to get a user’s attention, while attention-residue research shows that switching tasks degrades subsequent performance because attention stays stuck on the previous task. That means praise must be mostly ambient, and disruptive prompts must be rare, short, and high-confidence.  ￼

1. Best architecture for a focus-protection product

Define the real agent in your own native Mac app, not inside Screenpipe. Screenpipe is the sensing and memory layer: it captures screen and audio locally with an event-driven architecture, stores data in local SQLite, exposes a REST API on localhost:3030, and includes endpoints like /search, /elements, and /frames/{id}/context. Its pipes are scheduled AI agents defined as markdown files that run on intervals. That makes Screenpipe excellent for sensing, summaries, and batch workflows. It does not make Screenpipe the right home for a real-time focus guardian.  ￼

The permanent guardian belongs in a menu bar app launched at login. Apple positions menu bar extras for app-specific functionality that remains available even when the app is not frontmost, and SMAppService is the current macOS mechanism for login items, launch agents, and helper executables. That gives you the correct OS-level shape for a focus protector that is always present but never noisy.  ￼

Use this architecture:

Morning Planner
    ↓
Focus Contract
    - one protected outcome
    - allowed contexts
    - blocked contexts
    - if-then rules
    - done condition

Screenpipe Sensor Layer
    - recent screen context
    - app/window/url
    - accessibility text
    - OCR fallback
    - input events
    - audio/transcript if needed
    ↓
Feature Extractor
    ↓
Rule Engine
    - exact app/url/window/domain matches
    - allow/deny lists
    - time-block rules
    ↓
Context Classifier
    - on-task
    - support-task
    - off-task
    - uncertain
    - break
    ↓
Focus State Machine
    - arming
    - protected focus
    - soft drift
    - hard drift
    - uncertain
    - break
    ↓
Intervention Engine
    - ambient praise
    - subtle warning
    - 1-click clarify
    - hard redirect
    - optional blocker
    ↓
Learning Store
    - user confirmations
    - false positives
    - tool/task evidence
    - intervention outcomes

2. How it should run continuously

Run a lightweight loop every 10–15 seconds, but never react to single frames. Aggregate the last 60–90 seconds into a rolling context window, then classify. Screenpipe already gives you the raw ingredients for this because it captures meaningful OS events such as app switches, window focus changes, clicks, scrolls, typing pauses, clipboard events, and idle fallback captures.  ￼

That state machine should behave like this:
	•	Protected focus: high-confidence match to the active focus contract
	•	Soft drift: weak off-task evidence for 30–45 seconds
	•	Hard drift: strong off-task evidence for 90+ seconds
	•	Uncertain: ambiguous evidence that stays unresolved
	•	Break: explicit break or idle pattern

The critical trick is this: uncertain states should not trigger an immediate question. Wait for a natural micro-boundary such as a typing pause, app switch, or small lull, then ask. Screenpipe already detects typing pauses and switches, and that aligns with the goal of avoiding new attention residue created by the agent itself.  ￼

3. The correct data model

Do not save flat truths like:

“Slack belongs to Task A.”

That is primitive and wrong.

Save weighted evidence:
	•	focus_contracts
	•	allowed_contexts
	•	blocked_contexts
	•	context_observations
	•	classifications
	•	user_corrections
	•	tool_affinities
	•	interventions
	•	outcomes

Example of the right mental model:

“Slack + channel launch + person Max + keyword pricing + time block 09:00–11:00 = strong evidence for Task A.”

Keep that in a separate local SQLite database owned by your app. Screenpipe already has its own SQLite and media store for frames, OCR, accessibility text, transcriptions, UI elements, and input events. Your database should store references, labels, weights, and learning, not duplicate raw capture.  ￼

4. The best Mac UI for focus protection

The best UI is three-layered.

Layer 1: Menu bar status is primary.
That is the always-visible, non-invasive surface. Apple positions menu bar extras exactly for app-specific functionality available while the app is running, even when it is not frontmost. Put the current protected task, timer, and status there.  ￼

Layer 2: HUD panel for ambiguity or hard drift.
Apple describes HUD-style panels as transient panels that work well in visual contexts. Use a tiny non-chatty panel with one-click actions only. No text field. No conversation. Just:
	•	Back to focus
	•	This belongs to support task
	•	This is a break
	•	Don’t ask again for this context

That is the right UI for “I’m not sure.”  ￼

Layer 3: Local notifications only for real escalations.
Use standard notifications only when the system needs to actively regain attention, not for ordinary praise. Apple’s own guidance makes the tradeoff clear: notifications and alerts are attention-grabbing interruptions. Use them for hard drift, not for routine reinforcement.  ￼

The concrete visual design should be:
	•	Green ring in menu bar = on task
	•	Yellow ring = uncertain
	•	Red ring = drift
	•	Gray ring = break
	•	Tiny HUD only for ambiguity or repeated drift
	•	Notification only after confirmed off-task drift and only if the softer layers failed

Morning planning belongs in a sheet, not a chat window. Apple positions sheets for requesting specific information or presenting a simple task before returning to the parent view. That exactly matches “define today’s protected focus.”  ￼

5. The psychology that actually works for this product

A. Implementation intentions are the strongest morning lever

Do not ask only:

“What are your tasks today?”

Ask:
	•	What is the one output that makes today a win?
	•	Which apps/sites/people are allowed inside that work?
	•	Which distractions are banned?
	•	When distraction X appears, what is the default response?

That is an implementation-intention system. The meta-analysis found a medium-to-large improvement in goal attainment (d = .65), and specifically found benefits for shielding ongoing goal pursuit from unwanted influences. That is exactly your product.  ￼

B. Context redesign beats nagging

Habits are strongly cued by context, and changing context disrupts strong habits. That means the highest-leverage intervention is not another reminder. It is friction on the bad context and fluency in the good context. For known distractors, escalation should move from reminder to friction:
	1.	visual warning
	2.	one-click redirect
	3.	optional website/app block for the rest of the focus block

That works because distraction is usually context-triggered, not freshly reasoned each time.  ￼

C. Autonomy and competence matter more than control

Self-Determination Theory identifies autonomy, competence, and relatedness as core needs that support self-motivation and healthy self-regulation. So the agent must feel like a self-authored protector of the user’s chosen priority, not a manager standing over their shoulder. The user defines the focus contract. The agent protects it. Override, snooze, and break mode stay under user control.  ￼

D. Feedback helps, but sloppy feedback hurts

Kluger and DeNisi’s meta-analysis found feedback improves performance on average (d = .41) but over one-third of feedback interventions reduced performance. Their explanation is decisive: feedback gets worse when attention shifts away from the task and toward the self. So your agent must never praise identity and never moralize. It must reinforce task behavior only.  ￼

Good feedback:
	•	“32 minutes stable on proposal draft.”
	•	“You protected the block from two distractions.”

Bad feedback:
	•	“You are disciplined.”
	•	“You are a productivity beast.”

The first strengthens the task loop. The second turns the experience into ego theater.

E. Positive feedback works through self-efficacy

Experimental evidence shows positive feedback increases self-efficacy, and that self-efficacy then carries indirect benefits for performance and flow. So positive reinforcement belongs in the product, but it must be specific, earned, and believable.  ￼

The right form is:
	•	sparse
	•	concrete
	•	based on protected focus time or visible progress
	•	not emotionally inflated

That is why the best praise is usually ambient:

“28 min on the pricing model. Stay with it.”

Not a celebratory pop-up.

F. Frame progress differently depending on the moment

Research on feedback valence and progress monitoring shows a crucial asymmetry: after positive feedback, focusing on accumulated progress boosts persistence more; after negative feedback, focusing on remaining progress boosts persistence more.  ￼

So the agent should say:

When on track:
	•	“2 of 4 focus blocks done.”

When drifting:
	•	“18 minutes left to finish the current draft section.”

That is the correct psychological framing.

G. Use Hooked selectively, not literally

Nir Eyal’s Hooked model is Trigger → Action → Variable Reward → Investment. For this product, use it with discipline. The right translation is:
	•	Trigger: start of block, detected drift, planned checkpoint
	•	Action: recommit, relabel, break, return
	•	Investment: user corrections train the model and improve future protection

Use Variable Reward weakly. Eyal’s own model says variable rewards create wanting and repeated return. That is useful for engagement products. It is dangerous for a focus protector because it can turn the coach itself into another thing the user checks. Here, the design goal is the opposite: fewer interruptions, less compulsive checking, more uninterrupted work. That is a design conclusion from Hooked plus interruption research.  ￼

6. The product rule that matters most

Optimize for these metrics:
	•	Protected Focus Minutes
	•	Distraction Recovery Time
	•	False Interrupt Rate
	•	Clarification Burden
	•	Most Important Outcome Completion Rate

Do not optimize for:
	•	daily opens
	•	notification clicks
	•	streaks
	•	engagement with the coach

A focus protector that maximizes engagement with itself is a fraud.

7. The biggest product risk

The product must never feel like surveillance.

That risk is real. A meta-analysis on electronic monitoring found slightly lower job satisfaction, slightly higher stress, and no overall performance gain on average; it also found that monitoring feedback and performance targets can exacerbate negative effects. That means your system must stay local-first, explicit, user-owned, and reversible. Otherwise it will create reactance and lose the user.  ￼

8. My strongest recommendation for V1

Build this first:
	1.	One active protected outcome per focus block
	2.	Native Mac menu bar app
	3.	Launch at login
	4.	Screenpipe as sensor layer only
	5.	Rule engine first, LLM only for ambiguity
	6.	Ambient reinforcement, not praise notifications
	7.	1-click ambiguity resolution
	8.	Escalation to blocker for repeated known distractors
	9.	Separate local learning DB
	10.	End-of-day review to improve tomorrow’s rules

That is the highest-leverage design.

9. The smartest questions to settle next
	1.	What exactly is the protected unit: outcome, task, or project?
	2.	Which “off-task” behaviors are actually legitimate support work inside a focus block?
	3.	When uncertainty appears, should the system ask immediately or wait for the next natural pause?
	4.	After repeated drift, should the guardian escalate to friction/blocking, or stay at reminders only?
	5.	Do you want the product to optimize for deep uninterrupted minutes or for shipped outcomes per week?

Answer those five, and I’ll turn this into a concrete V1 spec with the state machine, database schema, and intervention logic.
