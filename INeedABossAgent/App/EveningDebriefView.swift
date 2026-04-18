import SwiftUI

struct EveningDebriefContent: Equatable {
  let promptText: String
}

struct EveningDebriefReviewContent: Equatable {
  let summaryLines: [String]
}

typealias EveningDebriefImportHandler =
  @Sendable (ImportCoachingExchangeCommandPayload) async -> MorningFlowImportOutcome

enum EveningDebriefPresenter {
  static func content(from eveningExchange: EveningExchangeViewModel?) -> EveningDebriefContent? {
    guard
      let promptText = eveningExchange?.promptText?.trimmingCharacters(in: .whitespacesAndNewlines),
      promptText.isEmpty == false
    else {
      return nil
    }

    return EveningDebriefContent(promptText: promptText)
  }

  static func copyPrompt(_ content: EveningDebriefContent, clipboard: ClipboardWriting) {
    clipboard.write(content.promptText)
  }

  static func makeImportPayload(from draftText: String) -> ImportCoachingExchangeCommandPayload {
    ImportCoachingExchangeCommandPayload(
      source: .manualPaste,
      rawText: draftText.pasteSanitize()
    )
  }

  static func reviewContent(from draftText: String) -> EveningDebriefReviewContent {
    let sanitizedText = draftText.pasteSanitize()
    let fallback = EveningDebriefReviewContent(
      summaryLines: [
        "The sanitized evening debrief payload will be stored only after bridge validation succeeds.",
        "Imported fields remain app-owned coaching data; Screenpipe raw data is unaffected.",
      ]
    )

    guard
      let data = sanitizedText.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      return fallback
    }

    var summaryLines: [String] = []

    if let localDate = object["local_date"] as? String {
      summaryLines.append("Local date: \(localDate)")
    }

    if let overallDaySummary = object["overall_day_summary"] as? String,
      overallDaySummary.isEmpty == false
    {
      summaryLines.append("Day summary will be imported.")
    }

    if let taskOutcomes = object["task_outcomes"] as? [Any] {
      summaryLines.append("Task outcomes: \(taskOutcomes.count)")
    }

    if let newSupportPatterns = object["new_support_patterns_to_remember"] as? [Any],
      newSupportPatterns.isEmpty == false
    {
      summaryLines.append("Support patterns to remember: \(newSupportPatterns.count)")
    }

    if let carryForward = object["carry_forward_to_tomorrow"] as? String,
      carryForward.isEmpty == false
    {
      summaryLines.append("Carry-forward note for tomorrow will be stored.")
    }

    if let coachingNote = object["coaching_note_for_tomorrow"] as? String,
      coachingNote.isEmpty == false
    {
      summaryLines.append("Tomorrow coaching note will be stored.")
    }

    return summaryLines.isEmpty ? fallback : EveningDebriefReviewContent(summaryLines: summaryLines)
  }
}

struct EveningDebriefView: View {
  let eveningExchange: EveningExchangeViewModel?
  var clipboard: ClipboardWriting = SystemClipboardWriter()
  var onImport: EveningDebriefImportHandler = {
    _ in
    MorningFlowImportOutcome(
      isSuccess: true,
      title: "Command accepted.",
      detailLines: []
    )
  }

  @State private var responseText = ""
  @State private var reviewContent: EveningDebriefReviewContent?
  @State private var importOutcome: MorningFlowImportOutcome?
  @State private var isSubmitting = false
  @State private var isReviewing = false

  var body: some View {
    if let content = EveningDebriefPresenter.content(from: eveningExchange) {
      VStack(alignment: .leading, spacing: 8) {
        Divider()

        HStack {
          Text("Evening Debrief")
            .font(.caption)
            .textCase(.uppercase)
            .foregroundStyle(.secondary)

          Spacer()

          Button("Copy to Clipboard") {
            EveningDebriefPresenter.copyPrompt(content, clipboard: clipboard)
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
            if isSubmitting == false {
              importOutcome = nil
              reviewContent = nil
              isReviewing = false
            }
          }
          .disabled(importOutcome?.isSuccess == true)
          .overlay {
            RoundedRectangle(cornerRadius: 8)
              .strokeBorder(.quaternary)
          }

        if isReviewing, let reviewContent {
          VStack(alignment: .leading, spacing: 4) {
            Text("Import Review")
              .font(.caption)
              .foregroundStyle(.secondary)

            ForEach(reviewContent.summaryLines, id: \.self) { line in
              Text(line)
                .font(.caption)
            }
          }
          .padding(12)
          .frame(maxWidth: .infinity, alignment: .leading)
          .background(Color(nsColor: .controlBackgroundColor))
          .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
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
            isReviewing = false
            reviewContent = nil
          }
          .font(.caption)
        } else if isReviewing {
          HStack {
            Button("Back to Edit") {
              isReviewing = false
            }
            .font(.caption)

            Button(isSubmitting ? "Importing..." : "Confirm Import") {
              let payload = EveningDebriefPresenter.makeImportPayload(from: responseText)
              isSubmitting = true

              Task {
                importOutcome = await onImport(payload)
                isSubmitting = false
              }
            }
            .font(.caption)
            .disabled(isSubmitting)
          }
        } else {
          Button("Review Import") {
            reviewContent = EveningDebriefPresenter.reviewContent(from: responseText)
            isReviewing = true
          }
          .font(.caption)
          .disabled(
            responseText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
          )
        }
      }
    }
  }
}

#Preview {
  EveningDebriefView(
    eveningExchange: EveningExchangeViewModel(
      status: .available,
      debriefPacketText: "{\"local_date\":\"2026-04-18\"}",
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
