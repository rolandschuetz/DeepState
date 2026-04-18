By architecting the software with a strict boundary—**the headless TypeScript layer holds all the logic and memory, while the macOS UI is purely a dumb rendering shell**—both developers can largely work in parallel once Phase 1 (Bridge Contracts) is complete. 

---

## 3. 🚢 Bringing It All Together (Integration & Release)
*(Complete this only after Slices 1-5 work end to end locally. This merges the Logic application and native Swift wrapper tightly into a single redistributable unit.)*

**Cross-Cutting Quality Test Actions**
- [x] Compatibility tests: verify macOS JSON deserializers exactly match TS payloads without schema drift breakages.
- [x] Replay test traces: Mock JSON streams mapping entirely through all 5 machine states utilizing mock 2-tick intervals. 
- [x] Paste Sanitizer E2E Check: Explicitly feed raw, aggressively-formatted GPT outputs complete with verbose intro greetings, smart quotes, and code blocks into the macOS fields. Confirm Swift properly cleans and the TS regex passes validation cleanly.
- [x] UX Alignment checks: Enforce that every possible generated notification adheres natively to the TS `messages.ts` text prefix logic (`Check.` / `Locked.` / `Reset.` / `Back.`).
- [x] Repository tests: verify migration rollback, retention pruning, purge correctness, and bounded busy-retry behavior.
- [x] Screenpipe adapter tests: verify `/search` parsing, missing-field tolerance, dedupe behavior, exclusion filtering, and frame-context enrichment.
- [x] Privacy/safety tests: ensure excluded evidence is never persisted in coach DB and confirm no normal runtime or purge action mutates Screenpipe-owned data.
- [x] UI reconnect/preview tests: cover no-plan, hard-drift, praise, paused, degraded Screenpipe, and reconnect-after-restart states.

**Integration, Packing, & Release Pipeline**
- [x] Package the Node logic environment cleanly using `esbuild` paired natively with `Node SEA` (Single Executable Application wrapper) compiling to a single file.
- [x] Embed the generated Node binary resource cleanly inside the Xcode Swift App resources root context. 
- [x] Structure the macOS Application wrapper lifecycle (`AppDelegate`/`App`) to fire an external process spinning up the embedded TS binary immediately on load. Ensure gracefully triggered `SIGTERM`/`SIGKILL` traps immediately collapse the logic binary explicitly on App termination events. 
- [x] Pass a dynamic local system port flag dynamically from Swift natively down to the TS binary on app-launch to guarantee 0 conflicts against overlapping local host ports. 
- [ ] Implement first-run permission onboarding for Screen Recording, Accessibility, Notifications, and any optional Screenpipe-related audio permissions that the install depends on.
- [ ] Handle wake-from-sleep, lock/unlock, user-switch, and crash-restart lifecycle events so the bridge and scheduler recover cleanly.
- [ ] **E2E Check**: Open App First Run -> Ensure SQLite auto-seeded 1Password / Banking filters natively into DB.
- [ ] **E2E Check**: Run full Morning GPT exchange -> System properly flips from `no_plan` directly to `running` rendering Green.
- [ ] **E2E Check**: Test Observe-Only period functionality -> Run classifier into Hard Drift intentionally -> Confirm UI UI menu bar updates properly to Red internally, but physically suppresses all native OS notification bells.
- [ ] **E2E Check**: Trigger and resolve Hard Drift intentionally post-grace period -> Assert cooldown flag is raised preventing secondary back-to-back pings. Confirm Recovery Anchor fires upon return. 
- [ ] **E2E Check**: Resolve one ambiguity with "remember this pattern", then replay a similar context and verify the system classifies it better without asking again.
- [ ] **E2E Check**: Run export + purge flows and confirm coach data disappears while Screenpipe data remains untouched.
- [ ] Establish explicit internal Xcode build phases instructing scripts to uniquely code-sign the enclosed Node logic framework prior to the universal outer macOS `.app` envelope receiving an application signature.
- [ ] Upload wrapper entirely through Apple Notarization checks. Test executed App file confirming Network (localhost TS/Screenpipe integration hook) limits functionality persists dynamically.
- [ ] Verify app-update behavior: safe DB migration, bridge-version compatibility checks, and clear release-note callouts when logic behavior materially changes.
