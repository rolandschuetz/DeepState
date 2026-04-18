import XCTest

final class DiagnosticsViewTests: XCTestCase {
  func testShowsBridgeRowWithoutSystemHealth() {
    XCTAssertEqual(
      DiagnosticsPresenter.rows(
        from: nil,
        connectionState: .connecting,
        bridgeError: nil,
        lastCommandFailure: nil
      ),
      [
        DiagnosticsRow(
          label: "Bridge",
          status: "Connecting",
          detail: "Requesting the latest system snapshot."
        )
      ]
    )
  }

  func testBuildsRowsForBridgeCommandAndHealth() {
    let rows = DiagnosticsPresenter.rows(
      from: SystemHealthViewModel(
        overallStatus: .degraded,
        screenpipe: SystemComponentHealth(
          status: .down,
          lastOkAt: "2026-04-18T08:42:00Z",
          lastErrorAt: "2026-04-18T08:45:00Z",
          message: "Screenpipe bridge offline."
        ),
        database: SystemComponentHealth(
          status: .ok,
          lastOkAt: "2026-04-18T08:46:00Z",
          lastErrorAt: nil,
          message: nil
        ),
        scheduler: SchedulerHealth(
          fastTickLastRanAt: "2026-04-18T08:46:00Z",
          slowTickLastRanAt: "2026-04-18T08:45:00Z"
        ),
        notifications: NotificationHealth(
          osPermission: .granted,
          mutedByLogic: false,
          mutedReason: nil
        ),
        observeOnly: ObserveOnlyHealth(
          active: false,
          ticksRemaining: nil
        )
      ),
      connectionState: .failed(
        "Bridge schema version mismatch. Expected 1.0.0, received 2.0.0."
      ),
      bridgeError: "Bridge schema version mismatch. Expected 1.0.0, received 2.0.0.",
      lastCommandFailure: BridgeCommandFailure(
        kind: .importCoachingExchange,
        message: "Command payload failed validation.",
        issues: ["payload.raw_text: Required"],
        status: .validationError
      )
    )

    XCTAssertEqual(rows.count, 5)
    XCTAssertEqual(
      rows[0],
      DiagnosticsRow(
        label: "Bridge",
        status: "Failed",
        detail: "Bridge schema version mismatch. Expected 1.0.0, received 2.0.0."
      )
    )
    XCTAssertEqual(
      rows[1],
      DiagnosticsRow(
        label: "Command",
        status: "Validation Error",
        detail:
          "import_coaching_exchange: Command payload failed validation.: payload.raw_text: Required"
      )
    )
    XCTAssertEqual(rows[2], DiagnosticsRow(label: "Overall", status: "Degraded", detail: nil))
    XCTAssertEqual(
      rows[3],
      DiagnosticsRow(
        label: "Screenpipe",
        status: "Down",
        detail: "Screenpipe bridge offline."
      )
    )
    XCTAssertEqual(
      rows[4],
      DiagnosticsRow(
        label: "Database",
        status: "Ok",
        detail: "Last ok: 2026-04-18T08:46:00Z"
      )
    )
  }
}
