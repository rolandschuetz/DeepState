import XCTest

final class DiagnosticsViewTests: XCTestCase {
  func testReturnsNoRowsWithoutSystemHealth() {
    XCTAssertTrue(DiagnosticsPresenter.rows(from: nil).isEmpty)
  }

  func testBuildsRowsForOverallScreenpipeAndDatabase() {
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
      )
    )

    XCTAssertEqual(rows.count, 3)
    XCTAssertEqual(rows[0], DiagnosticsRow(label: "Overall", status: "Degraded", detail: nil))
    XCTAssertEqual(
      rows[1],
      DiagnosticsRow(
        label: "Screenpipe",
        status: "Down",
        detail: "Screenpipe bridge offline."
      )
    )
    XCTAssertEqual(
      rows[2],
      DiagnosticsRow(
        label: "Database",
        status: "Ok",
        detail: "Last ok: 2026-04-18T08:46:00Z"
      )
    )
  }
}
