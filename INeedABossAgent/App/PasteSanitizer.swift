import Foundation

extension String {
  func pasteSanitize() -> String {
    let normalized =
      self
      .replacingOccurrences(of: "“", with: "\"")
      .replacingOccurrences(of: "”", with: "\"")
      .replacingOccurrences(of: "‘", with: "'")
      .replacingOccurrences(of: "’", with: "'")
      .replacingOccurrences(
        of: #"```[A-Za-z0-9_-]*\s*"#,
        with: "",
        options: .regularExpression
      )
      .replacingOccurrences(of: "```", with: "")
      .trimmingCharacters(in: .whitespacesAndNewlines)

    guard
      let start = normalized.firstIndex(of: "{"),
      let end = normalized.lastIndex(of: "}")
    else {
      return normalized
    }

    return String(normalized[start...end])
      .trimmingCharacters(in: .whitespacesAndNewlines)
  }
}
