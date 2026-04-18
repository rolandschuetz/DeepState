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

struct MorningFlowImportFeedback: Equatable {
  let title: String
  let detailLines: [String]
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

  static func importFeedback(from result: CommandActionResult) -> MorningFlowImportFeedback? {
    guard result.status != .success else {
      return nil
    }

    return MorningFlowImportFeedback(
      title: result.message,
      detailLines: result.issues ?? []
    )
  }

  static func importFeedback(from error: Error) -> MorningFlowImportFeedback {
    MorningFlowImportFeedback(
      title: error.localizedDescription,
      detailLines: []
    )
  }
}

struct MorningFlowView: View {
  let morningExchange: MorningExchangeViewModel?
  var clipboard: ClipboardWriting = SystemClipboardWriter()
  var onImport:
    @Sendable (ImportCoachingExchangeCommandPayload) async -> MorningFlowImportFeedback? = {
      _ in nil
    }

  @State private var responseText = ""
  @State private var importFeedback: MorningFlowImportFeedback?

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
          .onChange(of: responseText) {
            importFeedback = nil
          }
          .overlay {
            RoundedRectangle(cornerRadius: 8)
              .strokeBorder(.quaternary)
          }

        if let importFeedback {
          VStack(alignment: .leading, spacing: 4) {
            Text(importFeedback.title)
              .font(.caption)
              .foregroundStyle(.orange)

            ForEach(importFeedback.detailLines, id: \.self) { line in
              Text(line)
                .font(.caption2)
                .foregroundStyle(.secondary)
            }
          }
        }

        Button("Import Response") {
          let payload = MorningFlowPresenter.makeImportPayload(from: responseText)
          Task {
            importFeedback = await onImport(payload)
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
    ),
    onImport: { _ in
      MorningFlowImportFeedback(
        title: "Command payload failed validation.",
        detailLines: ["payload.raw_text: Required"]
      )
    }
  )
}
