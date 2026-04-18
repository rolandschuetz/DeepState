import SwiftUI

struct DiagnosticsRow: Equatable {
  let label: String
  let status: String
  let detail: String?
}

enum DiagnosticsPresenter {
  static func rows(from systemHealth: SystemHealthViewModel?) -> [DiagnosticsRow] {
    guard let systemHealth else {
      return []
    }

    return [
      componentRow(
        label: "Overall",
        status: systemHealth.overallStatus.rawValue,
        message: nil,
        lastOkAt: nil,
        lastErrorAt: nil
      ),
      componentRow(
        label: "Screenpipe",
        status: systemHealth.screenpipe.status.rawValue,
        message: systemHealth.screenpipe.message,
        lastOkAt: systemHealth.screenpipe.lastOkAt,
        lastErrorAt: systemHealth.screenpipe.lastErrorAt
      ),
      componentRow(
        label: "Database",
        status: systemHealth.database.status.rawValue,
        message: systemHealth.database.message,
        lastOkAt: systemHealth.database.lastOkAt,
        lastErrorAt: systemHealth.database.lastErrorAt
      ),
    ]
  }

  private static func componentRow(
    label: String,
    status: String,
    message: String?,
    lastOkAt: String?,
    lastErrorAt: String?
  ) -> DiagnosticsRow {
    let detail =
      message
      ?? lastErrorAt.map { "Last error: \($0)" }
      ?? lastOkAt.map { "Last ok: \($0)" }

    return DiagnosticsRow(
      label: label,
      status: status.capitalized,
      detail: detail
    )
  }
}

struct DiagnosticsView: View {
  let systemHealth: SystemHealthViewModel?

  var body: some View {
    let rows = DiagnosticsPresenter.rows(from: systemHealth)

    if rows.isEmpty == false {
      VStack(alignment: .leading, spacing: 6) {
        Divider()

        Text("Diagnostics")
          .font(.caption)
          .textCase(.uppercase)
          .foregroundStyle(.secondary)

        ForEach(rows, id: \.label) { row in
          VStack(alignment: .leading, spacing: 2) {
            HStack {
              Text(row.label)
              Spacer()
              Text(row.status)
                .foregroundStyle(.secondary)
            }
            .font(.caption)

            if let detail = row.detail {
              Text(detail)
                .font(.caption2)
                .foregroundStyle(.tertiary)
            }
          }
        }
      }
    }
  }
}

#Preview {
  DiagnosticsView(systemHealth: nil)
}
