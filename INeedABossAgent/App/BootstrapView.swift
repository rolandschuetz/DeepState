import SwiftUI

struct BootstrapView: View {
  @ObservedObject var bridgeClient: BridgeClient

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

      if let mode = bridgeClient.latestState?.mode {
        Text("Latest mode: \(mode.rawValue)")
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
  BootstrapView(bridgeClient: BridgeClient())
}
