# Hooked + Positive Reinforcement Ideas

## Goal

Use the strongest parts of `Hooked` and positive reinforcement (`positive Verstaerkung`, shaping, competence-supportive feedback) to make the product more habit-forming around extraordinary goals.

Important design stance:

- Make the `goal pursuit loop` addictive, not the `coach checking loop`.
- Reinforce progress on self-authored priorities, not dependency on notifications.
- Push harder toward extraordinary goals without becoming controlling, guilt-heavy, or noisy.

This note is aligned with the current direction in `docs/SoftwareArchitecture.md` and `docs/UserStories.md`: local-first, explainable, autonomy-supportive, and focused on real progress rather than screen time.

## Research Synthesis

### 1. Hooked is useful, but only if applied to the work itself

- The Hooked model is `Trigger -> Action -> Variable Reward -> Investment`.
- The most important design move is not generic engagement. It is creating a tight repeat loop between a real user problem and a simple behavior that helps solve it.
- Variable rewards are powerful because they keep attention alive through uncertainty and anticipation.
- Investment matters because each small act by the user can improve the next pass through the loop and "load the next trigger."

Product implication:

- The trigger should be `boredom, uncertainty, overwhelm, drift, or block start`, not "open the app for no reason."
- The action should be the `smallest useful recommitment behavior`.
- The reward should be `felt momentum, visible progress, competence, or occasional surprise`.
- The investment should improve the next session by teaching the system more about goals, distractors, allowed support work, and recovery patterns.

### 2. Positive reinforcement works best when it is immediate, specific, and autonomy-supportive

- Positive feedback can increase intrinsic motivation when it supports competence.
- That effect weakens or reverses when feedback becomes controlling, pressuring, or ego-focused.
- Shaping works by reinforcing successive approximations, not waiting only for the final heroic outcome.
- Early learning benefits from continuous reinforcement; later maintenance benefits from intermittent reinforcement.

Product implication:

- Reward `returning`, `staying`, `finishing the next visible step`, and `accurate self-classification`.
- Praise the `behavior and evidence`, never the user's identity.
- Start with frequent micro-confirmations when a behavior is new, then thin them out as the habit stabilizes.
- Use challenge calibration so the user feels stretched, not crushed.

### 3. Extraordinary goals need challenge plus momentum

- Extraordinary goals usually fail for two reasons: the next step is unclear, or the user loses emotional contact with progress.
- Positive reinforcement helps when it makes competence visible.
- Hooked helps when it turns uncertainty and friction into a repeatable response loop.

Product implication:

- Every focus block should have one concrete "next visible step."
- Every drift state should resolve into an obvious re-entry action.
- The system should create more "I am advancing" moments during ambitious work, especially when the final outcome is still far away.

## Product Direction

The product should become a `goal-binding system`:

- It should attach recurring internal triggers like uncertainty, avoidance, and boredom to a fast recommitment behavior.
- It should reward deep work, recovery, and milestone movement in a way that feels earned.
- It should convert every clarification, correction, and completed block into better future coaching.

The user should gradually build this habit:

`I feel drift or friction -> I re-enter the extraordinary goal quickly -> I get immediate evidence that I am back on track -> the system gets smarter for next time`

That is the right kind of addictive loop for this product.

## Future Tasks

### P0: Strengthen the Hook Around Focus Blocks

- Add an `internal trigger taxonomy` to the domain model: boredom, uncertainty, overwhelm, perfectionism, novelty-seeking, avoidance, tiredness, and post-interruption residue.
- For each internal trigger, define the preferred `micro-action`: recommit, clarify, support-task switch, intentional break, or reduce scope.
- Extend `DailyPlan` / `FocusBlock` with a required `next_visible_step` so every redirect points to a concrete re-entry anchor instead of a vague project name.
- Add a `block-start contract` that captures: goal, definition of done for this block, allowed contexts, likely distractors, and 1-3 if-then rules.
- Turn the current drift model into an explicit Hook loop:
  `trigger = drift signal`
  `action = back/support/break`
  `reward = quick competence signal`
  `investment = saved clarification for future classification`

### P0: Introduce a Marker-Signal System

- Create a tiny vocabulary of conditioned markers that always mean the same thing:
  `Locked.` for stable alignment,
  `Check.` for soft drift,
  `Reset.` for hard drift,
  `Back.` for successful recovery,
  `Clear.` for ambiguity resolved,
  `Closed.` for milestone completion.
- Pair each marker with the same visual language in the menu bar and HUD so the signal becomes recognizable before the user even reads the sentence.
- Keep marker messages short and task-level:
  `Locked. 12 clean min on Pricing Memo.`
  `Back. Resume section 2: assumptions.`
- Limit high-interruption marker delivery. Most markers should stay ambient in the menu bar or compact HUD, not notification banners.

### P0: Shape Deep Work Instead of Waiting for Heroics

- Build a `focus shaping ladder` for every block:
  `returned within 20s -> 3 clean min -> 10 clean min -> 25 clean min -> block completed -> outcome completed`
- Reward quick recovery as aggressively as sustained focus, especially in early habit formation.
- Track the current shaping level per goal and per work type so the system adapts to writing, coding, research, admin, and outreach separately.
- Only escalate the criterion after the user is reliably hitting the current level.

### P0: Improve Reinforcement Quality

- Rewrite praise and redirect copy so every message follows this structure:
  `marker + concrete context + progress frame + next move`
- Prefer competence feedback:
  `Protected 2 of 4 blocks today.`
  `Strong recovery. Finish bullet 3.`
- Avoid identity praise:
  no `You are disciplined`, `You are amazing`, `Top performer`, or similar lines.
- After success, frame `accumulated progress`.
- After drift, frame `remaining path`.

### P0: Make Investment Real

- After every ambiguity resolution, optionally offer `remember this pattern` so the user invests a tiny bit of effort that improves future classification.
- Save investments as conditional evidence, not blunt truths:
  `Chrome + docs + repo keywords + morning block -> supports Task A`
  instead of `Chrome is productive`.
- Let users define `allowed support work packs` per goal so the system becomes easier to satisfy over time.
- Use block-completion confirmations to store what actually counted as progress for that goal.

### P1: Add Variable Rewards That Support Extraordinary Goals

- Use `rewards of the self` through mastery signals:
  personal-best clean blocks, faster recovery, tougher blocks held, improved estimate accuracy.
- Use `rewards of the hunt` through progress discovery:
  artifact detection, milestone recognition, unexpected progress summaries, and "you are closer than expected" moments.
- Use `rewards of the tribe` carefully and optionally:
  exportable weekly recap, accountability share, mentor check-in packet, or self-written note to future self.
- Keep reward timing somewhat variable, but never notification-heavy or slot-machine-like.
- Put variability in `wording`, `jackpot intensity`, and `which real milestone gets surfaced`, not in random interruptions.

### P1: Calibrate Challenge for Extraordinary Goals

- Add an `optimal challenge` layer that detects when a goal is too vague or too large for sustained engagement.
- When the system detects overwhelm, it should shrink the immediate target instead of only saying "refocus."
- Add a `stretch mode` for explicitly chosen ambitious goals:
  harder thresholds,
  more precise recommitments,
  richer progress evidence,
  slightly more assertive redirects,
  but still full pause and override control.
- Separate `focus quality` from `goal difficulty` so the user can feel successful while still tackling unusually hard work.

### P1: Build an Extraordinary Goal Arc

- Let the user mark 1 goal as the current `extraordinary goal`.
- Give that goal stronger hooks:
  more explicit if-then plans,
  tighter support-context definitions,
  richer milestone ladders,
  and more visible weekly compounding progress.
- Show the cost of drift against that goal in concrete terms:
  `one protected block today likely finishes the draft`
  instead of generic guilt.
- Build a weekly reflection that highlights compounding evidence:
  blocks protected,
  artifacts created,
  milestone velocity,
  and strongest recovery patterns.

### P2: Add Adaptive Reinforcement Schedules

- Start new goals with continuous reinforcement for correct starts, quick returns, and clean 10-minute holds.
- As the behavior stabilizes, move to intermittent reinforcement so the user does not become dependent on praise frequency.
- Reserve `jackpot` moments for genuinely important wins:
  protected a hard block after repeated drift,
  completed a milestone on a difficult goal,
  sustained a new habit for several days,
  or closed a meaningful work artifact.
- Make jackpots informative, not childish.

## Concrete UX Ideas

- Block-start prompt:
  `Protected block: Fundraising memo. End state: draft section 2. If Slack opens, #fundraising only, then back.`
- Soft drift:
  `Check. This looks outside the block. 18 min left. Back / Support / Break`
- Hard drift:
  `Reset. 4 min outside the block. Close LinkedIn. Open Fundraising memo.`
- Recovery:
  `Back. Resume at section 2: objections.`
- Milestone recognition:
  `Closed. Memo draft moved from outline to v1.`

## Anti-Patterns To Avoid

- Do not optimize for opening the coach more often.
- Do not use streak-loss punishment as a primary motivator.
- Do not make rewards random without relation to real progress.
- Do not use ego praise or moral language.
- Do not increase interruption frequency just because variable rewards are powerful.
- Do not let the system feel like surveillance or external control.

## Good Success Metrics

- Faster average recovery after soft drift.
- Higher share of focus blocks that reach planned block outcomes.
- More user-confirmed milestone completions on extraordinary goals.
- Lower ambiguity rate over time because investments are improving classification.
- More stable adherence to hard goals across a full week, not just one good morning.
- Lower notification volume per hour while still increasing meaningful progress.

## Sources

- Nir Eyal, `User Behavior and Hooked Book Resources`: https://www.nirandfar.com/hooked-user-behavior-resources/
- Nir Eyal, `Variable Rewards: Want To Hook Users? Drive Them Crazy`: https://www.nirandfar.com/want-to-hook-your-users-drive-them-crazy/
- Nir Eyal, `Hooked Supplemental Workbook`: https://www.nirandfar.com/download/hooked-workbook.pdf
- Ryan and Deci, `Self-Determination Theory and the Facilitation of Intrinsic Motivation, Social Development, and Well-Being`: https://selfdeterminationtheory.org/SDT/documents/2000_RyanDeci_SDT.pdf
- Deci, Koestner, and Ryan, `A Meta-Analytic Review of Experiments Examining the Effects of Extrinsic Rewards on Intrinsic Motivation`: https://selfdeterminationtheory.org/wp-content/uploads/2014/04/1999_DeciKoestnerRyan_Meta.pdf
- Washington State University, `Principles of Learning and Behavior - Operant Conditioning`: https://opentext.wsu.edu/principles-of-learning-and-behavior/chapter/module-6-operant-conditioning/1000/
- Gollwitzer and Sheeran, `Implementation Intentions and Goal Achievement: A Meta-analysis of Effects and Processes`: https://www.sciencedirect.com/science/chapter/bookseries/abs/pii/S0065260106380021
- Self-Determination Theory, `Five Competence-Supportive Behaviors for the Classroom Teacher`: https://selfdeterminationtheory.org/wp-content/uploads/2024/10/5-Teacher-Behaviors-Competence.pdf
