import XCTest

final class MorningFlowViewTests: XCTestCase {
  func testReturnsNilWithoutPromptText() {
    XCTAssertNil(
      MorningFlowPresenter.content(
        from: MorningExchangeViewModel(
          status: .requiredStatus,
          contextPacketText: nil,
          promptText: nil
        )
      )
    )
  }

  func testTrimsAndReturnsPromptText() {
    XCTAssertEqual(
      MorningFlowPresenter.content(
        from: MorningExchangeViewModel(
          status: .available,
          contextPacketText: nil,
          promptText: "\n  Return strict JSON only.  \n"
        )
      ),
      MorningFlowContent(promptText: "Return strict JSON only.")
    )
  }

  func testCopyPromptWritesExactPromptToClipboardWriter() {
    let clipboard = MockClipboardWriter()
    let content = MorningFlowContent(promptText: "Return strict JSON only.")

    MorningFlowPresenter.copyPrompt(content, clipboard: clipboard)

    XCTAssertEqual(clipboard.values, ["Return strict JSON only."])
  }

  func testBuildsManualPasteImportPayloadFromSanitizedDraft() {
    let payload = MorningFlowPresenter.makeImportPayload(
      from: """
        Sure, use this.
        ```json
        {
          “schema_version”: “1.0.0”
        }
        ```
        """
    )

    XCTAssertEqual(payload.source, .manualPaste)
    XCTAssertEqual(
      payload.rawText,
      """
      {
        "schema_version": "1.0.0"
      }
      """
    )
  }

  func testMapsValidationResultIntoInlineFeedback() {
    XCTAssertEqual(
      MorningFlowPresenter.importFeedback(
        from: CommandActionResult(
          correlationId: "corr_1",
          commandId: nil,
          kind: .importCoachingExchange,
          message: "Command payload failed validation.",
          issues: ["payload.raw_text: Invalid JSON"],
          status: .validationError
        )
      ),
      MorningFlowImportFeedback(
        title: "Command payload failed validation.",
        detailLines: ["payload.raw_text: Invalid JSON"]
      )
    )
  }

  func testIgnoresSuccessfulImportResult() {
    XCTAssertNil(
      MorningFlowPresenter.importFeedback(
        from: CommandActionResult(
          correlationId: "corr_2",
          commandId: "cmd_1",
          kind: .importCoachingExchange,
          message: "Command accepted.",
          issues: nil,
          status: .success
        )
      )
    )
  }
}

private final class MockClipboardWriter: ClipboardWriting {
  private(set) var values: [String] = []

  func write(_ text: String) {
    values.append(text)
  }
}
