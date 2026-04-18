import SwiftUI

struct BootstrapView: View {
  @ObservedObject var bridgeClient: BridgeClient
  @ObservedObject var appStateStore: AppStateStore

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("INeedABossAgent")
        .font(.headline)
      Text(statusText)
        .font(.subheadline)
        .foregroundStyle(.secondary)

      Text("Bridge: \(bridgeClient.configuration.baseURL.absoluteString)")
        .font(.caption)
        .foregroundStyle(.tertiary)

      if let mode = appStateStore.menuBarState.mode {
        Text("Latest mode: \(mode.rawValue)")
          .font(.caption)
          .foregroundStyle(.secondary)
      }

      if let primaryLabel = appStateStore.menuBarState.viewModel?.primaryLabel {
        Text("Focus: \(primaryLabel)")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
    .padding(16)
    .frame(width: 320)
  }

  private var statusText: String {
    switch bridgeClient.connectionState {
    case .idle:
      "Bridge idle."
    case .connecting:
      "Connecting to the logic bridge stream."
    case .connected:
      "Connected to the logic bridge stream."
    case .disconnected:
      "Bridge stream disconnected."
    case .failed(let message):
      "Bridge connection failed: \(message)"
    }
  }
}

#Preview {
  BootstrapView(
    bridgeClient: BridgeClient(),
    appStateStore: AppStateStore()
  )
}
