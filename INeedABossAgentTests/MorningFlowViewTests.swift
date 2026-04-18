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
}

private final class MockClipboardWriter: ClipboardWriting {
  private(set) var values: [String] = []

  func write(_ text: String) {
    values.append(text)
  }
}
