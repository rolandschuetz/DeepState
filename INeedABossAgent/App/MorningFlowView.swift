import AppKit
import SwiftUI

protocol ClipboardWriting {
  func write(_ text: String)
}

struct SystemClipboardWriter: ClipboardWriting {
  func write(_ text: String) {
    let pasteboard = NSPasteboard.general
    pasteboard.clearContents()
    pasteboard.setString(text, forType: .string)
  }
}

struct MorningFlowContent: Equatable {
  let promptText: String
}

enum MorningFlowPresenter {
  static func content(from morningExchange: MorningExchangeViewModel?) -> MorningFlowContent? {
    guard
      let promptText = morningExchange?.promptText?.trimmingCharacters(in: .whitespacesAndNewlines),
      promptText.isEmpty == false
    else {
      return nil
    }

    return MorningFlowContent(promptText: promptText)
  }

  static func copyPrompt(_ content: MorningFlowContent, clipboard: ClipboardWriting) {
    clipboard.write(content.promptText)
  }
}

struct MorningFlowView: View {
  let morningExchange: MorningExchangeViewModel?
  var clipboard: ClipboardWriting = SystemClipboardWriter()

  var body: some View {
    if let content = MorningFlowPresenter.content(from: morningExchange) {
      VStack(alignment: .leading, spacing: 8) {
        Divider()

        HStack {
          Text("Morning Flow")
            .font(.caption)
            .textCase(.uppercase)
            .foregroundStyle(.secondary)

          Spacer()

          Button("Copy to Clipboard") {
            MorningFlowPresenter.copyPrompt(content, clipboard: clipboard)
          }
          .font(.caption)
        }

        ScrollView {
          Text(content.promptText)
            .frame(maxWidth: .infinity, alignment: .leading)
            .font(.caption.monospaced())
            .textSelection(.enabled)
        }
        .frame(maxHeight: 160)
      }
    }
  }
}

#Preview {
  MorningFlowView(
    morningExchange: MorningExchangeViewModel(
      status: .available,
      contextPacketText: "{\"local_date\":\"2026-04-18\"}",
      promptText: "Summarize the day and return strict JSON."
    )
  )
}
