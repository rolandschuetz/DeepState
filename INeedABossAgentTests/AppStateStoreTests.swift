import XCTest

@MainActor
final class AppStateStoreTests: XCTestCase {
  func testBridgeStateObserverProjectsBridgeSnapshotsIntoStore() throws {
    let store = AppStateStore()
    let observer = BridgeStateObserver()
    let client = BridgeClient(
      configuration: makeConfiguration(),
      transport: InlineEventStreamTransport(events: [
        .init(
          event: BridgeClient.systemStateEventName,
          data: try fixtureString(named: "system-state.running.json")
        ),
      ]),
      automaticallyReconnect: false
    )

    observer.bind(bridgeClient: client) { latestState in
      store.apply(latestState)
    }

    client.connect()

    let expectation = expectation(description: "store applies connected runtime state")
    Task { @MainActor in
      while store.dashboardState.mode != .running {
        await Task.yield()
      }
      expectation.fulfill()
    }

    wait(for: [expectation], timeout: 1.0)
    XCTAssertEqual(store.dashboardState.mode, .running)
    XCTAssertEqual(store.menuBarState.viewModel?.primaryLabel, "Checkout redesign")
  }

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

  private func fixtureString(named name: String) throws -> String {
    let fixtureURL =
      repositoryRootURL
      .appendingPathComponent("fixtures")
      .appendingPathComponent("contracts")
      .appendingPathComponent(name)
    return try String(contentsOf: fixtureURL, encoding: .utf8)
  }

  private func makeConfiguration() -> BridgeConfiguration {
    let baseURL = URL(string: "http://127.0.0.1:8787")!
    return BridgeConfiguration(
      baseURL: baseURL,
      streamURL: baseURL.appendingPathComponent("stream"),
      commandURL: baseURL.appendingPathComponent("command")
    )
  }

  private var repositoryRootURL: URL {
    URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
  }
}

private struct InlineEventStreamTransport: EventStreamTransport {
  let events: [ServerSentEvent]

  func streamEvents(for request: URLRequest) -> AsyncThrowingStream<ServerSentEvent, Error> {
    AsyncThrowingStream { continuation in
      for event in events {
        continuation.yield(event)
      }
      continuation.finish()
    }
  }
}
