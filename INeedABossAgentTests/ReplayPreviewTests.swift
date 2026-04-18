import XCTest

@MainActor
final class ReplayPreviewTests: XCTestCase {
  func testReplayTraceCoversAllFiveRuntimeStatesAtTwoTickIntervals() throws {
    let store = AppStateStore()
    let snapshots = try [
      makeState(streamSequence: 2, runtimeState: .aligned),
      makeState(streamSequence: 4, runtimeState: .uncertain),
      makeState(streamSequence: 6, runtimeState: .softDrift),
      makeState(
        streamSequence: 8,
        runtimeState: .hardDrift,
        interventionKind: .hardDrift,
        interventionTitle: "Check. Refocus now?",
        interventionBody: "Check. You have been away from \"Finish checkout redesign\" for a while."
      ),
      makeState(streamSequence: 10, mode: .paused, runtimeState: .paused),
    ]

    let observedStates = snapshots.compactMap(\.dashboard.currentFocus.runtimeState)
    XCTAssertEqual(observedStates, [.aligned, .uncertain, .softDrift, .hardDrift, .paused])

    for snapshot in snapshots {
      store.apply(snapshot)
    }

    XCTAssertEqual(store.menuBarState.streamSequence, 10)
    XCTAssertEqual(store.menuBarState.mode, .paused)
    XCTAssertEqual(store.menuBarState.viewModel?.runtimeState, .paused)
    XCTAssertEqual(snapshots[3].intervention?.kind, .hardDrift)
  }

  func testPreviewStatesCoverNoPlanHardDriftPraisePausedAndDegradedScreenpipe() throws {
    let noPlan = try makeState(streamSequence: 1, mode: .noPlan, runtimeState: .paused)
    let hardDrift = try makeState(
      streamSequence: 2,
      runtimeState: .hardDrift,
      interventionKind: .hardDrift,
      interventionTitle: "Check. Refocus now?",
      interventionBody: "Check. Return to the active task."
    )
    let praise = try makeState(
      streamSequence: 3,
      runtimeState: .aligned,
      interventionKind: .praise,
      interventionTitle: "Locked. Strong focus sustained",
      interventionBody: "Locked. You held 26 minutes on \"Finish checkout redesign\"."
    )
    let paused = try makeState(streamSequence: 4, mode: .paused, runtimeState: .paused)
    let degraded = try makeState(
      streamSequence: 5,
      mode: .degradedScreenpipe,
      runtimeState: .paused,
      screenpipeStatus: .degraded
    )

    XCTAssertEqual(previewContent(for: noPlan).title, "No Plan Loaded")
    XCTAssertEqual(hardDrift.intervention?.kind, .hardDrift)
    XCTAssertEqual(praise.intervention?.kind, .praise)
    XCTAssertEqual(previewContent(for: paused).title, "Paused")
    XCTAssertEqual(previewContent(for: degraded).title, "Screenpipe Degraded")
    XCTAssertEqual(degraded.systemHealth.screenpipe.status, .degraded)
  }

  private func previewContent(for state: SystemState) -> ModeRouterContent {
    let store = AppStateStore()
    store.apply(state)

    return ModeRouterPresenter.content(
      connectionState: .connected,
      menuBarState: store.menuBarState,
      dashboardState: store.dashboardState
    )
  }

  private func makeState(
    streamSequence: Int,
    mode: Mode = .running,
    runtimeState: RuntimeState,
    interventionKind: InterventionKind? = nil,
    interventionTitle: String? = nil,
    interventionBody: String? = nil,
    screenpipeStatus: HealthStatus = .ok
  ) throws -> SystemState {
    var object = try fixtureObject()

    object["stream_sequence"] = streamSequence
    object["mode"] = mode.rawValue

    var menuBar = try XCTUnwrap(object["menu_bar"] as? [String: Any])
    menuBar["runtime_state"] = runtimeState.rawValue
    menuBar["mode_label"] = modeLabel(for: runtimeState)
    menuBar["primary_label"] = primaryLabel(for: mode, runtimeState: runtimeState)
    menuBar["secondary_label"] = secondaryLabel(for: mode, runtimeState: runtimeState)
    object["menu_bar"] = menuBar

    var dashboard = try XCTUnwrap(object["dashboard"] as? [String: Any])
    var header = try XCTUnwrap(dashboard["header"] as? [String: Any])
    header["mode"] = mode.rawValue
    header["summary_text"] = summaryText(for: mode, runtimeState: runtimeState)
    dashboard["header"] = header

    var currentFocus = try XCTUnwrap(dashboard["current_focus"] as? [String: Any])
    currentFocus["runtime_state"] = runtimeState.rawValue
    dashboard["current_focus"] = currentFocus
    object["dashboard"] = dashboard

    var systemHealth = try XCTUnwrap(object["system_health"] as? [String: Any])
    var screenpipe = try XCTUnwrap(systemHealth["screenpipe"] as? [String: Any])
    screenpipe["status"] = screenpipeStatus.rawValue
    systemHealth["screenpipe"] = screenpipe
    object["system_health"] = systemHealth

    if let interventionKind, let interventionTitle, let interventionBody {
      object["intervention"] = [
        "intervention_id": "iv_\(streamSequence)",
        "created_at": "2026-04-18T09:00:00Z",
        "kind": interventionKind.rawValue,
        "presentation": "both",
        "severity": "info",
        "title": interventionTitle,
        "body": interventionBody,
        "actions": [],
        "dedupe_key": "preview_\(streamSequence)",
        "expires_at": NSNull(),
        "suppress_native_notification": false,
        "suppression_reason": NSNull(),
      ]
    } else {
      object["intervention"] = NSNull()
    }

    let data = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    return try BridgeJSONCoding.decoder.decode(SystemState.self, from: data)
  }

  private func fixtureObject() throws -> [String: Any] {
    let data = try Data(
      contentsOf:
        repositoryRootURL
        .appendingPathComponent("fixtures")
        .appendingPathComponent("contracts")
        .appendingPathComponent("system-state.running.json")
    )

    return try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
  }

  private func modeLabel(for runtimeState: RuntimeState) -> String {
    switch runtimeState {
    case .aligned:
      "Aligned"
    case .uncertain:
      "Uncertain"
    case .softDrift:
      "Soft Drift"
    case .hardDrift:
      "Hard Drift"
    case .paused:
      "Paused"
    }
  }

  private func primaryLabel(for mode: Mode, runtimeState: RuntimeState) -> String {
    switch mode {
    case .noPlan:
      "No plan imported"
    case .paused:
      "Paused"
    case .degradedScreenpipe:
      "Screenpipe degraded"
    default:
      runtimeState == .hardDrift ? "Needs refocus" : "Checkout redesign"
    }
  }

  private func secondaryLabel(for mode: Mode, runtimeState: RuntimeState) -> String? {
    switch mode {
    case .paused:
      "Resume when ready."
    case .degradedScreenpipe:
      "Manual controls remain available."
    case .noPlan:
      "Start the morning flow."
    default:
      runtimeState == .hardDrift ? "Return to the active task." : nil
    }
  }

  private func summaryText(for mode: Mode, runtimeState: RuntimeState) -> String {
    switch mode {
    case .noPlan:
      "Morning import required."
    case .paused:
      "Coaching is paused."
    case .degradedScreenpipe:
      "Screenpipe is unavailable. Manual review remains available."
    default:
      "Current focus is \(runtimeState.rawValue)."
    }
  }

  private var repositoryRootURL: URL {
    URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
  }
}
