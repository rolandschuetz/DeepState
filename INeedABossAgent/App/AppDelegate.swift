import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate {
  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.accessory)
    EmbeddedLogicRuntimeController.shared.startIfNeeded()
  }

  func applicationWillTerminate(_ notification: Notification) {
    EmbeddedLogicRuntimeController.shared.stop()
  }
}
