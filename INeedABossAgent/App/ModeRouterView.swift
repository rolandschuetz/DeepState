import SwiftUI

struct ModeRouterContent: Equatable {
  let title: String
  let detail: String
}

enum ModeRouterPresenter {
  static func content(
    connectionState: BridgeClient.ConnectionState,
    menuBarState: MenuBarState,
    dashboardState: DashboardState
  ) -> ModeRouterContent {
    guard let mode = dashboardState.mode ?? menuBarState.mode else {
      return fallbackContent(for: connectionState)
    }

    switch mode {
    case .booting:
      return ModeRouterContent(
        title: "Booting",
        detail: "Preparing the local coaching runtime."
      )
    case .noPlan:
      return ModeRouterContent(
        title: "No Plan Loaded",
        detail: "Import a morning plan before the coach can classify focus."
      )
    case .running:
      return ModeRouterContent(
        title: menuBarState.viewModel?.primaryLabel ?? "Running",
        detail: menuBarState.viewModel?.modeLabel ?? "Tracking the active focus block."
      )
    case .paused:
      return ModeRouterContent(
        title: "Paused",
        detail: menuBarState.viewModel?.secondaryLabel ?? "Coaching is paused."
      )
    case .degradedScreenpipe:
      return ModeRouterContent(
        title: "Screenpipe Degraded",
        detail: "Context capture is degraded. Review diagnostics before trusting prompts."
      )
    case .logicError:
      return ModeRouterContent(
        title: "Logic Error",
        detail: "The logic runtime entered a recovery state. UI stays read-only."
      )
    }
  }

  private static func fallbackContent(
    for connectionState: BridgeClient.ConnectionState
  ) -> ModeRouterContent {
    switch connectionState {
    case .idle:
      return ModeRouterContent(
        title: "Bridge Idle",
        detail: "Waiting to connect to the local logic runtime."
      )
    case .connecting:
      return ModeRouterContent(
        title: "Connecting",
        detail: "Requesting the latest system snapshot."
      )
    case .connected:
      return ModeRouterContent(
        title: "Connected",
        detail: "Waiting for the first classified system state."
      )
    case .disconnected:
      return ModeRouterContent(
        title: "Reconnecting",
        detail: "The stream dropped. Waiting for a fresh snapshot."
      )
    case .failed(let message):
      return ModeRouterContent(
        title: "Bridge Failed",
        detail: message
      )
    }
  }
}

struct ModeRouterView: View {
  let connectionState: BridgeClient.ConnectionState
  let menuBarState: MenuBarState
  let dashboardState: DashboardState

  var body: some View {
    let content = ModeRouterPresenter.content(
      connectionState: connectionState,
      menuBarState: menuBarState,
      dashboardState: dashboardState
    )

    VStack(alignment: .leading, spacing: 8) {
      Text(content.title)
        .font(.headline)
      Text(content.detail)
        .font(.subheadline)
        .foregroundStyle(.secondary)
    }
  }
}

#Preview {
  ModeRouterView(
    connectionState: .connected,
    menuBarState: MenuBarState(
      runtimeSessionId: "runtime-1",
      streamSequence: 1,
      mode: .running,
      viewModel: nil
    ),
    dashboardState: .empty
  )
}
