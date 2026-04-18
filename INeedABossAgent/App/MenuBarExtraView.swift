import SwiftUI

struct MenuBarExtraLabelContent: Equatable {
  let iconSystemName: String
  let tintColor: Color
  let accessibilityLabel: String
}

struct MenuBarExtraDropdownContent: Equatable {
  let title: String
  let runtimeLabel: String
  let timerText: String?
  let focusScopeText: String?
  let confidenceText: String?
  let canPause: Bool
  let canTakeBreak: Bool
}

enum MenuBarExtraPresenter {
  static func labelContent(
    connectionState: BridgeClient.ConnectionState,
    menuBarState: MenuBarState
  ) -> MenuBarExtraLabelContent {
    let title = menuBarState.viewModel?.modeLabel ?? fallbackModeLabel(for: connectionState)

    return MenuBarExtraLabelContent(
      iconSystemName: "brain.head.profile",
      tintColor: tintColor(connectionState: connectionState, menuBarState: menuBarState),
      accessibilityLabel: "INeedABossAgent \(title)"
    )
  }

  static func dropdownContent(
    connectionState: BridgeClient.ConnectionState,
    menuBarState: MenuBarState
  ) -> MenuBarExtraDropdownContent {
    guard let viewModel = menuBarState.viewModel else {
      return MenuBarExtraDropdownContent(
        title: fallbackTitle(for: connectionState),
        runtimeLabel: fallbackModeLabel(for: connectionState),
        timerText: nil,
        focusScopeText: nil,
        confidenceText: nil,
        canPause: false,
        canTakeBreak: false
      )
    }

    let focusScopeText =
      viewModel.isSupportWork
      ? "Scope: Support work"
      : viewModel.activeGoalTitle.map { "Scope: \($0)" }

    let confidenceText = viewModel.confidenceRatio.map {
      "Confidence: \(Int(($0 * 100).rounded()))%"
    }

    return MenuBarExtraDropdownContent(
      title: viewModel.activeTaskTitle ?? viewModel.primaryLabel,
      runtimeLabel: runtimeLabel(for: viewModel),
      timerText: viewModel.focusedElapsedSeconds.map(formatDuration),
      focusScopeText: focusScopeText,
      confidenceText: confidenceText,
      canPause: viewModel.allowedActions.canPause,
      canTakeBreak: viewModel.allowedActions.canTakeBreak
    )
  }

  static func pausePayload() -> PauseCommandPayload {
    PauseCommandPayload(
      reason: .userPause,
      durationSeconds: nil,
      note: nil
    )
  }

  static func takeBreakPayload() -> PauseCommandPayload {
    PauseCommandPayload(
      reason: .break,
      durationSeconds: nil,
      note: nil
    )
  }

  private static func tintColor(
    connectionState: BridgeClient.ConnectionState,
    menuBarState: MenuBarState
  ) -> Color {
    guard let viewModel = menuBarState.viewModel else {
      switch connectionState {
      case .connected:
        return .gray
      case .idle, .connecting, .disconnected, .failed:
        return .gray
      }
    }

    switch viewModel.colorToken {
    case .green:
      return .green
    case .blue:
      return .blue
    case .yellow:
      return .yellow
    case .red:
      return .red
    case .gray:
      return .gray
    }
  }

  private static func runtimeLabel(for viewModel: MenuBarViewModel) -> String {
    if viewModel.isSupportWork {
      return "\(viewModel.modeLabel) • Support"
    }

    return viewModel.modeLabel
  }

  private static func fallbackTitle(for connectionState: BridgeClient.ConnectionState) -> String {
    switch connectionState {
    case .idle:
      "Bridge Idle"
    case .connecting:
      "Connecting"
    case .connected:
      "Waiting for State"
    case .disconnected:
      "Reconnecting"
    case .failed:
      "Bridge Failed"
    }
  }

  private static func fallbackModeLabel(
    for connectionState: BridgeClient.ConnectionState
  ) -> String {
    switch connectionState {
    case .idle:
      "Idle"
    case .connecting:
      "Connecting"
    case .connected:
      "Connected"
    case .disconnected:
      "Disconnected"
    case .failed:
      "Failed"
    }
  }

  private static func formatDuration(_ seconds: Int) -> String {
    let hours = seconds / 3600
    let minutes = (seconds % 3600) / 60
    let remainingSeconds = seconds % 60

    if hours > 0 {
      return String(format: "Timer: %dh %02dm", hours, minutes)
    }

    if minutes > 0 {
      return String(format: "Timer: %dm %02ds", minutes, remainingSeconds)
    }

    return String(format: "Timer: %ds", remainingSeconds)
  }
}

struct MenuBarExtraView: View {
  @Environment(\.openWindow) private var openWindow

  @ObservedObject var bridgeClient: BridgeClient
  @ObservedObject var appStateStore: AppStateStore
  @State private var lastAutoOpenedRuntimeSessionId: String?

  var body: some View {
    let dropdownContent = MenuBarExtraPresenter.dropdownContent(
      connectionState: bridgeClient.connectionState,
      menuBarState: appStateStore.menuBarState
    )
    let allowedActions = appStateStore.menuBarState.viewModel?.allowedActions
    let hasMorningPrompt = appStateStore.promptImportState.morningExchange?.promptText?.isEmpty == false
    let hasEveningPrompt = appStateStore.promptImportState.eveningExchange?.promptText?.isEmpty == false

    VStack(alignment: .leading, spacing: 10) {
      VStack(alignment: .leading, spacing: 4) {
        Text(dropdownContent.title)
          .font(.headline)

        Text(dropdownContent.runtimeLabel)
          .font(.caption)
          .foregroundStyle(.secondary)

        if let timerText = dropdownContent.timerText {
          Text(timerText)
            .font(.caption)
            .foregroundStyle(.secondary)
        }

        if let focusScopeText = dropdownContent.focusScopeText {
          Text(focusScopeText)
            .font(.caption)
            .foregroundStyle(.secondary)
        }

        if let confidenceText = dropdownContent.confidenceText {
          Text(confidenceText)
            .font(.caption2)
            .foregroundStyle(.tertiary)
        }
      }

      Button("Open Dashboard") {
        NSApp.activate(ignoringOtherApps: true)
        openWindow(id: DashboardWindowRoute.id)
      }
      .font(.caption)

      HStack {
        Button("Pause Coaching") {
          Task {
            _ = try? await bridgeClient.dispatchCommand(MenuBarExtraPresenter.pausePayload())
          }
        }
        .disabled(dropdownContent.canPause == false)

        Button("Take a Break") {
          Task {
            _ = try? await bridgeClient.dispatchCommand(MenuBarExtraPresenter.takeBreakPayload())
          }
        }
        .disabled(dropdownContent.canTakeBreak == false)
      }
      .font(.caption)

      HStack {
        Button("Start Morning Briefing") {
          NSApp.activate(ignoringOtherApps: true)
          openWindow(id: DashboardWindowRoute.id)

          guard hasMorningPrompt == false else {
            return
          }

          let trigger = MorningFlowTriggerEnvelope.make()

          Task {
            _ = try? await bridgeClient.dispatchCommand(
              RequestMorningFlowCommandPayload(
                localDate: trigger.localDate,
                openedAt: trigger.openedAt,
                reason: .manualStartDay
              )
            )
          }
        }
        .disabled((allowedActions?.canOpenMorningFlow ?? false) == false && hasMorningPrompt == false)

        Button("Start Evening Briefing") {
          NSApp.activate(ignoringOtherApps: true)
          openWindow(id: DashboardWindowRoute.id)
        }
        .disabled((allowedActions?.canOpenEveningFlow ?? false) == false && hasEveningPrompt == false)
      }
      .font(.caption)

      MorningFlowView(
        morningExchange: appStateStore.promptImportState.morningExchange,
        onImport: { payload in
          do {
            let result = try await bridgeClient.dispatchCommand(payload)
            return MorningFlowPresenter.importOutcome(from: result)
          } catch {
            return MorningFlowPresenter.importOutcome(from: error)
          }
        }
      )

      EveningDebriefView(
        eveningExchange: appStateStore.promptImportState.eveningExchange,
        onImport: { payload in
          do {
            let result = try await bridgeClient.dispatchCommand(payload)
            return MorningFlowPresenter.importOutcome(from: result)
          } catch {
            return MorningFlowPresenter.importOutcome(from: error)
          }
        }
      )

      DiagnosticsView(
        systemHealth: appStateStore.dashboardState.systemHealth,
        connectionState: bridgeClient.connectionState,
        bridgeError: bridgeClient.lastErrorDescription,
        lastCommandFailure: bridgeClient.lastCommandFailure
      )
    }
    .padding(16)
    .frame(width: 320)
    .onReceive(bridgeClient.$latestState) { latestState in
      guard let latestState else {
        lastAutoOpenedRuntimeSessionId = nil
        return
      }

      guard latestState.mode == .noPlan else {
        return
      }

      guard lastAutoOpenedRuntimeSessionId != latestState.runtimeSessionId else {
        return
      }

      lastAutoOpenedRuntimeSessionId = latestState.runtimeSessionId
      NSApp.activate(ignoringOtherApps: true)
      openWindow(id: DashboardWindowRoute.id)
    }
  }
}

struct MenuBarExtraLabelView: View {
  @Environment(\.openWindow) private var openWindow

  let connectionState: BridgeClient.ConnectionState
  let menuBarState: MenuBarState
  @ObservedObject var runtimeEventCoordinator: RuntimeEventCoordinator

  var body: some View {
    let content = MenuBarExtraPresenter.labelContent(
      connectionState: connectionState,
      menuBarState: menuBarState
    )

    Image(systemName: content.iconSystemName)
      .symbolRenderingMode(.monochrome)
      .foregroundStyle(content.tintColor)
      .accessibilityLabel(content.accessibilityLabel)
      .onChange(of: runtimeEventCoordinator.dashboardOpenRequestID) {
        NSApp.activate(ignoringOtherApps: true)
        openWindow(id: DashboardWindowRoute.id)
      }
  }
}

#Preview {
  MenuBarExtraView(
    bridgeClient: BridgeClient(),
    appStateStore: AppStateStore()
  )
}
