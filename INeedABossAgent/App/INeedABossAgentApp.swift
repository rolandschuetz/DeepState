import SwiftUI

@main
struct INeedABossAgentApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
  @StateObject private var bridgeClient = BridgeClient()
  @StateObject private var appStateStore = AppStateStore()

  var body: some Scene {
    MenuBarExtra {
      MenuBarExtraView(
        bridgeClient: bridgeClient,
        appStateStore: appStateStore
      )
      .task {
        bridgeClient.connect()
      }
      .onReceive(bridgeClient.$latestState) { latestState in
        appStateStore.apply(latestState)
      }
    } label: {
      MenuBarExtraLabelView(
        connectionState: bridgeClient.connectionState,
        menuBarState: appStateStore.menuBarState
      )
    }
    .menuBarExtraStyle(.window)

    Window("Dashboard", id: DashboardWindowRoute.id) {
      DashboardWindowView(
        bridgeClient: bridgeClient,
        appStateStore: appStateStore
      )
    }
    .windowResizability(.contentMinSize)
  }
}
