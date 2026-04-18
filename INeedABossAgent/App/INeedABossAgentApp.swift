import SwiftUI

@main
struct INeedABossAgentApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
  @StateObject private var bridgeClient = BridgeClient()

  var body: some Scene {
    MenuBarExtra("INeedABossAgent", systemImage: "brain.head.profile") {
      BootstrapView(bridgeClient: bridgeClient)
        .task {
          bridgeClient.connect()
        }
    }
    .menuBarExtraStyle(.window)
  }
}
