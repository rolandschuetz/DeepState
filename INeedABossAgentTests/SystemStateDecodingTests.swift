import XCTest

final class SystemStateDecodingTests: XCTestCase {
  func testDecodesTypeScriptSystemStateFixture() throws {
    let data = try Data(contentsOf: systemStateFixtureURL)

    let state = try BridgeJSONCoding.decoder.decode(SystemState.self, from: data)

    XCTAssertEqual(state.schemaVersion, "1.0.0")
    XCTAssertEqual(state.mode, .running)
    XCTAssertEqual(state.runtimeSessionId, "d7d724cd-0e26-432e-91eb-c283725b6922")
    XCTAssertEqual(state.streamSequence, 148)
    XCTAssertEqual(state.menuBar.colorToken, .green)
    XCTAssertEqual(state.menuBar.activeTaskTitle, "Finish checkout redesign")
    XCTAssertEqual(state.dashboard.header.localDate, "2026-04-18")
    XCTAssertEqual(state.dashboard.currentFocus.runtimeState, .aligned)
    XCTAssertEqual(state.dashboard.progress.tasks.first?.riskLevel, .low)
    XCTAssertEqual(state.intervention?.kind, .riskPrompt)
    XCTAssertEqual(state.systemHealth.notifications.osPermission, .granted)
  }

  func testDecodesNullableContractFieldsFromFixture() throws {
    let data = try Data(contentsOf: systemStateFixtureURL)

    let state = try BridgeJSONCoding.decoder.decode(SystemState.self, from: data)

    XCTAssertNil(state.causedByCommandId)
    XCTAssertNil(state.clarificationHud)
    XCTAssertNil(state.menuBar.pauseUntil)
    XCTAssertNil(state.dashboard.header.warningBanner)
    XCTAssertNil(state.dashboard.ambiguityQueue.first?.resolutionSummary)
    XCTAssertNil(state.dashboard.morningExchange?.contextPacketText)
    XCTAssertNil(state.dashboard.morningExchange?.promptText)
    XCTAssertNil(state.dashboard.eveningExchange?.debriefPacketText)
    XCTAssertNil(state.dashboard.eveningExchange?.promptText)
    XCTAssertNil(state.systemHealth.screenpipe.lastErrorAt)
    XCTAssertNil(state.systemHealth.screenpipe.message)
    XCTAssertNil(state.systemHealth.database.lastErrorAt)
    XCTAssertNil(state.systemHealth.database.message)
    XCTAssertNil(state.systemHealth.notifications.mutedReason)
    XCTAssertNil(state.systemHealth.observeOnly.ticksRemaining)
    XCTAssertEqual(state.intervention?.suppressionReason, .cooldown)
    XCTAssertEqual(state.intervention?.expiresAt, "2026-04-18T08:51:00Z")
  }

  private var repositoryRootURL: URL {
    URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
  }

  private var systemStateFixtureURL: URL {
    repositoryRootURL
      .appendingPathComponent("fixtures")
      .appendingPathComponent("contracts")
      .appendingPathComponent("system-state.running.json")
  }
}
