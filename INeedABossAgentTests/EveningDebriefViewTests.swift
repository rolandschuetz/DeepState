import XCTest

final class EveningDebriefViewTests: XCTestCase {
  func testReturnsNilWithoutPromptText() {
    XCTAssertNil(EveningDebriefPresenter.content(from: nil))
    XCTAssertNil(
      EveningDebriefPresenter.content(
        from: EveningExchangeViewModel(
          status: .available,
          debriefPacketText: nil,
          promptText: "   "
        )
      )
    )
  }

  func testCopiesPromptTextVerbatim() {
    let clipboard = ClipboardSpy()
    let content = EveningDebriefContent(promptText: "Strict evening prompt")

    EveningDebriefPresenter.copyPrompt(content, clipboard: clipboard)

    XCTAssertEqual(clipboard.writes, ["Strict evening prompt"])
  }

  func testBuildsManualPastePayloadUsingPasteSanitizer() {
    let payload = EveningDebriefPresenter.makeImportPayload(
      from: """
        Here is the evening debrief:
        ```json
        {“exchange_type”:”evening_debrief”}
        ```
        """
    )

    XCTAssertEqual(payload.source, .manualPaste)
    XCTAssertEqual(payload.rawText, #"{"exchange_type":"evening_debrief"}"#)
  }

  func testBuildsReviewSummaryFromStructuredPayload() {
    let reviewContent = EveningDebriefPresenter.reviewContent(
      from: """
        {
          "schema_version": "1.0.0",
          "exchange_type": "evening_debrief",
          "local_date": "2026-04-18",
          "overall_day_summary": "Good forward motion.",
          "task_outcomes": [{ "task_title": "Ship checkout" }],
          "new_support_patterns_to_remember": ["Stripe docs"],
          "carry_forward_to_tomorrow": "Finalize mobile variants.",
          "coaching_note_for_tomorrow": "Start with the hardest state."
        }
        """
    )

    XCTAssertEqual(
      reviewContent.summaryLines,
      [
        "Local date: 2026-04-18",
        "Day summary will be imported.",
        "Task outcomes: 1",
        "Support patterns to remember: 1",
        "Carry-forward note for tomorrow will be stored.",
        "Tomorrow coaching note will be stored.",
      ]
    )
  }

  private final class ClipboardSpy: ClipboardWriting {
    var writes: [String] = []

    func write(_ text: String) {
      writes.append(text)
    }
  }
}
