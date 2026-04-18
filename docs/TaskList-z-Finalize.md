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

## 3. 🚢 Bringing It All Together (Integration & Release)
*(Complete this only after Slices 1-5 work end to end locally. This merges the Logic application and native Swift wrapper tightly into a single redistributable unit.)*

**Cross-Cutting Quality Test Actions**
- [ ] Compatibility tests: verify macOS JSON deserializers exactly match TS payloads without schema drift breakages.
- [ ] Replay test traces: Mock JSON streams mapping entirely through all 5 machine states utilizing mock 2-tick intervals. 
- [ ] Paste Sanitizer E2E Check: Explicitly feed raw, aggressively-formatted GPT outputs complete with verbose intro greetings, smart quotes, and code blocks into the macOS fields. Confirm Swift properly cleans and the TS regex passes validation cleanly.
- [ ] UX Alignment checks: Enforce that every possible generated notification adheres natively to the TS `messages.ts` text prefix logic (`Check.` / `Locked.` / `Reset.` / `Back.`).

**Integration, Packing, & Release Pipeline**
- [ ] Package the Node logic environment cleanly using `esbuild` paired natively with `Node SEA` (Single Executable Application wrapper) compiling to a single file.
- [ ] Embed the generated Node binary resource cleanly inside the Xcode Swift App resources root context. 
- [ ] Structure the macOS Application wrapper lifecycle (`AppDelegate`/`App`) to fire an external process spinning up the embedded TS binary immediately on load. Ensure gracefully triggered `SIGTERM`/`SIGKILL` traps immediately collapse the logic binary explicitly on App termination events. 
- [ ] Pass a dynamic local system port flag dynamically from Swift natively down to the TS binary on app-launch to guarantee 0 conflicts against overlapping local host ports. 
- [ ] **E2E Check**: Open App First Run -> Ensure SQLite auto-seeded 1Password / Banking filters natively into DB.
- [ ] **E2E Check**: Run full Morning GPT exchange -> System properly flips from `no_plan` directly to `running` rendering Green.
- [ ] **E2E Check**: Test Observe-Only period functionality -> Run classifier into Hard Drift intentionally -> Confirm UI UI menu bar updates properly to Red internally, but physically suppresses all native OS notification bells.
- [ ] **E2E Check**: Trigger and resolve Hard Drift intentionally post-grace period -> Assert cooldown flag is raised preventing secondary back-to-back pings. Confirm Recovery Anchor fires upon return. 
- [ ] Establish explicit internal Xcode build phases instructing scripts to uniquely code-sign the enclosed Node logic framework prior to the universal outer macOS `.app` envelope receiving an application signature.
- [ ] Upload wrapper entirely through Apple Notarization checks. Test executed App file confirming Network (localhost TS/Screenpipe integration hook) limits functionality persists dynamically.
