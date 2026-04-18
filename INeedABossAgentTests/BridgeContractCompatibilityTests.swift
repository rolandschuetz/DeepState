import XCTest

final class BridgeContractCompatibilityTests: XCTestCase {
  func testSystemStateFixtureRoundTripsThroughSwiftDecoderWithoutSchemaDrift() throws {
    let fixture = try fixtureData(at: ["fixtures", "contracts", "system-state.running.json"])
    let decoded = try BridgeJSONCoding.decoder.decode(SystemState.self, from: fixture)
    let reencoded = try BridgeJSONCoding.encoder.encode(decoded)

    XCTAssertEqual(
      try normalizedJSONString(from: reencoded, droppingNulls: true),
      try normalizedJSONString(from: fixture, droppingNulls: true)
    )
  }

  func testSwiftCommandPayloadEncodersMatchSharedTypeScriptFixtures() throws {
    try assertCommandFixture(
      named: "pause.json",
      envelope: CommandEnvelope(
        commandId: "c7942526-57a3-4ccb-a4da-2480b496759c",
        sentAt: "2026-04-18T09:00:00Z",
        payload: PauseCommandPayload(
          reason: .userPause,
          durationSeconds: 600,
          note: "Taking a break"
        )
      )
    )

    try assertCommandFixture(
      named: "resume.json",
      envelope: CommandEnvelope(
        commandId: "31af6d8b-65ea-48e0-ae22-d4b05e265544",
        sentAt: "2026-04-18T09:01:00Z",
        payload: ResumeCommandPayload(reason: .userResume)
      )
    )

    try assertCommandFixture(
      named: "update-exclusions.json",
      envelope: CommandEnvelope(
        commandId: "787c4699-a3d7-4b15-9245-749668115d84",
        sentAt: "2026-04-18T09:02:00Z",
        payload: UpdateExclusionsCommandPayload(
          operations: [
            .upsert(
              PrivacyExclusionEntry(
                exclusionId: nil,
                label: "Banking",
                matchType: .domain,
                pattern: "bank.example.com",
                enabled: true
              )
            ),
            .remove(exclusionId: "privacy_1"),
          ]
        )
      )
    )

    try assertCommandFixture(
      named: "resolve-ambiguity.json",
      envelope: CommandEnvelope(
        commandId: "15c23639-23fe-4196-8fd9-138ff171564c",
        sentAt: "2026-04-18T09:03:00Z",
        payload: ResolveAmbiguityCommandPayload(
          clarificationId: "clarification_1",
          answerId: "answer_1",
          rememberChoice: .rememberAsTask,
          userNote: nil
        )
      )
    )

    try assertCommandFixture(
      named: "import-coaching-exchange.json",
      envelope: CommandEnvelope(
        commandId: "9c9caef2-3f9a-4e00-ab1c-c4d6fbc4b2ae",
        sentAt: "2026-04-18T09:04:00Z",
        payload: ImportCoachingExchangeCommandPayload(
          source: .manualPaste,
          rawText: #"{"schema_version":"1.0.0","exchange_type":"morning_plan","local_date":"2026-04-18","total_intended_work_seconds":14400,"notes_for_tracker":"Protect the first deep-work block.","tasks":[{"title":"Finish checkout redesign","success_definition":"Ready for implementation handoff.","total_remaining_effort_seconds":7200,"intended_work_seconds_today":7200,"progress_kind":"milestone_based","allowed_support_work":["Design QA"],"likely_detours_that_still_count":["Stakeholder review"]}]}"#
        )
      )
    )

    try assertCommandFixture(
      named: "notification-action.json",
      envelope: CommandEnvelope(
        commandId: "cb8d609e-c4dc-4cfd-ac4f-67dc1212c84d",
        sentAt: "2026-04-18T09:05:00Z",
        payload: NotificationActionCommandPayload(
          interventionId: "intervention_1",
          actionId: "action_1"
        )
      )
    )

    try assertCommandFixture(
      named: "report-notification-permission.json",
      envelope: CommandEnvelope(
        commandId: "40c69955-71bd-4a45-a608-a6f8d8ce9686",
        sentAt: "2026-04-18T09:06:00Z",
        payload: ReportNotificationPermissionCommandPayload(osPermission: .granted)
      )
    )

    try assertCommandFixture(
      named: "request-morning-flow.json",
      envelope: CommandEnvelope(
        commandId: "7626a4cb-1d01-4746-bf14-dca5a2a13266",
        sentAt: "2026-04-18T09:06:30Z",
        payload: RequestMorningFlowCommandPayload(
          localDate: "2026-04-18",
          openedAt: "2026-04-18T09:06:30",
          reason: .firstNotebookOpenAfter4AM
        )
      )
    )

    try assertCommandFixture(
      named: "purge-all.json",
      envelope: CommandEnvelope(
        commandId: "98f78315-56d4-4bb6-8b1d-40190f48d7b4",
        sentAt: "2026-04-18T09:07:00Z",
        payload: PurgeAllCommandPayload(confirmPhrase: "DELETE ALL COACHING DATA")
      )
    )
  }

  private func assertCommandFixture<Payload: BridgeCommandPayload & Encodable>(
    named filename: String,
    envelope: CommandEnvelope<Payload>
  ) throws {
    let encoded = try BridgeJSONCoding.encoder.encode(envelope)
    let fixture = try fixtureData(at: ["fixtures", "contracts", "commands", filename])

    XCTAssertEqual(
      try normalizedJSONString(from: encoded, droppingNulls: true),
      try normalizedJSONString(from: fixture, droppingNulls: true),
      "Fixture mismatch for \(filename)"
    )
  }

  private func fixtureData(at pathComponents: [String]) throws -> Data {
    try Data(contentsOf: repositoryRootURL.appending(path: pathComponents.joined(separator: "/")))
  }

  private func normalizedJSONString(from data: Data, droppingNulls: Bool) throws -> String {
    let object = try JSONSerialization.jsonObject(with: data)
    let comparableObject =
      droppingNulls ? removeNulls(from: object) : object
    let normalized = try JSONSerialization.data(withJSONObject: comparableObject, options: [.sortedKeys])
    return try XCTUnwrap(String(data: normalized, encoding: .utf8))
  }

  private func removeNulls(from value: Any) -> Any {
    switch value {
    case is NSNull:
      return NSNull()
    case let dictionary as [String: Any]:
      return dictionary.reduce(into: [String: Any]()) { partialResult, element in
        if element.value is NSNull {
          return
        }

        partialResult[element.key] = removeNulls(from: element.value)
      }
    case let array as [Any]:
      return array.compactMap { element -> Any? in
        guard (element is NSNull) == false else {
          return nil
        }

        return removeNulls(from: element)
      }
    default:
      return value
    }
  }

  private var repositoryRootURL: URL {
    URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
  }
}
