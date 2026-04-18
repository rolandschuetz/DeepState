import XCTest

final class PasteSanitizerTests: XCTestCase {
  func testRemovesMarkdownFencesAndConversationalPadding() {
    let rawPaste = """
      Absolutely. Here's the cleaned JSON:

      ```json
      {
        "schema_version": "1.0.0",
        "exchange_type": "morning_plan"
      }
      ```

      Let me know if you want a stricter version.
      """

    XCTAssertEqual(
      rawPaste.pasteSanitize(),
      """
      {
        "schema_version": "1.0.0",
        "exchange_type": "morning_plan"
      }
      """
    )
  }

  func testNormalizesSmartQuotesBeforeExtractingJSONBody() {
    let rawPaste = """
      Sure — use this:
      {
        “schema_version”: “1.0.0”,
        “exchange_type”: “morning_plan”,
        “notes_for_tracker”: “Protect the first block”
      }
      """

    XCTAssertEqual(
      rawPaste.pasteSanitize(),
      """
      {
        "schema_version": "1.0.0",
        "exchange_type": "morning_plan",
        "notes_for_tracker": "Protect the first block"
      }
      """
    )
  }

  func testLeavesNonJSONTextTrimmedWhenNoObjectExists() {
    XCTAssertEqual(
      "  No JSON was generated yet.  ".pasteSanitize(),
      "No JSON was generated yet."
    )
  }
}
