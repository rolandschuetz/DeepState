import Foundation

enum BridgeError: LocalizedError, Equatable {
  case invalidBaseURL(String)
  case invalidPath(String)
  case invalidResponse
  case unexpectedStatusCode(Int)
  case invalidSystemStateEvent(String)

  var errorDescription: String? {
    switch self {
    case .invalidBaseURL(let value):
      "Invalid bridge base URL: \(value)"
    case .invalidPath(let value):
      "Invalid bridge path: \(value)"
    case .invalidResponse:
      "Bridge returned a non-HTTP response."
    case .unexpectedStatusCode(let code):
      "Bridge request failed with HTTP \(code)."
    case .invalidSystemStateEvent(let value):
      "Bridge emitted an invalid system_state event: \(value)"
    }
  }
}

struct BridgeConfiguration: Equatable {
  static let baseURLEnvironmentKey = "INEEDABOSSAGENT_BRIDGE_BASE_URL"
  static let commandPathEnvironmentKey = "INEEDABOSSAGENT_BRIDGE_COMMAND_PATH"
  static let requestTimeoutEnvironmentKey = "INEEDABOSSAGENT_BRIDGE_REQUEST_TIMEOUT_SECONDS"
  static let schemeEnvironmentKey = "INEEDABOSSAGENT_BRIDGE_SCHEME"
  static let streamPathEnvironmentKey = "INEEDABOSSAGENT_BRIDGE_STREAM_PATH"

  static let defaultBaseURLString = "http://127.0.0.1:8787"
  static let defaultCommandPath = "/command"
  static let defaultRequestTimeoutSeconds = 30.0
  static let defaultStreamPath = "/stream"

  let baseURL: URL
  let commandURL: URL
  let requestTimeoutSeconds: Double
  let streamURL: URL

  static let fallback = BridgeConfiguration(
    baseURL: URL(string: defaultBaseURLString)!,
    streamURL: URL(
      string: "\(defaultBaseURLString)\(defaultStreamPath)"
    )!,
    commandURL: URL(
      string: "\(defaultBaseURLString)\(defaultCommandPath)"
    )!
  )

  init(environment: [String: String]) throws {
    let baseURLString =
      environment[Self.baseURLEnvironmentKey]
      ?? Self.buildBaseURL(from: environment)
    guard let baseURL = URL(string: baseURLString) else {
      throw BridgeError.invalidBaseURL(baseURLString)
    }

    let streamPath = environment[Self.streamPathEnvironmentKey] ?? Self.defaultStreamPath
    let commandPath = environment[Self.commandPathEnvironmentKey] ?? Self.defaultCommandPath

    guard let streamURL = URL(string: streamPath, relativeTo: baseURL)?.absoluteURL else {
      throw BridgeError.invalidPath(streamPath)
    }

    guard let commandURL = URL(string: commandPath, relativeTo: baseURL)?.absoluteURL else {
      throw BridgeError.invalidPath(commandPath)
    }

    let requestTimeoutSeconds =
      Double(environment[Self.requestTimeoutEnvironmentKey] ?? "")
      ?? Self.defaultRequestTimeoutSeconds

    self.baseURL = baseURL
    self.commandURL = commandURL
    self.requestTimeoutSeconds = requestTimeoutSeconds
    self.streamURL = streamURL
  }

  init(
    baseURL: URL,
    streamURL: URL,
    commandURL: URL,
    requestTimeoutSeconds: Double = defaultRequestTimeoutSeconds
  ) {
    self.baseURL = baseURL
    self.streamURL = streamURL
    self.commandURL = commandURL
    self.requestTimeoutSeconds = requestTimeoutSeconds
  }

  static func fromProcessEnvironment(
    _ environment: [String: String] = ProcessInfo.processInfo.environment
  ) throws -> Self {
    try Self(environment: environment)
  }

  private static func buildBaseURL(from environment: [String: String]) -> String {
    let scheme = environment[schemeEnvironmentKey] ?? "http"
    let host = environment["INEEDABOSSAGENT_BRIDGE_HOST"] ?? "127.0.0.1"
    let port = environment["INEEDABOSSAGENT_BRIDGE_PORT"] ?? "8787"

    return "\(scheme)://\(host):\(port)"
  }
}

struct ServerSentEvent: Equatable {
  let event: String?
  let data: String
}

struct ServerSentEventParser {
  private var bufferedEventName: String?
  private var bufferedDataLines: [String] = []

  mutating func parse(line: String) -> ServerSentEvent? {
    if line.isEmpty {
      return flush()
    }

    if line.hasPrefix(":") {
      return nil
    }

    let field: Substring
    let value: Substring

    if let separatorIndex = line.firstIndex(of: ":") {
      field = line[..<separatorIndex]
      let afterSeparator = line.index(after: separatorIndex)

      if afterSeparator < line.endIndex, line[afterSeparator] == " " {
        value = line[line.index(after: afterSeparator)...]
      } else {
        value = line[afterSeparator...]
      }
    } else {
      field = Substring(line)
      value = ""
    }

    switch field {
    case "event":
      bufferedEventName = String(value)
    case "data":
      bufferedDataLines.append(String(value))
    default:
      break
    }

    return nil
  }

  mutating func finish() -> ServerSentEvent? {
    flush()
  }

  private mutating func flush() -> ServerSentEvent? {
    guard bufferedDataLines.isEmpty == false else {
      bufferedEventName = nil
      return nil
    }

    let event = ServerSentEvent(
      event: bufferedEventName,
      data: bufferedDataLines.joined(separator: "\n")
    )

    bufferedEventName = nil
    bufferedDataLines.removeAll(keepingCapacity: true)
    return event
  }
}

protocol EventStreamTransport {
  func streamEvents(for request: URLRequest) -> AsyncThrowingStream<ServerSentEvent, Error>
}

struct URLSessionEventStreamTransport: EventStreamTransport {
  let session: URLSession

  init(session: URLSession = .shared) {
    self.session = session
  }

  func streamEvents(for request: URLRequest) -> AsyncThrowingStream<ServerSentEvent, Error> {
    AsyncThrowingStream { continuation in
      let task = Task {
        do {
          let (bytes, response) = try await session.bytes(for: request)
          guard let httpResponse = response as? HTTPURLResponse else {
            throw BridgeError.invalidResponse
          }
          guard (200..<300).contains(httpResponse.statusCode) else {
            throw BridgeError.unexpectedStatusCode(httpResponse.statusCode)
          }

          var parser = ServerSentEventParser()

          for try await line in bytes.lines {
            if let event = parser.parse(line: String(line)) {
              continuation.yield(event)
            }
          }

          if let trailingEvent = parser.finish() {
            continuation.yield(trailingEvent)
          }

          continuation.finish()
        } catch {
          continuation.finish(throwing: error)
        }
      }

      continuation.onTermination = { _ in
        task.cancel()
      }
    }
  }
}

@MainActor
final class BridgeClient: ObservableObject {
  enum ConnectionState: Equatable {
    case idle
    case connecting
    case connected
    case disconnected
    case failed(String)
  }

  static let systemStateEventName = "system_state"

  @Published private(set) var connectionState: ConnectionState = .idle
  @Published private(set) var lastErrorDescription: String?
  @Published private(set) var latestState: SystemState?

  let configuration: BridgeConfiguration

  private let transport: EventStreamTransport
  private var streamTask: Task<Void, Never>?

  init(
    configuration: BridgeConfiguration = (try? .fromProcessEnvironment()) ?? .fallback,
    transport: EventStreamTransport = URLSessionEventStreamTransport()
  ) {
    self.configuration = configuration
    self.transport = transport
  }

  deinit {
    streamTask?.cancel()
  }

  func connect() {
    guard streamTask == nil else {
      return
    }

    connectionState = .connecting
    lastErrorDescription = nil

    var request = URLRequest(url: configuration.streamURL)
    request.cachePolicy = .reloadIgnoringLocalCacheData
    request.timeoutInterval = configuration.requestTimeoutSeconds
    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
    request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")

    streamTask = Task { [weak self] in
      guard let self else {
        return
      }

      defer {
        self.streamTask = nil
      }

      do {
        for try await event in transport.streamEvents(for: request) {
          try handle(event: event)
        }

        if Task.isCancelled == false {
          connectionState = .disconnected
        }
      } catch is CancellationError {
        connectionState = .idle
      } catch {
        let description = error.localizedDescription
        lastErrorDescription = description
        connectionState = .failed(description)
      }
    }
  }

  func disconnect() {
    streamTask?.cancel()
    streamTask = nil
    connectionState = .idle
  }

  private func handle(event: ServerSentEvent) throws {
    guard event.event == nil || event.event == Self.systemStateEventName else {
      return
    }

    guard let data = event.data.data(using: .utf8) else {
      throw BridgeError.invalidSystemStateEvent("Event data was not UTF-8.")
    }

    let state = try BridgeJSONCoding.decoder.decode(SystemState.self, from: data)
    latestState = state
    lastErrorDescription = nil
    connectionState = .connected
  }
}
