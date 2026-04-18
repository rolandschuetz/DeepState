import Combine
import Foundation

struct MenuBarState: Equatable {
  let runtimeSessionId: String?
  let streamSequence: Int?
  let mode: Mode?
  let viewModel: MenuBarViewModel?

  static let empty = MenuBarState(
    runtimeSessionId: nil,
    streamSequence: nil,
    mode: nil,
    viewModel: nil
  )
}

struct DashboardState: Equatable {
  let runtimeSessionId: String?
  let streamSequence: Int?
  let mode: Mode?
  let viewModel: DashboardViewModel?
  let systemHealth: SystemHealthViewModel?

  static let empty = DashboardState(
    runtimeSessionId: nil,
    streamSequence: nil,
    mode: nil,
    viewModel: nil,
    systemHealth: nil
  )
}

struct PromptImportState: Equatable {
  let runtimeSessionId: String?
  let morningExchange: MorningExchangeViewModel?
  let eveningExchange: EveningExchangeViewModel?

  static let empty = PromptImportState(
    runtimeSessionId: nil,
    morningExchange: nil,
    eveningExchange: nil
  )
}

struct PendingNotificationState: Equatable {
  let runtimeSessionId: String?
  let intervention: InterventionViewModel?

  static let empty = PendingNotificationState(
    runtimeSessionId: nil,
    intervention: nil
  )
}

struct ClarificationPanelState: Equatable {
  let runtimeSessionId: String?
  let clarificationHUD: ClarificationHudViewModel?

  static let empty = ClarificationPanelState(
    runtimeSessionId: nil,
    clarificationHUD: nil
  )
}

struct SettingsState: Equatable {
  let runtimeSessionId: String?
  let privacyExclusions: PrivacyExclusionsViewModel?
  let notificationHealth: NotificationHealth?
  let observeOnly: ObserveOnlyHealth?

  static let empty = SettingsState(
    runtimeSessionId: nil,
    privacyExclusions: nil,
    notificationHealth: nil,
    observeOnly: nil
  )
}

@MainActor
final class AppStateStore: ObservableObject {
  @Published private(set) var menuBarState: MenuBarState = .empty
  @Published private(set) var dashboardState: DashboardState = .empty
  @Published private(set) var promptImportState: PromptImportState = .empty
  @Published private(set) var pendingNotificationState: PendingNotificationState = .empty
  @Published private(set) var clarificationPanelState: ClarificationPanelState = .empty
  @Published private(set) var settingsState: SettingsState = .empty

  func apply(_ systemState: SystemState?) {
    guard let systemState else {
      NSLog("AppStateStore resetting because systemState is nil.")
      reset()
      return
    }

    NSLog(
      "AppStateStore applying session=%@ sequence=%d mode=%@ dashboard=%@ intervention=%@.",
      systemState.runtimeSessionId,
      systemState.streamSequence,
      systemState.mode.rawValue,
      systemState.dashboard.header.summaryText,
      systemState.intervention?.title ?? "<nil>"
    )

    menuBarState = MenuBarState(
      runtimeSessionId: systemState.runtimeSessionId,
      streamSequence: systemState.streamSequence,
      mode: systemState.mode,
      viewModel: systemState.menuBar
    )
    dashboardState = DashboardState(
      runtimeSessionId: systemState.runtimeSessionId,
      streamSequence: systemState.streamSequence,
      mode: systemState.mode,
      viewModel: systemState.dashboard,
      systemHealth: systemState.systemHealth
    )
    promptImportState = PromptImportState(
      runtimeSessionId: systemState.runtimeSessionId,
      morningExchange: systemState.dashboard.morningExchange,
      eveningExchange: systemState.dashboard.eveningExchange
    )
    pendingNotificationState = PendingNotificationState(
      runtimeSessionId: systemState.runtimeSessionId,
      intervention: systemState.intervention
    )
    clarificationPanelState = ClarificationPanelState(
      runtimeSessionId: systemState.runtimeSessionId,
      clarificationHUD: systemState.clarificationHud
    )
    settingsState = SettingsState(
      runtimeSessionId: systemState.runtimeSessionId,
      privacyExclusions: systemState.dashboard.privacyExclusions,
      notificationHealth: systemState.systemHealth.notifications,
      observeOnly: systemState.systemHealth.observeOnly
    )
  }

  private func reset() {
    NSLog("AppStateStore reset all published view state to empty.")
    menuBarState = .empty
    dashboardState = .empty
    promptImportState = .empty
    pendingNotificationState = .empty
    clarificationPanelState = .empty
    settingsState = .empty
  }
}

@MainActor
final class BridgeStateObserver: ObservableObject {
  private var latestStateCancellable: AnyCancellable?

  func bind(
    bridgeClient: BridgeClient,
    onLatestState: @escaping (SystemState?) -> Void
  ) {
    latestStateCancellable = bridgeClient.$latestState
      .prepend(bridgeClient.latestState)
      .sink { latestState in
        NSLog(
          "App observed latestState update session=%@ sequence=%@.",
          latestState?.runtimeSessionId ?? "<nil>",
          latestState.map { String($0.streamSequence) } ?? "<nil>"
        )
        onLatestState(latestState)
      }
  }

  func bind(
    bridgeClient: BridgeClient,
    appStateStore: AppStateStore,
    runtimeEventCoordinator: RuntimeEventCoordinator
  ) {
    bind(bridgeClient: bridgeClient) { latestState in
        appStateStore.apply(latestState)
        runtimeEventCoordinator.handle(systemState: latestState)
    }
  }
}
