import XCTest

@MainActor
final class BridgeClientTests: XCTestCase {
  func testBridgeConfigurationUsesEnvironmentOverrides() throws {
    let configuration = try BridgeConfiguration(environment: [
      BridgeConfiguration.baseURLEnvironmentKey: "http://localhost:9999/api",
      BridgeConfiguration.streamPathEnvironmentKey: "/stream/live",
      BridgeConfiguration.commandPathEnvironmentKey: "/command/dispatch",
      BridgeConfiguration.requestTimeoutEnvironmentKey: "12.5",
    ])

    XCTAssertEqual(configuration.baseURL.absoluteString, "http://localhost:9999/api")
    XCTAssertEqual(
      configuration.streamURL.absoluteString,
      "http://localhost:9999/stream/live"
    )
    XCTAssertEqual(
      configuration.commandURL.absoluteString,
      "http://localhost:9999/command/dispatch"
    )
    XCTAssertEqual(configuration.requestTimeoutSeconds, 12.5)
  }

  func testBridgeConfigurationBuildsDefaultLocalhostURLs() throws {
    let configuration = try BridgeConfiguration(environment: [:])

    XCTAssertEqual(
      configuration.baseURL.absoluteString,
      BridgeConfiguration.defaultBaseURLString
    )
    XCTAssertEqual(
      configuration.streamURL.absoluteString,
      "\(BridgeConfiguration.defaultBaseURLString)\(BridgeConfiguration.defaultStreamPath)"
    )
    XCTAssertEqual(
      configuration.commandURL.absoluteString,
      "\(BridgeConfiguration.defaultBaseURLString)\(BridgeConfiguration.defaultCommandPath)"
    )
  }

  func testServerSentEventParserAssemblesNamedMultilineEvents() {
    var parser = ServerSentEventParser()

    XCTAssertNil(parser.parse(line: ":keepalive"))
    XCTAssertNil(parser.parse(line: "event: system_state"))
    XCTAssertNil(parser.parse(line: "data: {\"schema_version\":\"1.0.0\","))
    XCTAssertNil(parser.parse(line: "data: \"mode\":\"booting\"}"))

    let event = parser.parse(line: "")

    XCTAssertEqual(
      event,
      ServerSentEvent(
        event: BridgeClient.systemStateEventName,
        data: "{\"schema_version\":\"1.0.0\",\n\"mode\":\"booting\"}"
      )
    )
  }

  func testServerSentEventParserHandlesCarriageReturnDelimitedLines() {
    var parser = ServerSentEventParser()

    XCTAssertNil(parser.parse(line: "event: system_state\r"))
    XCTAssertNil(parser.parse(line: "data: {\"schema_version\":\"1.0.0\"}\r"))

    let event = parser.parse(line: "\r")

    XCTAssertEqual(
      event,
      ServerSentEvent(
        event: BridgeClient.systemStateEventName,
        data: "{\"schema_version\":\"1.0.0\"}"
      )
    )
  }

  func testServerSentEventParserFlushesBufferedEventWhenNextEventStarts() {
    var parser = ServerSentEventParser()

    XCTAssertNil(parser.parse(line: "event: system_state"))
    XCTAssertNil(parser.parse(line: "data: {\"stream_sequence\":1}"))

    let event = parser.parse(line: "event: system_state")

    XCTAssertEqual(
      event,
      ServerSentEvent(
        event: BridgeClient.systemStateEventName,
        data: "{\"stream_sequence\":1}"
      )
    )

    XCTAssertNil(parser.parse(line: "data: {\"stream_sequence\":2}"))
    XCTAssertEqual(
      parser.finish(),
      ServerSentEvent(
        event: BridgeClient.systemStateEventName,
        data: "{\"stream_sequence\":2}"
      )
    )
  }

  func testConnectPublishesLatestSystemStateFromStream() async throws {
    let streamer = MockEventStreamTransport(events: [
      .init(event: "ignored", data: "{\"ignored\":true}"),
      .init(
        event: BridgeClient.systemStateEventName,
        data: try fixtureString(named: "system-state.running.json")
      ),
    ])
    let client = BridgeClient(
      configuration: makeConfiguration(),
      transport: streamer,
      automaticallyReconnect: false
    )

    client.connect()
    await waitForCondition {
      client.connectionState == .disconnected
    }

    XCTAssertEqual(client.latestState?.mode, .running)
    XCTAssertEqual(client.latestState?.menuBar.primaryLabel, "Checkout redesign")
    XCTAssertEqual(client.connectionState, .disconnected)
    XCTAssertNil(client.lastErrorDescription)
    XCTAssertEqual(streamer.requests.count, 1)
    XCTAssertEqual(streamer.requests.first?.url, makeConfiguration().streamURL)
    XCTAssertEqual(
      streamer.requests.first?.value(forHTTPHeaderField: "Accept"),
      "text/event-stream"
    )
  }

  func testConnectSurfacesTransportFailures() async throws {
    let client = BridgeClient(
      configuration: makeConfiguration(),
      transport: MockEventStreamTransport(error: TestError.transportFailed),
      automaticallyReconnect: false
    )

    client.connect()
    await waitForCondition {
      if case .failed = client.connectionState {
        true
      } else {
        false
      }
    }

    XCTAssertEqual(
      client.connectionState,
      .failed(TestError.transportFailed.localizedDescription)
    )
    XCTAssertEqual(client.lastErrorDescription, TestError.transportFailed.localizedDescription)
  }

  func testConnectIgnoresStaleSnapshotsForSameRuntimeSession() async throws {
    let initialStateJSON = try fixtureString(named: "system-state.running.json")
    let staleStateJSON = try mutateSystemStateJSON(initialStateJSON) { state in
      state["stream_sequence"] = 147
      state["mode"] = "paused"

      var menuBar = try XCTUnwrap(state["menu_bar"] as? [String: Any])
      menuBar["primary_label"] = "Stale value should be ignored"
      state["menu_bar"] = menuBar
    }

    let client = BridgeClient(
      configuration: makeConfiguration(),
      transport: MockEventStreamTransport(events: [
        .init(event: BridgeClient.systemStateEventName, data: initialStateJSON),
        .init(event: BridgeClient.systemStateEventName, data: staleStateJSON),
      ]),
      automaticallyReconnect: false
    )

    client.connect()
    await waitForCondition {
      client.connectionState == .disconnected
    }

    XCTAssertEqual(client.latestState?.streamSequence, 148)
    XCTAssertEqual(client.latestState?.mode, .running)
    XCTAssertEqual(client.latestState?.menuBar.primaryLabel, "Checkout redesign")
  }

  func testConnectReplacesStateWhenRuntimeSessionChanges() async throws {
    let initialStateJSON = try fixtureString(named: "system-state.running.json")
    let replacementStateJSON = try mutateSystemStateJSON(initialStateJSON) { state in
      state["runtime_session_id"] = "runtime-session-2"
      state["stream_sequence"] = 1
      state["mode"] = "paused"

      var menuBar = try XCTUnwrap(state["menu_bar"] as? [String: Any])
      menuBar["primary_label"] = "Recovered after restart"
      state["menu_bar"] = menuBar
    }

    let client = BridgeClient(
      configuration: makeConfiguration(),
      transport: MockEventStreamTransport(events: [
        .init(event: BridgeClient.systemStateEventName, data: initialStateJSON),
        .init(event: BridgeClient.systemStateEventName, data: replacementStateJSON),
      ]),
      automaticallyReconnect: false
    )

    client.connect()
    await waitForCondition {
      client.connectionState == .disconnected
    }

    XCTAssertEqual(client.latestState?.runtimeSessionId, "runtime-session-2")
    XCTAssertEqual(client.latestState?.streamSequence, 1)
    XCTAssertEqual(client.latestState?.mode, .paused)
    XCTAssertEqual(client.latestState?.menuBar.primaryLabel, "Recovered after restart")
  }

  func testConnectAutoReconnectsAfterDroppedStream() async throws {
    let initialStateJSON = try fixtureString(named: "system-state.running.json")
    let reconnectedStateJSON = try mutateSystemStateJSON(initialStateJSON) { state in
      state["runtime_session_id"] = "runtime-session-2"
      state["stream_sequence"] = 1

      var menuBar = try XCTUnwrap(state["menu_bar"] as? [String: Any])
      menuBar["primary_label"] = "Fresh snapshot after reconnect"
      state["menu_bar"] = menuBar
    }

    let transport = ScriptedEventStreamTransport(scripts: [
      .events([
        .init(event: BridgeClient.systemStateEventName, data: initialStateJSON)
      ]),
      .events(
        [.init(event: BridgeClient.systemStateEventName, data: reconnectedStateJSON)],
        keepOpen: true
      ),
    ])
    let client = BridgeClient(
      configuration: makeConfiguration(),
      transport: transport,
      automaticallyReconnect: true,
      reconnectDelayNanoseconds: 10_000_000
    )

    client.connect()
    await waitForCondition(timeoutNanoseconds: 1_000_000_000) {
      transport.requests.count == 2
        && client.latestState?.runtimeSessionId == "runtime-session-2"
        && client.connectionState == .connected
    }

    XCTAssertEqual(transport.requests.count, 2)
    XCTAssertEqual(client.latestState?.menuBar.primaryLabel, "Fresh snapshot after reconnect")
    client.disconnect()
  }

  func testConnectRetriesAfterTransportFailure() async throws {
    let recoveredStateJSON = try mutateSystemStateJSON(
      try fixtureString(named: "system-state.running.json")
    ) { state in
      state["runtime_session_id"] = "runtime-session-3"
      state["stream_sequence"] = 1
    }

    let transport = ScriptedEventStreamTransport(scripts: [
      .error(TestError.transportFailed),
      .events(
        [.init(event: BridgeClient.systemStateEventName, data: recoveredStateJSON)],
        keepOpen: true
      ),
    ])
    let client = BridgeClient(
      configuration: makeConfiguration(),
      transport: transport,
      automaticallyReconnect: true,
      reconnectDelayNanoseconds: 10_000_000
    )

    client.connect()
    await waitForCondition(timeoutNanoseconds: 1_000_000_000) {
      transport.requests.count == 2
        && client.latestState?.runtimeSessionId == "runtime-session-3"
        && client.connectionState == .connected
    }

    XCTAssertEqual(client.lastErrorDescription, nil)
    XCTAssertEqual(client.latestState?.runtimeSessionId, "runtime-session-3")
    client.disconnect()
  }

  func testConnectFailsOnSchemaVersionMismatch() async throws {
    let mismatchedStateJSON = try mutateSystemStateJSON(
      try fixtureString(named: "system-state.running.json")
    ) { state in
      state["schema_version"] = "2.0.0"
    }

    let client = BridgeClient(
      configuration: makeConfiguration(),
      transport: MockEventStreamTransport(events: [
        .init(event: BridgeClient.systemStateEventName, data: mismatchedStateJSON)
      ]),
      automaticallyReconnect: false
    )

    client.connect()
    await waitForCondition {
      if case .failed = client.connectionState {
        true
      } else {
        false
      }
    }

    XCTAssertEqual(
      client.connectionState,
      .failed("Bridge schema version mismatch. Expected 1.0.0, received 2.0.0.")
    )
    XCTAssertEqual(
      client.lastErrorDescription,
      "Bridge schema version mismatch. Expected 1.0.0, received 2.0.0."
    )
    XCTAssertNil(client.latestState)
  }

  func testDispatchCommandPostsPauseFixturePayload() async throws {
    let commandTransport = MockCommandRequestTransport(
      statusCode: 202,
      responseJSON:
        #"{"correlation_id":"corr_1","command_id":"c7942526-57a3-4ccb-a4da-2480b496759c","kind":"pause","message":"Command accepted.","status":"success"}"#
    )
    let client = BridgeClient(
      configuration: makeConfiguration(),
      transport: MockEventStreamTransport(),
      commandTransport: commandTransport
    )

    let result = try await client.dispatchCommand(
      PauseCommandPayload(
        reason: .userPause,
        durationSeconds: 600,
        note: "Taking a break"
      ),
      commandId: "c7942526-57a3-4ccb-a4da-2480b496759c",
      sentAt: "2026-04-18T09:00:00Z"
    )

    XCTAssertEqual(result.status, .success)
    XCTAssertEqual(commandTransport.requests.count, 1)
    XCTAssertEqual(commandTransport.requests.first?.httpMethod, "POST")
    XCTAssertEqual(
      commandTransport.requests.first?.value(forHTTPHeaderField: "Content-Type"),
      "application/json"
    )

    let fixture = try commandFixtureData(named: "pause.json")
    XCTAssertEqual(
      try normalizedJSONString(from: commandTransport.requestBodies[0]),
      try normalizedJSONString(from: fixture)
    )
  }

  func testDispatchCommandDecodesValidationFailures() async throws {
    let client = BridgeClient(
      configuration: makeConfiguration(),
      transport: MockEventStreamTransport(),
      commandTransport: MockCommandRequestTransport(
        statusCode: 400,
        responseJSON:
          #"{"correlation_id":"corr_2","command_id":null,"message":"Command payload failed validation.","issues":["payload.raw_text: Required"],"status":"validation_error"}"#
      )
    )

    let result = try await client.dispatchCommand(
      ImportCoachingExchangeCommandPayload(
        source: .manualPaste,
        rawText: "{}"
      ),
      commandId: "8f0c0737-5ea7-4dd2-9a26-2ef6b281a6fa",
      sentAt: "2026-04-18T09:05:00Z"
    )

    XCTAssertEqual(result.status, .validationError)
    XCTAssertNil(result.commandId)
    XCTAssertEqual(result.issues, ["payload.raw_text: Required"])
    XCTAssertEqual(
      client.lastCommandFailure,
      BridgeCommandFailure(
        kind: nil,
        message: "Command payload failed validation.",
        issues: ["payload.raw_text: Required"],
        status: .validationError
      )
    )
  }

  func testDispatchCommandClearsRecordedFailureAfterSuccess() async throws {
    let commandTransport = MockCommandRequestTransport(responses: [
      .init(
        statusCode: 400,
        responseJSON:
          #"{"correlation_id":"corr_2","command_id":null,"message":"Command payload failed validation.","issues":["payload.raw_text: Required"],"status":"validation_error"}"#
      ),
      .init(
        statusCode: 202,
        responseJSON:
          #"{"correlation_id":"corr_3","command_id":"9f07d1d0-71ea-4971-868a-e2bf8d41d010","kind":"resume","message":"Command accepted.","status":"success"}"#
      ),
    ])
    let client = BridgeClient(
      configuration: makeConfiguration(),
      transport: MockEventStreamTransport(),
      commandTransport: commandTransport
    )

    _ = try await client.dispatchCommand(
      ImportCoachingExchangeCommandPayload(
        source: .manualPaste,
        rawText: "{}"
      ),
      commandId: "8f0c0737-5ea7-4dd2-9a26-2ef6b281a6fa",
      sentAt: "2026-04-18T09:05:00Z"
    )

    XCTAssertNotNil(client.lastCommandFailure)

    let result = try await client.dispatchCommand(
      ResumeCommandPayload(reason: .userResume),
      commandId: "9f07d1d0-71ea-4971-868a-e2bf8d41d010",
      sentAt: "2026-04-18T09:06:00Z"
    )

    XCTAssertEqual(result.status, .success)
    XCTAssertNil(client.lastCommandFailure)
  }

  private func makeConfiguration() -> BridgeConfiguration {
    BridgeConfiguration(
      baseURL: URL(string: "http://127.0.0.1:8787")!,
      streamURL: URL(string: "http://127.0.0.1:8787/stream")!,
      commandURL: URL(string: "http://127.0.0.1:8787/command")!
    )
  }

  private func fixtureString(named filename: String) throws -> String {
    let data = try Data(
      contentsOf:
        repositoryRootURL
        .appendingPathComponent("fixtures")
        .appendingPathComponent("contracts")
        .appendingPathComponent(filename)
    )

    guard let fixture = String(data: data, encoding: .utf8) else {
      XCTFail("Fixture \(filename) was not valid UTF-8.")
      return ""
    }

    return fixture
  }

  private func commandFixtureData(named filename: String) throws -> Data {
    try Data(
      contentsOf:
        repositoryRootURL
        .appendingPathComponent("fixtures")
        .appendingPathComponent("contracts")
        .appendingPathComponent("commands")
        .appendingPathComponent(filename)
    )
  }

  private func normalizedJSONString(from data: Data) throws -> String {
    let object = try JSONSerialization.jsonObject(with: data)
    let normalized = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    return try XCTUnwrap(String(data: normalized, encoding: .utf8))
  }

  private func mutateSystemStateJSON(
    _ jsonString: String,
    mutate: (inout [String: Any]) throws -> Void
  ) throws -> String {
    let jsonData = Data(jsonString.utf8)
    var object = try XCTUnwrap(
      try JSONSerialization.jsonObject(with: jsonData) as? [String: Any]
    )

    try mutate(&object)

    let mutatedData = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    return try XCTUnwrap(String(data: mutatedData, encoding: .utf8))
  }

  private var repositoryRootURL: URL {
    URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
  }

  private func waitForCondition(
    timeoutNanoseconds: UInt64 = 500_000_000,
    condition: @escaping () -> Bool
  ) async {
    let deadline = ContinuousClock.now + .nanoseconds(Int(timeoutNanoseconds))

    while condition() == false, ContinuousClock.now < deadline {
      try? await Task.sleep(nanoseconds: 10_000_000)
    }
  }
}

private enum TestError: LocalizedError {
  case transportFailed

  var errorDescription: String? {
    switch self {
    case .transportFailed:
      "Mock transport failed."
    }
  }
}

private final class MockEventStreamTransport: EventStreamTransport {
  private let error: Error?
  private let events: [ServerSentEvent]

  private(set) var requests: [URLRequest] = []

  init(events: [ServerSentEvent] = [], error: Error? = nil) {
    self.error = error
    self.events = events
  }

  func streamEvents(for request: URLRequest) -> AsyncThrowingStream<ServerSentEvent, Error> {
    requests.append(request)

    return AsyncThrowingStream { continuation in
      if let error {
        continuation.finish(throwing: error)
        return
      }

      for event in events {
        continuation.yield(event)
      }

      continuation.finish()
    }
  }
}

private final class ScriptedEventStreamTransport: EventStreamTransport {
  enum Script {
    case error(Error)
    case events([ServerSentEvent], keepOpen: Bool = false)
  }

  private let scripts: [Script]
  private var nextScriptIndex = 0

  private(set) var requests: [URLRequest] = []

  init(scripts: [Script]) {
    self.scripts = scripts
  }

  func streamEvents(for request: URLRequest) -> AsyncThrowingStream<ServerSentEvent, Error> {
    requests.append(request)

    let scriptIndex = nextScriptIndex
    nextScriptIndex += 1
    let script = scriptIndex < scripts.count ? scripts[scriptIndex] : .events([], keepOpen: true)

    return AsyncThrowingStream { continuation in
      switch script {
      case .error(let error):
        continuation.finish(throwing: error)
      case .events(let events, let keepOpen):
        let task = Task {
          for event in events {
            continuation.yield(event)
          }

          if keepOpen {
            do {
              while Task.isCancelled == false {
                try await Task.sleep(nanoseconds: 50_000_000)
              }
            } catch {
              continuation.finish()
              return
            }
          }

          continuation.finish()
        }

        continuation.onTermination = { _ in
          task.cancel()
        }
      }
    }
  }
}

private final class MockCommandRequestTransport: CommandRequestTransport {
  struct Response {
    let responseData: Data
    let statusCode: Int

    init(statusCode: Int, responseJSON: String) {
      self.responseData = Data(responseJSON.utf8)
      self.statusCode = statusCode
    }
  }

  private let responses: [Response]
  private var nextResponseIndex = 0

  private(set) var requestBodies: [Data] = []
  private(set) var requests: [URLRequest] = []

  init(statusCode: Int, responseJSON: String) {
    self.responses = [.init(statusCode: statusCode, responseJSON: responseJSON)]
  }

  init(responses: [Response]) {
    self.responses = responses
  }

  func perform(
    request: URLRequest,
    body: Data
  ) async throws -> (Data, HTTPURLResponse) {
    requests.append(request)
    requestBodies.append(body)

    let response =
      nextResponseIndex < responses.count
      ? responses[nextResponseIndex]
      : try XCTUnwrap(responses.last)
    nextResponseIndex += 1

    let httpResponse = HTTPURLResponse(
      url: try XCTUnwrap(request.url),
      statusCode: response.statusCode,
      httpVersion: nil,
      headerFields: ["Content-Type": "application/json"]
    )

    return (response.responseData, try XCTUnwrap(httpResponse))
  }
}
