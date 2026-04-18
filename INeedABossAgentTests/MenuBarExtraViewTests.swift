import XCTest

final class MenuBarExtraViewTests: XCTestCase {
  func testUsesViewModelColorTokenAndModeLabelForMenuBarLabel() {
    let content = MenuBarExtraPresenter.labelContent(
      connectionState: .connected,
      menuBarState: MenuBarState(
        runtimeSessionId: "runtime-1",
        streamSequence: 1,
        mode: .running,
        viewModel: makeViewModel(
          colorToken: .blue,
          modeLabel: "Aligned",
          isSupportWork: true
        )
      )
    )

    XCTAssertEqual(content.iconSystemName, "brain.head.profile")
    XCTAssertEqual(content.accessibilityLabel, "INeedABossAgent Aligned")
    XCTAssertEqual(content.tintColor, .blue)
  }

  func testBuildsDropdownContentForActiveTaskTimerScopeAndConfidence() {
    let content = MenuBarExtraPresenter.dropdownContent(
      connectionState: .connected,
      menuBarState: MenuBarState(
        runtimeSessionId: "runtime-1",
        streamSequence: 2,
        mode: .running,
        viewModel: makeViewModel()
      )
    )

    XCTAssertEqual(content.title, "Checkout redesign")
    XCTAssertEqual(content.runtimeLabel, "Aligned")
    XCTAssertEqual(content.timerText, "Timer: 27m 09s")
    XCTAssertEqual(content.focusScopeText, "Scope: Ship payments work")
    XCTAssertEqual(content.confidenceText, "Confidence: 92%")
    XCTAssertTrue(content.canPause)
    XCTAssertTrue(content.canTakeBreak)
  }

  func testMarksSupportWorkInDropdownLabel() {
    let content = MenuBarExtraPresenter.dropdownContent(
      connectionState: .connected,
      menuBarState: MenuBarState(
        runtimeSessionId: "runtime-1",
        streamSequence: 2,
        mode: .running,
        viewModel: makeViewModel(
          colorToken: .blue,
          modeLabel: "Aligned",
          isSupportWork: true
        )
      )
    )

    XCTAssertEqual(content.runtimeLabel, "Aligned • Support")
    XCTAssertEqual(content.focusScopeText, "Scope: Support work")
  }

  func testFallsBackToConnectionStateWithoutSnapshot() {
    let content = MenuBarExtraPresenter.dropdownContent(
      connectionState: .connecting,
      menuBarState: .empty
    )

    XCTAssertEqual(content.title, "Connecting")
    XCTAssertEqual(content.runtimeLabel, "Connecting")
    XCTAssertFalse(content.canPause)
    XCTAssertFalse(content.canTakeBreak)
  }

  func testBuildsPauseAndBreakPayloads() {
    XCTAssertEqual(MenuBarExtraPresenter.pausePayload().reason, .userPause)
    XCTAssertEqual(MenuBarExtraPresenter.takeBreakPayload().reason, .break)
  }

  private func makeViewModel(
    colorToken: ColorToken = .green,
    modeLabel: String = "Aligned",
    isSupportWork: Bool = false
  ) -> MenuBarViewModel {
    MenuBarViewModel(
      colorToken: colorToken,
      modeLabel: modeLabel,
      primaryLabel: "Checkout redesign",
      secondaryLabel: "Aligned for 27m",
      runtimeState: .aligned,
      isSupportWork: isSupportWork,
      confidenceRatio: 0.92,
      activeGoalId: "goal-1",
      activeGoalTitle: "Ship payments work",
      activeTaskId: "task-1",
      activeTaskTitle: "Checkout redesign",
      stateStartedAt: "2026-04-18T08:15:02Z",
      focusedElapsedSeconds: 1629,
      pauseUntil: nil,
      allowedActions: AllowedActionsViewModel(
        canPause: true,
        canResume: false,
        canTakeBreak: true,
        canOpenMorningFlow: false,
        canOpenEveningFlow: false
      )
    )
  }
}
