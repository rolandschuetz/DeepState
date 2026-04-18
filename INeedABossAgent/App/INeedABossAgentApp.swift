import SwiftUI

@main
struct INeedABossAgentApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
  @StateObject private var bridgeClient = BridgeClient(
    configuration: EmbeddedLogicRuntimeController.shared.bridgeConfiguration
  )
  @StateObject private var appStateStore = AppStateStore()
  @StateObject private var runtimeEventCoordinator = RuntimeEventCoordinator()

  var body: some Scene {
    MenuBarExtra {
      MenuBarExtraView(
        bridgeClient: bridgeClient,
        appStateStore: appStateStore
      )
      .task {
        bridgeClient.connect()
        runtimeEventCoordinator.configure(bridgeClient: bridgeClient)
        await runtimeEventCoordinator.start()
      }
      .onReceive(bridgeClient.$latestState) { latestState in
        appStateStore.apply(latestState)
        runtimeEventCoordinator.handle(systemState: latestState)
      }
      .onReceive(
        NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)
      ) { _ in
        Task {
          await runtimeEventCoordinator.refreshNotificationPermission()
        }
      }
    } label: {
      MenuBarExtraLabelView(
        connectionState: bridgeClient.connectionState,
        menuBarState: appStateStore.menuBarState,
        runtimeEventCoordinator: runtimeEventCoordinator
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
