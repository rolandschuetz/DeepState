import XCTest

final class ModeRouterTests: XCTestCase {
  func testFallsBackToConnectionStateBeforeFirstSnapshot() {
    let content = ModeRouterPresenter.content(
      connectionState: .connecting,
      menuBarState: .empty,
      dashboardState: .empty
    )

    XCTAssertEqual(content.title, "Connecting")
    XCTAssertEqual(content.detail, "Requesting the latest system snapshot.")
  }

  func testRoutesNoPlanMode() {
    let content = ModeRouterPresenter.content(
      connectionState: .connected,
      menuBarState: MenuBarState(
        runtimeSessionId: "runtime-1",
        streamSequence: 1,
        mode: .noPlan,
        viewModel: nil
      ),
      dashboardState: DashboardState(
        runtimeSessionId: "runtime-1",
        streamSequence: 1,
        mode: .noPlan,
        viewModel: nil,
        systemHealth: nil
      )
    )

    XCTAssertEqual(content.title, "No Plan Loaded")
  }

  func testRoutesRunningModeUsingMenuBarLabels() {
    let content = ModeRouterPresenter.content(
      connectionState: .connected,
      menuBarState: MenuBarState(
        runtimeSessionId: "runtime-1",
        streamSequence: 2,
        mode: .running,
        viewModel: MenuBarViewModel(
          colorToken: .green,
          modeLabel: "Aligned",
          primaryLabel: "Checkout redesign",
          secondaryLabel: nil,
          runtimeState: .aligned,
          isSupportWork: false,
          confidenceRatio: 0.92,
          activeGoalId: "goal-1",
          activeGoalTitle: "Ship payments work",
          activeTaskId: "task-1",
          activeTaskTitle: "Checkout redesign",
          stateStartedAt: "2026-04-18T09:00:00Z",
          focusedElapsedSeconds: 900,
          pauseUntil: nil,
          allowedActions: AllowedActionsViewModel(
            canPause: true,
            canResume: false,
            canTakeBreak: true,
            canOpenMorningFlow: false,
            canOpenEveningFlow: false
          )
        )
      ),
      dashboardState: DashboardState(
        runtimeSessionId: "runtime-1",
        streamSequence: 2,
        mode: .running,
        viewModel: nil,
        systemHealth: nil
      )
    )

    XCTAssertEqual(content.title, "Checkout redesign")
    XCTAssertEqual(content.detail, "Aligned")
  }

  func testRoutesPausedMode() {
    let content = ModeRouterPresenter.content(
      connectionState: .connected,
      menuBarState: MenuBarState(
        runtimeSessionId: "runtime-1",
        streamSequence: 3,
        mode: .paused,
        viewModel: MenuBarViewModel(
          colorToken: .gray,
          modeLabel: "Paused",
          primaryLabel: "Paused",
          secondaryLabel: "Resume when ready.",
          runtimeState: .paused,
          isSupportWork: false,
          confidenceRatio: nil,
          activeGoalId: nil,
          activeGoalTitle: nil,
          activeTaskId: nil,
          activeTaskTitle: nil,
          stateStartedAt: nil,
          focusedElapsedSeconds: nil,
          pauseUntil: nil,
          allowedActions: AllowedActionsViewModel(
            canPause: false,
            canResume: true,
            canTakeBreak: false,
            canOpenMorningFlow: false,
            canOpenEveningFlow: false
          )
        )
      ),
      dashboardState: DashboardState(
        runtimeSessionId: "runtime-1",
        streamSequence: 3,
        mode: .paused,
        viewModel: nil,
        systemHealth: nil
      )
    )

    XCTAssertEqual(content.title, "Paused")
    XCTAssertEqual(content.detail, "Resume when ready.")
  }

  func testRoutesDegradedAndLogicErrorModes() {
    let degraded = ModeRouterPresenter.content(
      connectionState: .connected,
      menuBarState: MenuBarState(
        runtimeSessionId: "runtime-1",
        streamSequence: 4,
        mode: .degradedScreenpipe,
        viewModel: nil
      ),
      dashboardState: DashboardState(
        runtimeSessionId: "runtime-1",
        streamSequence: 4,
        mode: .degradedScreenpipe,
        viewModel: nil,
        systemHealth: nil
      )
    )
    let logicError = ModeRouterPresenter.content(
      connectionState: .connected,
      menuBarState: MenuBarState(
        runtimeSessionId: "runtime-1",
        streamSequence: 5,
        mode: .logicError,
        viewModel: nil
      ),
      dashboardState: DashboardState(
        runtimeSessionId: "runtime-1",
        streamSequence: 5,
        mode: .logicError,
        viewModel: nil,
        systemHealth: nil
      )
    )

    XCTAssertEqual(degraded.title, "Screenpipe Degraded")
    XCTAssertEqual(logicError.title, "Logic Error")
  }
}
