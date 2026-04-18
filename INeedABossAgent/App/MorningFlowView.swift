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

struct MorningFlowImportOutcome: Equatable {
  let isSuccess: Bool
  let title: String
  let detailLines: [String]
}

typealias MorningFlowImportHandler =
  @Sendable (ImportCoachingExchangeCommandPayload) async -> MorningFlowImportOutcome

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

  static func importOutcome(from result: CommandActionResult) -> MorningFlowImportOutcome {
    MorningFlowImportOutcome(
      isSuccess: result.status == .success,
      title: result.message,
      detailLines: result.issues ?? []
    )
  }

  static func importOutcome(from error: Error) -> MorningFlowImportOutcome {
    MorningFlowImportOutcome(
      isSuccess: false,
      title: error.localizedDescription,
      detailLines: []
    )
  }
}

struct MorningFlowView: View {
  let morningExchange: MorningExchangeViewModel?
  var clipboard: ClipboardWriting = SystemClipboardWriter()
  var onImport: MorningFlowImportHandler = {
    _ in
    MorningFlowImportOutcome(
      isSuccess: true,
      title: "Command accepted.",
      detailLines: []
    )
  }

  @State private var responseText = ""
  @State private var importOutcome: MorningFlowImportOutcome?
  @State private var isSubmitting = false

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
            if isSubmitting == false, importOutcome?.isSuccess == false {
              importOutcome = nil
            }
          }
          .disabled(importOutcome?.isSuccess == true)
          .overlay {
            RoundedRectangle(cornerRadius: 8)
              .strokeBorder(.quaternary)
          }

        if let importOutcome {
          VStack(alignment: .leading, spacing: 4) {
            Text(importOutcome.title)
              .font(.caption)
              .foregroundStyle(importOutcome.isSuccess ? .green : .orange)

            ForEach(importOutcome.detailLines, id: \.self) { line in
              Text(line)
                .font(.caption2)
                .foregroundStyle(.secondary)
            }
          }
        }

        if importOutcome?.isSuccess == true {
          Button("Edit and Re-import") {
            importOutcome = nil
          }
          .font(.caption)
        } else {
          Button(isSubmitting ? "Importing..." : "Import Response") {
            let payload = MorningFlowPresenter.makeImportPayload(from: responseText)
            isSubmitting = true

            Task {
              importOutcome = await onImport(payload)
              isSubmitting = false
            }
          }
          .font(.caption)
          .disabled(
            isSubmitting
              || responseText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
          )
        }
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
      MorningFlowImportOutcome(
        isSuccess: false,
        title: "Command payload failed validation.",
        detailLines: ["payload.raw_text: Required"]
      )
    }
  )
}
