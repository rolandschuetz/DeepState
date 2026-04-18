import Foundation

enum BridgeError: LocalizedError, Equatable {
  case invalidBaseURL(String)
  case invalidPath(String)
  case invalidResponse
  case unexpectedStatusCode(Int)
  case invalidSystemStateEvent(String)
  case unsupportedSchemaVersion(expected: SchemaVersion, actual: SchemaVersion)

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
    case .unsupportedSchemaVersion(let expected, let actual):
      "Bridge schema version mismatch. Expected \(expected), received \(actual)."
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

@MainActor
protocol CommandRequestTransport {
  func perform(
    request: URLRequest,
    body: Data
  ) async throws -> (Data, HTTPURLResponse)
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

struct URLSessionCommandRequestTransport: CommandRequestTransport {
  let session: URLSession

  init(session: URLSession = .shared) {
    self.session = session
  }

  func perform(
    request: URLRequest,
    body: Data
  ) async throws -> (Data, HTTPURLResponse) {
    var request = request
    request.httpBody = body

    let (data, response) = try await session.data(for: request)
    guard let httpResponse = response as? HTTPURLResponse else {
      throw BridgeError.invalidResponse
    }

    return (data, httpResponse)
  }
}

enum CommandKind: String, Codable, Equatable {
  case pause
  case resume
  case updateExclusions = "update_exclusions"
  case resolveAmbiguity = "resolve_ambiguity"
  case importCoachingExchange = "import_coaching_exchange"
  case notificationAction = "notification_action"
  case reportNotificationPermission = "report_notification_permission"
  case purgeAll = "purge_all"
}

protocol BridgeCommandPayload: Encodable {
  static var kind: CommandKind { get }
}

struct PauseCommandPayload: Codable, Equatable, BridgeCommandPayload {
  static let kind: CommandKind = .pause

  enum Reason: String, Codable, Equatable {
    case userPause = "user_pause"
    case `break`
    case snooze
    case intentionalDetour = "intentional_detour"
  }

  let reason: Reason
  let durationSeconds: Int?
  let note: String?
}

struct ResumeCommandPayload: Codable, Equatable, BridgeCommandPayload {
  static let kind: CommandKind = .resume

  enum Reason: String, Codable, Equatable {
    case userResume = "user_resume"
    case notificationReturn = "notification_return"
    case pauseElapsed = "pause_elapsed"
  }

  let reason: Reason
}

struct UpdateExclusionsCommandPayload: Codable, Equatable, BridgeCommandPayload {
  static let kind: CommandKind = .updateExclusions

  enum Operation: Codable, Equatable {
    case upsert(PrivacyExclusionEntry)
    case remove(exclusionId: String)

    private enum CodingKeys: String, CodingKey {
      case entry
      case exclusionId
      case op
    }

    private enum OperationKind: String, Codable {
      case upsert
      case remove
    }

    init(from decoder: Decoder) throws {
      let container = try decoder.container(keyedBy: CodingKeys.self)
      let operationKind = try container.decode(OperationKind.self, forKey: .op)

      switch operationKind {
      case .upsert:
        self = .upsert(try container.decode(PrivacyExclusionEntry.self, forKey: .entry))
      case .remove:
        self = .remove(
          exclusionId: try container.decode(String.self, forKey: .exclusionId)
        )
      }
    }

    func encode(to encoder: Encoder) throws {
      var container = encoder.container(keyedBy: CodingKeys.self)

      switch self {
      case .upsert(let entry):
        try container.encode(OperationKind.upsert, forKey: .op)
        try container.encode(entry, forKey: .entry)
      case .remove(let exclusionId):
        try container.encode(OperationKind.remove, forKey: .op)
        try container.encode(exclusionId, forKey: .exclusionId)
      }
    }
  }

  let operations: [Operation]
}

struct ResolveAmbiguityCommandPayload: Codable, Equatable, BridgeCommandPayload {
  static let kind: CommandKind = .resolveAmbiguity

  enum RememberChoice: String, Codable, Equatable {
    case doNotRemember = "do_not_remember"
    case rememberAsTask = "remember_as_task"
    case rememberAsWorkGroup = "remember_as_work_group"
  }

  let clarificationId: String
  let answerId: String
  let rememberChoice: RememberChoice
  let userNote: String?
}

struct ImportCoachingExchangeCommandPayload: Codable, Equatable, BridgeCommandPayload {
  static let kind: CommandKind = .importCoachingExchange

  enum Source: String, Codable, Equatable {
    case manualPaste = "manual_paste"
    case clipboard
  }

  let source: Source
  let rawText: String
}

struct NotificationActionCommandPayload: Codable, Equatable, BridgeCommandPayload {
  static let kind: CommandKind = .notificationAction

  let interventionId: String
  let actionId: String
}

struct ReportNotificationPermissionCommandPayload: Codable, Equatable, BridgeCommandPayload {
  static let kind: CommandKind = .reportNotificationPermission

  let osPermission: NotificationPermissionStatus
}

struct PurgeAllCommandPayload: Codable, Equatable, BridgeCommandPayload {
  static let kind: CommandKind = .purgeAll

  let confirmPhrase: String
}

struct CommandEnvelope<Payload: BridgeCommandPayload>: Encodable {
  let schemaVersion: SchemaVersion
  let commandId: String
  let sentAt: String
  let payload: Payload

  init(
    schemaVersion: SchemaVersion = "1.0.0",
    commandId: String,
    sentAt: String,
    payload: Payload
  ) {
    self.schemaVersion = schemaVersion
    self.commandId = commandId
    self.sentAt = sentAt
    self.payload = payload
  }

  private enum CodingKeys: String, CodingKey {
    case commandId
    case kind
    case payload
    case schemaVersion
    case sentAt
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(commandId, forKey: .commandId)
    try container.encode(Payload.kind, forKey: .kind)
    try container.encode(payload, forKey: .payload)
    try container.encode(schemaVersion, forKey: .schemaVersion)
    try container.encode(sentAt, forKey: .sentAt)
  }
}

enum CommandActionStatus: String, Codable, Equatable {
  case success
  case validationError = "validation_error"
  case retryableFailure = "retryable_failure"
  case fatalFailure = "fatal_failure"
}

struct CommandActionResult: Codable, Equatable {
  let correlationId: String
  let commandId: String?
  let kind: CommandKind?
  let message: String
  let issues: [String]?
  let status: CommandActionStatus
}

struct BridgeCommandFailure: Equatable {
  let kind: CommandKind?
  let message: String
  let issues: [String]
  let status: CommandActionStatus
}

enum BridgeClock {
  static func isoTimestamp(date: Date = Date()) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    return formatter.string(from: date)
  }
}

@MainActor
final class BridgeClient: ObservableObject {
  private struct EventSchemaProbe: Decodable {
    let schemaVersion: SchemaVersion
  }

  private struct SnapshotCursor: Equatable {
    let runtimeSessionId: String
    let streamSequence: Int
  }

  static let supportedSchemaVersion: SchemaVersion = "1.0.0"

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
  @Published private(set) var lastCommandFailure: BridgeCommandFailure?

  let configuration: BridgeConfiguration

  private let transport: EventStreamTransport
  private let commandTransport: CommandRequestTransport
  private let automaticallyReconnect: Bool
  private let reconnectDelayNanoseconds: UInt64
  private var latestSnapshotCursor: SnapshotCursor?
  private var streamTask: Task<Void, Never>?
  private var wantsConnection = false

  init(
    configuration: BridgeConfiguration = (try? .fromProcessEnvironment()) ?? .fallback,
    transport: EventStreamTransport = URLSessionEventStreamTransport(),
    commandTransport: CommandRequestTransport = URLSessionCommandRequestTransport(),
    automaticallyReconnect: Bool = true,
    reconnectDelayNanoseconds: UInt64 = 1_000_000_000
  ) {
    self.configuration = configuration
    self.transport = transport
    self.commandTransport = commandTransport
    self.automaticallyReconnect = automaticallyReconnect
    self.reconnectDelayNanoseconds = reconnectDelayNanoseconds
  }

  deinit {
    streamTask?.cancel()
  }

  func connect() {
    wantsConnection = true

    guard streamTask == nil else {
      return
    }

    connectionState = .connecting
    lastErrorDescription = nil

    streamTask = Task { [weak self] in
      guard let self else {
        return
      }

      defer {
        self.streamTask = nil
      }

      while wantsConnection, Task.isCancelled == false {
        do {
          connectionState = .connecting
          let request = makeStreamRequest()

          for try await event in transport.streamEvents(for: request) {
            try handle(event: event)
          }

          guard wantsConnection, Task.isCancelled == false else {
            break
          }

          connectionState = .disconnected
        } catch is CancellationError {
          connectionState = .idle
          return
        } catch {
          let description = error.localizedDescription
          lastErrorDescription = description
          connectionState = .failed(description)
        }

        guard wantsConnection, Task.isCancelled == false, automaticallyReconnect else {
          break
        }

        do {
          try await Task.sleep(nanoseconds: reconnectDelayNanoseconds)
        } catch is CancellationError {
          connectionState = .idle
          return
        } catch {
          connectionState = .failed(error.localizedDescription)
          return
        }
      }
    }
  }

  func disconnect() {
    wantsConnection = false
    streamTask?.cancel()
    streamTask = nil
    connectionState = .idle
  }

  func dispatchCommand<Payload: BridgeCommandPayload>(
    _ payload: Payload,
    commandId: String = UUID().uuidString,
    sentAt: String = BridgeClock.isoTimestamp()
  ) async throws -> CommandActionResult {
    let envelope = CommandEnvelope(
      commandId: commandId,
      sentAt: sentAt,
      payload: payload
    )
    let body = try BridgeJSONCoding.encoder.encode(envelope)

    var request = URLRequest(url: configuration.commandURL)
    request.cachePolicy = .reloadIgnoringLocalCacheData
    request.httpMethod = "POST"
    request.timeoutInterval = configuration.requestTimeoutSeconds
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")

    let (data, response) = try await commandTransport.perform(
      request: request,
      body: body
    )

    guard (200..<600).contains(response.statusCode) else {
      throw BridgeError.unexpectedStatusCode(response.statusCode)
    }

    let result = try BridgeJSONCoding.decoder.decode(CommandActionResult.self, from: data)

    if result.status == .success {
      lastCommandFailure = nil
    } else {
      lastCommandFailure = BridgeCommandFailure(
        kind: result.kind,
        message: result.message,
        issues: result.issues ?? [],
        status: result.status
      )
    }

    return result
  }

  private func handle(event: ServerSentEvent) throws {
    guard event.event == nil || event.event == Self.systemStateEventName else {
      return
    }

    guard let data = event.data.data(using: .utf8) else {
      throw BridgeError.invalidSystemStateEvent("Event data was not UTF-8.")
    }

    let schemaProbe = try BridgeJSONCoding.decoder.decode(EventSchemaProbe.self, from: data)
    guard schemaProbe.schemaVersion == Self.supportedSchemaVersion else {
      throw BridgeError.unsupportedSchemaVersion(
        expected: Self.supportedSchemaVersion,
        actual: schemaProbe.schemaVersion
      )
    }

    let state = try BridgeJSONCoding.decoder.decode(SystemState.self, from: data)
    if shouldAccept(state) {
      latestSnapshotCursor = SnapshotCursor(
        runtimeSessionId: state.runtimeSessionId,
        streamSequence: state.streamSequence
      )
      latestState = state
    }

    lastErrorDescription = nil
    connectionState = .connected
  }

  private func makeStreamRequest() -> URLRequest {
    var request = URLRequest(url: configuration.streamURL)
    request.cachePolicy = .reloadIgnoringLocalCacheData
    request.timeoutInterval = configuration.requestTimeoutSeconds
    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
    request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
    return request
  }

  private func shouldAccept(_ state: SystemState) -> Bool {
    guard let latestSnapshotCursor else {
      return true
    }

    guard latestSnapshotCursor.runtimeSessionId == state.runtimeSessionId else {
      return true
    }

    return state.streamSequence > latestSnapshotCursor.streamSequence
  }
}
