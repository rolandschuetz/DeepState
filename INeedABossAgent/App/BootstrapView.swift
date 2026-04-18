import SwiftUI

struct BootstrapView: View {
  @ObservedObject var bridgeClient: BridgeClient
  @ObservedObject var appStateStore: AppStateStore

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("INeedABossAgent")
        .font(.headline)

      ModeRouterView(
        connectionState: bridgeClient.connectionState,
        menuBarState: appStateStore.menuBarState,
        dashboardState: appStateStore.dashboardState
      )

      Text("Bridge: \(bridgeClient.configuration.baseURL.absoluteString)")
        .font(.caption)
        .foregroundStyle(.tertiary)
    }
    .padding(16)
    .frame(width: 320)
  }
}

#Preview {
  BootstrapView(
    bridgeClient: BridgeClient(),
    appStateStore: AppStateStore()
  )
}
