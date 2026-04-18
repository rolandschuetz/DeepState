import XCTest

@MainActor
final class AppStateStoreTests: XCTestCase {
  func testApplyProjectsSystemStateIntoThinBuckets() throws {
    let store = AppStateStore()
    let systemState = try loadFixtureState()

    store.apply(systemState)

    XCTAssertEqual(store.menuBarState.runtimeSessionId, systemState.runtimeSessionId)
    XCTAssertEqual(store.menuBarState.streamSequence, systemState.streamSequence)
    XCTAssertEqual(store.menuBarState.mode, systemState.mode)
    XCTAssertEqual(store.menuBarState.viewModel, systemState.menuBar)

    XCTAssertEqual(store.dashboardState.viewModel, systemState.dashboard)
    XCTAssertEqual(store.dashboardState.systemHealth, systemState.systemHealth)
    XCTAssertEqual(store.promptImportState.morningExchange, systemState.dashboard.morningExchange)
    XCTAssertEqual(store.promptImportState.eveningExchange, systemState.dashboard.eveningExchange)
    XCTAssertEqual(store.pendingNotificationState.intervention, systemState.intervention)
    XCTAssertEqual(store.clarificationPanelState.clarificationHUD, systemState.clarificationHud)
    XCTAssertEqual(
      store.settingsState.privacyExclusions,
      systemState.dashboard.privacyExclusions
    )
    XCTAssertEqual(
      store.settingsState.notificationHealth,
      systemState.systemHealth.notifications
    )
    XCTAssertEqual(
      store.settingsState.observeOnly,
      systemState.systemHealth.observeOnly
    )
  }

  func testApplyNilResetsAllBuckets() throws {
    let store = AppStateStore()
    store.apply(try loadFixtureState())

    store.apply(nil)

    XCTAssertEqual(store.menuBarState, .empty)
    XCTAssertEqual(store.dashboardState, .empty)
    XCTAssertEqual(store.promptImportState, .empty)
    XCTAssertEqual(store.pendingNotificationState, .empty)
    XCTAssertEqual(store.clarificationPanelState, .empty)
    XCTAssertEqual(store.settingsState, .empty)
  }

  private func loadFixtureState() throws -> SystemState {
    let fixtureURL =
      repositoryRootURL
      .appendingPathComponent("fixtures")
      .appendingPathComponent("contracts")
      .appendingPathComponent("system-state.running.json")
    let data = try Data(contentsOf: fixtureURL)
    return try BridgeJSONCoding.decoder.decode(SystemState.self, from: data)
  }

  private var repositoryRootURL: URL {
    URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
  }
}
