import SwiftUI

@main
struct INeedABossAgentApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

  var body: some Scene {
    MenuBarExtra("INeedABossAgent", systemImage: "brain.head.profile") {
      BootstrapView()
    }
    .menuBarExtraStyle(.window)
  }
}
