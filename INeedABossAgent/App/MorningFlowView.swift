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

  static func makeImportPayload(from draftText: String) -> ImportCoachingExchangeCommandPayload {
    ImportCoachingExchangeCommandPayload(
      source: .manualPaste,
      rawText: draftText.pasteSanitize()
    )
  }
}

struct MorningFlowView: View {
  let morningExchange: MorningExchangeViewModel?
  var clipboard: ClipboardWriting = SystemClipboardWriter()
  var onImport: @Sendable (ImportCoachingExchangeCommandPayload) async -> Void = { _ in }

  @State private var responseText = ""

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

        Text("ChatGPT Response")
          .font(.caption)
          .foregroundStyle(.secondary)

        TextEditor(text: $responseText)
          .font(.caption.monospaced())
          .frame(minHeight: 140)
          .overlay {
            RoundedRectangle(cornerRadius: 8)
              .strokeBorder(.quaternary)
          }

        Button("Import Response") {
          let payload = MorningFlowPresenter.makeImportPayload(from: responseText)
          Task {
            await onImport(payload)
          }
        }
        .font(.caption)
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
