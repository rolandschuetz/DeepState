import Foundation
import Darwin

@MainActor
final class EmbeddedLogicRuntimeController {
  static let shared = EmbeddedLogicRuntimeController()

  let bridgeConfiguration: BridgeConfiguration

  private let bridgeHost = "127.0.0.1"
  private let bridgePort: Int
  private let fileManager: FileManager
  private let launchQueue = DispatchQueue(label: "INeedABossAgent.logic-runtime")
  private var process: Process?

  init(fileManager: FileManager = .default) {
    self.fileManager = fileManager
    self.bridgePort = Self.reserveLoopbackPort()
    self.bridgeConfiguration = BridgeConfiguration(
      baseURL: URL(string: "http://127.0.0.1:\(bridgePort)")!,
      streamURL: URL(string: "http://127.0.0.1:\(bridgePort)/stream")!,
      commandURL: URL(string: "http://127.0.0.1:\(bridgePort)/command")!
    )
  }

  func startIfNeeded() {
    launchQueue.sync {
      guard process == nil else {
        return
      }

      guard let executableURL = executableURL() else {
        NSLog("Embedded logic runtime binary is missing from the app bundle.")
        return
      }

      let process = Process()
      process.executableURL = executableURL
      process.environment = runtimeEnvironment()
      process.terminationHandler = { terminatedProcess in
        Task { @MainActor [weak self] in
          self?.launchQueue.async {
            if self?.process === terminatedProcess {
              self?.process = nil
            }
          }
        }
      }

      do {
        try process.run()
        self.process = process
      } catch {
        NSLog("Failed to launch embedded logic runtime: \(error.localizedDescription)")
      }
    }
  }

  func stop() {
    launchQueue.sync {
      guard let process else {
        return
      }

      if process.isRunning {
        process.terminate()
        Thread.sleep(forTimeInterval: 0.5)
      }

      if process.isRunning {
        kill(process.processIdentifier, SIGKILL)
      }

      self.process = nil
    }
  }

  private func executableURL() -> URL? {
    Bundle.main.resourceURL?
      .appendingPathComponent("LogicRuntime", isDirectory: true)
      .appendingPathComponent("INeedABossAgentLogic", isDirectory: false)
  }

  private func runtimeEnvironment() -> [String: String] {
    var environment = ProcessInfo.processInfo.environment
    environment["INEEDABOSSAGENT_BRIDGE_HOST"] = bridgeHost
    environment["INEEDABOSSAGENT_BRIDGE_PORT"] = String(bridgePort)
    environment["INEEDABOSSAGENT_DB_PATH"] = databaseURL().path
    return environment
  }

  private func databaseURL() -> URL {
    let appSupport =
      try? fileManager.url(
        for: .applicationSupportDirectory,
        in: .userDomainMask,
        appropriateFor: nil,
        create: true
      )
    let appDirectory = (appSupport ?? URL(fileURLWithPath: NSTemporaryDirectory()))
      .appendingPathComponent("INeedABossAgent", isDirectory: true)
    try? fileManager.createDirectory(at: appDirectory, withIntermediateDirectories: true)
    return appDirectory.appendingPathComponent("logic.sqlite", isDirectory: false)
  }

  private static func reserveLoopbackPort() -> Int {
    let socketFileDescriptor = socket(AF_INET, SOCK_STREAM, 0)
    guard socketFileDescriptor >= 0 else {
      return 8787
    }
    defer { close(socketFileDescriptor) }

    var value: Int32 = 1
    setsockopt(
      socketFileDescriptor,
      SOL_SOCKET,
      SO_REUSEADDR,
      &value,
      socklen_t(MemoryLayout<Int32>.size)
    )

    var address = sockaddr_in()
    address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
    address.sin_family = sa_family_t(AF_INET)
    address.sin_port = 0
    address.sin_addr = in_addr(s_addr: inet_addr("127.0.0.1"))

    let bindResult = withUnsafePointer(to: &address) { pointer in
      pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPointer in
        bind(socketFileDescriptor, sockaddrPointer, socklen_t(MemoryLayout<sockaddr_in>.size))
      }
    }

    guard bindResult == 0 else {
      return 8787
    }

    var resolvedAddress = sockaddr_in()
    var resolvedLength = socklen_t(MemoryLayout<sockaddr_in>.size)
    let nameResult = withUnsafeMutablePointer(to: &resolvedAddress) { pointer in
      pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPointer in
        getsockname(socketFileDescriptor, sockaddrPointer, &resolvedLength)
      }
    }

    guard nameResult == 0 else {
      return 8787
    }

    return Int(UInt16(bigEndian: resolvedAddress.sin_port))
  }
}
