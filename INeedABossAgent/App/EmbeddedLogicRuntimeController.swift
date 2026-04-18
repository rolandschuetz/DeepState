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
  private let urlSession: URLSession
  private var process: Process?

  init(fileManager: FileManager = .default, urlSession: URLSession = .shared) {
    self.fileManager = fileManager
    self.urlSession = urlSession
    self.bridgePort = Self.reserveLoopbackPort()
    self.bridgeConfiguration = BridgeConfiguration(
      baseURL: URL(string: "http://127.0.0.1:\(bridgePort)")!,
      streamURL: URL(string: "http://127.0.0.1:\(bridgePort)/stream")!,
      commandURL: URL(string: "http://127.0.0.1:\(bridgePort)/command")!
    )
    NSLog(
      "Embedded logic runtime configured for %@.",
      bridgeConfiguration.baseURL.absoluteString
    )
  }

  func startIfNeeded() {
    launchQueue.sync {
      guard process == nil else {
        return
      }

      guard
        let executableURL = executableURL(),
        let scriptURL = scriptURL()
      else {
        NSLog("Embedded logic runtime files are missing from the app bundle.")
        return
      }

      let process = Process()
      process.executableURL = executableURL
      process.arguments = [scriptURL.path]
      process.environment = runtimeEnvironment()
      process.terminationHandler = { terminatedProcess in
        NSLog(
          "Embedded logic runtime exited with status \(terminatedProcess.terminationStatus)."
        )
      }

      do {
        NSLog(
          "Launching embedded logic runtime executable=%@ script=%@ bridge=%@.",
          executableURL.path,
          scriptURL.path,
          self.bridgeConfiguration.baseURL.absoluteString
        )
        try process.run()
        self.process = process
        NSLog("Embedded logic runtime process started with pid %d.", process.processIdentifier)
      } catch {
        NSLog("Failed to launch embedded logic runtime: \(error.localizedDescription)")
      }
    }
  }

  func startAndWaitUntilReady() async {
    startIfNeeded()

    let healthURL = bridgeConfiguration.baseURL.appendingPathComponent("health")
    for attempt in 1...40 {
      if await isRuntimeReady(healthURL: healthURL, attempt: attempt) {
        NSLog(
          "Embedded logic runtime reported ready on attempt %d at %@.",
          attempt,
          healthURL.absoluteString
        )
        return
      }

      try? await Task.sleep(for: .milliseconds(100))
    }

    NSLog("Embedded logic runtime did not become ready before timeout.")
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
    runtimeDirectoryURL()?
      .appendingPathComponent("INeedABossAgentNode", isDirectory: false)
  }

  private func scriptURL() -> URL? {
    runtimeDirectoryURL()?
      .appendingPathComponent("logic-runtime.cjs", isDirectory: false)
  }

  private func runtimeDirectoryURL() -> URL? {
    Bundle.main.resourceURL?
      .appendingPathComponent("LogicRuntime", isDirectory: true)
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
      return fallbackLoopbackPort()
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
      return fallbackLoopbackPort()
    }

    var resolvedAddress = sockaddr_in()
    var resolvedLength = socklen_t(MemoryLayout<sockaddr_in>.size)
    let nameResult = withUnsafeMutablePointer(to: &resolvedAddress) { pointer in
      pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPointer in
        getsockname(socketFileDescriptor, sockaddrPointer, &resolvedLength)
      }
    }

    guard nameResult == 0 else {
      return fallbackLoopbackPort()
    }

    return Int(UInt16(bigEndian: resolvedAddress.sin_port))
  }

  private static func fallbackLoopbackPort() -> Int {
    let pidComponent = Int(getpid() % 10_000)
    let port = 49_152 + pidComponent
    NSLog("Falling back to synthesized loopback port %d.", port)
    return port
  }

  private func isRuntimeReady(healthURL: URL, attempt: Int) async -> Bool {
    var request = URLRequest(url: healthURL)
    request.timeoutInterval = 0.5
    request.cachePolicy = .reloadIgnoringLocalCacheData

    do {
      let (_, response) = try await urlSession.data(for: request)
      guard let httpResponse = response as? HTTPURLResponse else {
        NSLog("Runtime readiness probe %d returned a non-HTTP response.", attempt)
        return false
      }

      NSLog(
        "Runtime readiness probe %d returned HTTP %d from %@.",
        attempt,
        httpResponse.statusCode,
        healthURL.absoluteString
      )
      return (200..<300).contains(httpResponse.statusCode)
    } catch {
      NSLog(
        "Runtime readiness probe %d failed for %@: %@.",
        attempt,
        healthURL.absoluteString,
        error.localizedDescription
      )
      return false
    }
  }
}
