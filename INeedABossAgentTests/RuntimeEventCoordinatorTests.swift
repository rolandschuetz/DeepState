import UserNotifications
import XCTest

final class RuntimeEventCoordinatorTests: XCTestCase {
  func testNotificationPermissionStatusMapsAuthorizationStates() {
    XCTAssertEqual(
      RuntimeEventPresenter.notificationPermissionStatus(for: .authorized),
      .granted
    )
    XCTAssertEqual(
      RuntimeEventPresenter.notificationPermissionStatus(for: .provisional),
      .granted
    )
    XCTAssertEqual(
      RuntimeEventPresenter.notificationPermissionStatus(for: .denied),
      .denied
    )
    XCTAssertEqual(
      RuntimeEventPresenter.notificationPermissionStatus(for: .notDetermined),
      .unknown
    )
  }

  func testShouldDeliverNotificationOnlyWhenPresentationAllowsAndPermissionIsGranted() {
    var systemState = makeSystemState(
      presentation: .both,
      suppressNativeNotification: false,
      osPermission: .granted
    )

    XCTAssertTrue(RuntimeEventPresenter.shouldDeliverNotification(for: systemState))

    systemState = makeSystemState(
      presentation: .dashboardOnly,
      suppressNativeNotification: false,
      osPermission: .granted
    )
    XCTAssertFalse(RuntimeEventPresenter.shouldDeliverNotification(for: systemState))

    systemState = makeSystemState(
      presentation: .both,
      suppressNativeNotification: true,
      osPermission: .granted
    )
    XCTAssertFalse(RuntimeEventPresenter.shouldDeliverNotification(for: systemState))

    systemState = makeSystemState(
      presentation: .both,
      suppressNativeNotification: false,
      osPermission: .denied
    )
    XCTAssertFalse(RuntimeEventPresenter.shouldDeliverNotification(for: systemState))
  }

  func testBuildsCompositeNotificationActionIdentifiers() {
    let contexts = RuntimeEventPresenter.actionContexts(for: makeIntervention())

    XCTAssertEqual(
      contexts.map(\.compositeIdentifier),
      ["intervention-1::action-1", "intervention-1::action-2"]
    )
    XCTAssertEqual(contexts.map(\.actionId), ["action-1", "action-2"])
  }

  func testMapsClarificationRememberChoiceFromSemantics() {
    let taskChoice = ClarificationChoice(
      answerId: "answer-1",
      label: "This is task work",
      semantics: .task,
      taskId: "task-1",
      workGroupId: nil
    )
    let supportChoice = ClarificationChoice(
      answerId: "answer-2",
      label: "This is support work",
      semantics: .supportWork,
      taskId: nil,
      workGroupId: "group-1"
    )

    XCTAssertEqual(
      RuntimeEventPresenter.rememberChoice(for: taskChoice, rememberSelection: true),
      .rememberAsTask
    )
    XCTAssertEqual(
      RuntimeEventPresenter.rememberChoice(for: supportChoice, rememberSelection: true),
      .rememberAsWorkGroup
    )
    XCTAssertEqual(
      RuntimeEventPresenter.rememberChoice(for: taskChoice, rememberSelection: false),
      .doNotRemember
    )
  }

  private func makeSystemState(
    presentation: InterventionPresentation,
    suppressNativeNotification: Bool,
    osPermission: NotificationPermissionStatus
  ) -> SystemState {
    var state = try! BridgeJSONCoding.decoder.decode(
      SystemState.self,
      from: Data(contentsOf: systemStateFixtureURL)
    )

    state = SystemState(
      schemaVersion: state.schemaVersion,
      runtimeSessionId: state.runtimeSessionId,
      streamSequence: state.streamSequence,
      emittedAt: state.emittedAt,
      causedByCommandId: state.causedByCommandId,
      mode: state.mode,
      menuBar: state.menuBar,
      dashboard: state.dashboard,
      clarificationHud: state.clarificationHud,
      intervention: InterventionViewModel(
        interventionId: "intervention-1",
        createdAt: "2026-04-18T08:41:00Z",
        kind: .hardDrift,
        presentation: presentation,
        severity: .warning,
        title: "Back.",
        body: "Return to the checkout flow.",
        actions: makeIntervention().actions,
        suppressNativeNotification: suppressNativeNotification,
        suppressionReason: suppressNativeNotification ? .cooldown : nil,
        dedupeKey: "dedupe-1",
        expiresAt: "2026-04-18T08:51:00Z"
      ),
      systemHealth: SystemHealthViewModel(
        overallStatus: state.systemHealth.overallStatus,
        screenpipe: state.systemHealth.screenpipe,
        database: state.systemHealth.database,
        scheduler: state.systemHealth.scheduler,
        notifications: NotificationHealth(
          osPermission: osPermission,
          mutedByLogic: false,
          mutedReason: nil
        ),
        observeOnly: state.systemHealth.observeOnly
      )
    )

    return state
  }

  private func makeIntervention() -> InterventionViewModel {
    InterventionViewModel(
      interventionId: "intervention-1",
      createdAt: "2026-04-18T08:41:00Z",
      kind: .hardDrift,
      presentation: .both,
      severity: .warning,
      title: "Back.",
      body: "Return to the checkout flow.",
      actions: [
        InterventionAction(
          actionId: "action-1",
          label: "Return now",
          semanticAction: .returnNow
        ),
        InterventionAction(
          actionId: "action-2",
          label: "Intentional detour",
          semanticAction: .intentionalDetour
        ),
      ],
      suppressNativeNotification: false,
      suppressionReason: nil,
      dedupeKey: "dedupe-1",
      expiresAt: "2026-04-18T08:51:00Z"
    )
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
