import SwiftUI

@main
struct INeedABossAgentApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
  @StateObject private var bridgeClient: BridgeClient
  @StateObject private var appStateStore: AppStateStore
  @StateObject private var runtimeEventCoordinator: RuntimeEventCoordinator
  @StateObject private var bridgeStateObserver: BridgeStateObserver

  @MainActor
  init() {
    let bridgeClient = BridgeClient(
      configuration: EmbeddedLogicRuntimeController.shared.bridgeConfiguration
    )
    let appStateStore = AppStateStore()
    let runtimeEventCoordinator = RuntimeEventCoordinator()
    let bridgeStateObserver = BridgeStateObserver()

    _bridgeClient = StateObject(wrappedValue: bridgeClient)
    _appStateStore = StateObject(wrappedValue: appStateStore)
    _runtimeEventCoordinator = StateObject(wrappedValue: runtimeEventCoordinator)
    _bridgeStateObserver = StateObject(wrappedValue: bridgeStateObserver)

    runtimeEventCoordinator.configure(bridgeClient: bridgeClient)
    bridgeStateObserver.bind(
      bridgeClient: bridgeClient,
      appStateStore: appStateStore,
      runtimeEventCoordinator: runtimeEventCoordinator
    )
    Task {
      NSLog("App bootstrap starting embedded runtime readiness flow.")
      await EmbeddedLogicRuntimeController.shared.startAndWaitUntilReady()
      NSLog("App bootstrap observed embedded runtime ready; connecting bridge.")
      bridgeClient.connect()
      await runtimeEventCoordinator.start()
      if NSApp.isActive {
        await runtimeEventCoordinator.handleApplicationDidBecomeActive()
      }
      NSLog("Runtime event coordinator started.")
    }
  }

  var body: some Scene {
    MenuBarExtra {
      MenuBarExtraView(
        bridgeClient: bridgeClient,
        appStateStore: appStateStore
      )
      .onReceive(
        NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)
      ) { _ in
        Task {
          await runtimeEventCoordinator.handleApplicationDidBecomeActive()
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
