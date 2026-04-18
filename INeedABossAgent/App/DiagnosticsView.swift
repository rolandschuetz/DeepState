import SwiftUI

struct DiagnosticsRow: Equatable {
  let label: String
  let status: String
  let detail: String?
}

enum DiagnosticsPresenter {
  static func rows(
    from systemHealth: SystemHealthViewModel?,
    connectionState: BridgeClient.ConnectionState,
    bridgeError: String?,
    lastCommandFailure: BridgeCommandFailure?
  ) -> [DiagnosticsRow] {
    var rows: [DiagnosticsRow] = [
      bridgeRow(
        connectionState: connectionState,
        bridgeError: bridgeError
      )
    ]

    if let lastCommandFailure {
      rows.append(
        DiagnosticsRow(
          label: "Command",
          status: commandStatusLabel(lastCommandFailure.status),
          detail: commandDetail(for: lastCommandFailure)
        )
      )
    }

    guard let systemHealth else {
      return rows
    }

    rows.append(
      componentRow(
        label: "Overall",
        status: systemHealth.overallStatus.rawValue,
        message: nil,
        lastOkAt: nil,
        lastErrorAt: nil
      )
    )
    rows.append(
      componentRow(
        label: "Screenpipe",
        status: systemHealth.screenpipe.status.rawValue,
        message: systemHealth.screenpipe.message,
        lastOkAt: systemHealth.screenpipe.lastOkAt,
        lastErrorAt: systemHealth.screenpipe.lastErrorAt
      )
    )
    rows.append(
      componentRow(
        label: "Database",
        status: systemHealth.database.status.rawValue,
        message: systemHealth.database.message,
        lastOkAt: systemHealth.database.lastOkAt,
        lastErrorAt: systemHealth.database.lastErrorAt
      )
    )

    return rows
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

  private static func bridgeRow(
    connectionState: BridgeClient.ConnectionState,
    bridgeError: String?
  ) -> DiagnosticsRow {
    let status: String
    let detail: String?

    switch connectionState {
    case .idle:
      status = "Idle"
      detail = "Waiting to open the bridge stream."
    case .connecting:
      status = "Connecting"
      detail = "Requesting the latest system snapshot."
    case .connected:
      status = "Connected"
      detail = nil
    case .disconnected:
      status = "Disconnected"
      detail = "The stream dropped. Reconnect is pending."
    case .failed(let message):
      status = "Failed"
      detail = bridgeError ?? message
    }

    return DiagnosticsRow(
      label: "Bridge",
      status: status,
      detail: detail
    )
  }

  private static func commandStatusLabel(_ status: CommandActionStatus) -> String {
    switch status {
    case .success:
      "Success"
    case .validationError:
      "Validation Error"
    case .retryableFailure:
      "Retryable Failure"
    case .fatalFailure:
      "Fatal Failure"
    }
  }

  private static func commandDetail(for failure: BridgeCommandFailure) -> String {
    let prefix = failure.kind?.rawValue ?? "unknown_command"
    let issues =
      failure.issues.isEmpty
      ? nil
      : failure.issues.joined(separator: " | ")

    return [prefix, failure.message, issues]
      .compactMap { $0 }
      .joined(separator: ": ")
  }
}

struct DiagnosticsView: View {
  let systemHealth: SystemHealthViewModel?
  let connectionState: BridgeClient.ConnectionState
  let bridgeError: String?
  let lastCommandFailure: BridgeCommandFailure?

  var body: some View {
    let rows = DiagnosticsPresenter.rows(
      from: systemHealth,
      connectionState: connectionState,
      bridgeError: bridgeError,
      lastCommandFailure: lastCommandFailure
    )

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
  DiagnosticsView(
    systemHealth: nil,
    connectionState: .connecting,
    bridgeError: nil,
    lastCommandFailure: nil
  )
}
