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
      transport: streamer
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
      transport: MockEventStreamTransport(error: TestError.transportFailed)
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

private final class MockCommandRequestTransport: CommandRequestTransport {
  private let responseData: Data
  private let statusCode: Int

  private(set) var requestBodies: [Data] = []
  private(set) var requests: [URLRequest] = []

  init(statusCode: Int, responseJSON: String) {
    self.responseData = Data(responseJSON.utf8)
    self.statusCode = statusCode
  }

  func perform(
    request: URLRequest,
    body: Data
  ) async throws -> (Data, HTTPURLResponse) {
    requests.append(request)
    requestBodies.append(body)

    let response = HTTPURLResponse(
      url: try XCTUnwrap(request.url),
      statusCode: statusCode,
      httpVersion: nil,
      headerFields: ["Content-Type": "application/json"]
    )

    return (responseData, try XCTUnwrap(response))
  }
}
