import AppKit
import ServiceManagement
import SwiftUI

enum DashboardWindowRoute {
  static let id = "dashboard"
}

struct DashboardTaskProgressContent: Equatable {
  let taskId: String
  let title: String
  let progressText: String
  let etaText: String?
  let confidenceText: String?
  let riskText: String?
  let latestStatusText: String
  let alignedText: String
  let supportText: String
  let driftText: String
}

struct DashboardRecentEventContent: Equatable {
  enum Kind: Equatable {
    case episode
    case correction
  }

  let id: String
  let kind: Kind
  let timestampText: String
  let title: String
  let detail: String
}

struct DashboardExplainabilityContent: Equatable {
  let code: String
  let detail: String
  let weightText: String
}

enum DashboardPresenter {
  static let purgeConfirmPhrase = "DELETE ALL COACHING DATA"

  static func taskProgressContent(
    _ cards: [TaskProgressCard]
  ) -> [DashboardTaskProgressContent] {
    cards.map { card in
      DashboardTaskProgressContent(
        taskId: card.taskId,
        title: card.title,
        progressText: ratioText(card.progressRatio),
        etaText: card.etaRemainingSeconds.map { "ETA remaining: \(durationText($0))" },
        confidenceText: card.confidenceRatio.map { "Confidence: \(ratioText($0))" },
        riskText: card.riskLevel.map { "Risk: \(riskText($0))" },
        latestStatusText: card.latestStatusText,
        alignedText: "Aligned \(durationText(card.alignedSeconds))",
        supportText: "Support \(durationText(card.supportSeconds))",
        driftText: "Drift \(durationText(card.driftSeconds))"
      )
    }
  }

  static func recentEvents(
    episodes: [EpisodeSummary],
    corrections: [CorrectionSummary]
  ) -> [DashboardRecentEventContent] {
    let episodeEvents = episodes.map { episode in
      DashboardRecentEventContent(
        id: episode.episodeId,
        kind: .episode,
        timestampText: episode.endedAt,
        title: episode.matchedTaskTitle ?? "Recent focus episode",
        detail: episode.topEvidence.joined(separator: " • ")
      )
    }

    let correctionEvents = corrections.map { correction in
      DashboardRecentEventContent(
        id: correction.correctionId,
        kind: .correction,
        timestampText: correction.createdAt,
        title: correction.kind.rawValue.replacingOccurrences(of: "_", with: " ").capitalized,
        detail: correction.summaryText
      )
    }

    return (episodeEvents + correctionEvents).sorted {
      $0.timestampText > $1.timestampText
    }
  }

  static func explainabilityContent(
    _ items: [ExplainabilityItem]
  ) -> [DashboardExplainabilityContent] {
    items.map { item in
      DashboardExplainabilityContent(
        code: item.code,
        detail: item.detail,
        weightText: String(format: "%.2f", item.weight)
      )
    }
  }

  static func modeText(_ mode: Mode) -> String {
    switch mode {
    case .booting:
      "Booting"
    case .noPlan:
      "No plan"
    case .running:
      "Running"
    case .paused:
      "Paused"
    case .degradedScreenpipe:
      "Screenpipe degraded"
    case .logicError:
      "Logic error"
    }
  }

  static func runtimeStateText(_ runtimeState: RuntimeState) -> String {
    switch runtimeState {
    case .aligned:
      "Aligned"
    case .uncertain:
      "Uncertain"
    case .softDrift:
      "Soft drift"
    case .hardDrift:
      "Hard drift"
    case .paused:
      "Paused"
    }
  }

  static func durationText(_ seconds: Int) -> String {
    let hours = seconds / 3600
    let minutes = (seconds % 3600) / 60

    if hours > 0 {
      return minutes > 0 ? "\(hours)h \(minutes)m" : "\(hours)h"
    }

    if minutes > 0 {
      return "\(minutes)m"
    }

    return "\(seconds)s"
  }

  static func ratioText(_ ratio: Double?) -> String {
    guard let ratio else {
      return "Unknown"
    }

    return "\(Int((ratio * 100).rounded()))%"
  }

  static func notificationPermissionText(_ status: NotificationPermissionStatus) -> String {
    switch status {
    case .unknown:
      "Unknown"
    case .granted:
      "Granted"
    case .denied:
      "Denied"
    }
  }

  static func notificationMuteText(_ reason: NotificationMuteReason?) -> String? {
    guard let reason else {
      return nil
    }

    switch reason {
    case .observeOnly:
      return "Muted by observe-only mode."
    case .cooldown:
      return "Muted by cooldown."
    case .paused:
      return "Muted while coaching is paused."
    case .modeGate:
      return "Muted by the current runtime mode."
    }
  }

  static func supportScopeText(_ isSupportWork: Bool) -> String {
    isSupportWork ? "Support work" : "Primary task work"
  }

  static func localDataDirectoryURL(
    fileManager: FileManager = .default,
    bundleIdentifier: String = Bundle.main.bundleIdentifier ?? "INeedABossAgent"
  ) -> URL? {
    fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
      .appendingPathComponent(bundleIdentifier, isDirectory: true)
  }

  private static func riskText(_ riskLevel: RiskLevel) -> String {
    switch riskLevel {
    case .low:
      "Low"
    case .medium:
      "Medium"
    case .high:
      "High"
    }
  }
}

@MainActor
final class LaunchAtLoginController: ObservableObject {
  @Published private(set) var isEnabled = false
  @Published private(set) var statusText = "Unavailable"
  @Published private(set) var errorText: String?

  init() {
    refresh()
  }

  func refresh() {
    let status = SMAppService.mainApp.status

    switch status {
    case .enabled:
      isEnabled = true
      statusText = "Enabled"
    case .requiresApproval:
      isEnabled = false
      statusText = "Requires approval in System Settings."
    case .notRegistered:
      isEnabled = false
      statusText = "Disabled"
    case .notFound:
      isEnabled = false
      statusText = "App registration missing."
    @unknown default:
      isEnabled = false
      statusText = "Unavailable"
    }
  }

  func setEnabled(_ enabled: Bool) async {
    do {
      if enabled {
        try SMAppService.mainApp.register()
      } else {
        try await SMAppService.mainApp.unregister()
      }

      errorText = nil
    } catch {
      errorText = error.localizedDescription
    }

    refresh()
  }
}

private enum ReviewDecision {
  case promote
  case reject
}

struct DashboardWindowView: View {
  @ObservedObject var bridgeClient: BridgeClient
  @ObservedObject var appStateStore: AppStateStore

  @StateObject private var launchAtLogin = LaunchAtLoginController()
  @State private var isExplainabilityExpanded = true
  @State private var isDeleteDisclosureExpanded = false
  @State private var isDeleteConfirmationExpanded = false
  @State private var purgeConfirmPhrase = ""
  @State private var reviewSelections: [String: ReviewDecision] = [:]

  var body: some View {
    Group {
      if let dashboard = appStateStore.dashboardState.viewModel {
        ScrollView {
          VStack(alignment: .leading, spacing: 20) {
            dashboardHeader(dashboard.header)
            notificationPermissionWarningSection
            currentFocusSection(dashboard.currentFocus)
            progressSection(dashboard)
            ambiguitiesSection(dashboard.ambiguityQueue)
            reviewQueueSection(dashboard.reviewQueue)
            recentEventsSection(dashboard)
            explainabilitySection(dashboard.currentFocus.explainability)
            privacySection(
              exclusions: appStateStore.settingsState.privacyExclusions?.exclusions
                ?? dashboard.privacyExclusions.exclusions
            )
            settingsSection
            diagnosticsSection
            destructiveSection
          }
          .padding(20)
          .frame(maxWidth: .infinity, alignment: .leading)
        }
      } else {
        ModeRouterView(
          connectionState: bridgeClient.connectionState,
          menuBarState: appStateStore.menuBarState,
          dashboardState: appStateStore.dashboardState
        )
        .padding(20)
      }
    }
    .frame(minWidth: 760, minHeight: 860)
  }

  private var settingsSection: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Settings")
        .font(.title2.weight(.semibold))

      if let notificationHealth = appStateStore.settingsState.notificationHealth {
        SettingsCard(title: "Reminder Preferences") {
          LabeledContent(
            "Notification Permission",
            value: DashboardPresenter.notificationPermissionText(notificationHealth.osPermission)
          )

          if let muteText = DashboardPresenter.notificationMuteText(
            notificationHealth.mutedReason
          ) {
            Text(muteText)
              .font(.caption)
              .foregroundStyle(.secondary)
          }

          Button("Open Notification Settings") {
            openNotificationsSettings()
          }
        }

        SettingsCard(title: "Praise Preferences") {
          Text(
            "Praise delivery follows the same native notification permission and mute gates reported by the logic runtime."
          )
          .font(.caption)
          .foregroundStyle(.secondary)

          Text(
            notificationHealth.mutedByLogic
              ? "Logic is currently muting notifications."
              : "Logic currently allows notification delivery."
          )
          .font(.caption)
          .foregroundStyle(.secondary)
        }
      }

      SettingsCard(title: "Local Data Export") {
        Text(
          "Local exports are owned by the logic runtime. This UI exposes the app support directory without recreating export logic in Swift."
        )
        .font(.caption)
        .foregroundStyle(.secondary)

        Button("Reveal Local Data Folder") {
          revealLocalDataFolder()
        }
      }

      SettingsCard(title: "Launch at Login") {
        Toggle(
          "Launch INeedABossAgent at login",
          isOn: Binding(
            get: { launchAtLogin.isEnabled },
            set: { newValue in
              Task {
                await launchAtLogin.setEnabled(newValue)
              }
            }
          )
        )

        Text(launchAtLogin.statusText)
          .font(.caption)
          .foregroundStyle(.secondary)

        if let errorText = launchAtLogin.errorText {
          Text(errorText)
            .font(.caption)
            .foregroundStyle(.red)
        }
      }
    }
  }

  private var notificationPermissionWarningSection: some View {
    Group {
      if appStateStore.settingsState.notificationHealth?.osPermission == .denied {
        VStack(alignment: .leading, spacing: 4) {
          Text("Notifications Denied")
            .font(.headline)

          Text(
            "Native reminders and praise are blocked until macOS notification permission is restored."
          )
          .font(.subheadline)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.yellow.opacity(0.18))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
      }
    }
  }

  private var diagnosticsSection: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Diagnostics")
        .font(.title2.weight(.semibold))

      DiagnosticsView(
        systemHealth: appStateStore.dashboardState.systemHealth,
        connectionState: bridgeClient.connectionState,
        bridgeError: bridgeClient.lastErrorDescription,
        lastCommandFailure: bridgeClient.lastCommandFailure
      )
    }
  }

  private var destructiveSection: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Delete All Coaching Data")
        .font(.title2.weight(.semibold))

      DisclosureGroup(
        "I understand this removes app-owned coaching data.",
        isExpanded: $isDeleteDisclosureExpanded
      ) {
        VStack(alignment: .leading, spacing: 10) {
          Text(
            "This keeps Screenpipe raw data untouched, but it clears imported plans, episodes, review items, and other purgeable coaching state."
          )
          .font(.caption)
          .foregroundStyle(.secondary)

          DisclosureGroup("Show final confirmation", isExpanded: $isDeleteConfirmationExpanded) {
            VStack(alignment: .leading, spacing: 10) {
              Text("Type `\(DashboardPresenter.purgeConfirmPhrase)` to continue.")
                .font(.caption)
                .foregroundStyle(.secondary)

              TextField("Confirmation phrase", text: $purgeConfirmPhrase)
                .textFieldStyle(.roundedBorder)

              Button("Delete All Coaching Data") {
                Task {
                  _ = try? await bridgeClient.dispatchCommand(
                    PurgeAllCommandPayload(confirmPhrase: DashboardPresenter.purgeConfirmPhrase)
                  )
                }
              }
              .disabled(purgeConfirmPhrase != DashboardPresenter.purgeConfirmPhrase)
              .foregroundStyle(.red)
            }
            .padding(.top, 8)
          }
        }
        .padding(.top, 8)
      }
    }
  }

  private func dashboardHeader(_ header: DashboardHeaderViewModel) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Dashboard")
        .font(.largeTitle.weight(.semibold))

      Text(header.summaryText)
        .font(.headline)

      Text("\(header.localDate) • \(DashboardPresenter.modeText(header.mode))")
        .font(.subheadline)
        .foregroundStyle(.secondary)

      if let warningBanner = header.warningBanner {
        VStack(alignment: .leading, spacing: 4) {
          Text(warningBanner.title)
            .font(.headline)

          Text(warningBanner.body)
            .font(.subheadline)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(bannerBackgroundColor(for: warningBanner.severity))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
      }
    }
  }

  private func currentFocusSection(_ currentFocus: CurrentFocusViewModel) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Current Focus")
        .font(.title2.weight(.semibold))

      HStack(spacing: 16) {
        MetricTile(
          title: "Runtime",
          value: DashboardPresenter.runtimeStateText(currentFocus.runtimeState)
        )

        MetricTile(
          title: "Scope",
          value: DashboardPresenter.supportScopeText(currentFocus.isSupportWork)
        )

        MetricTile(
          title: "Confidence",
          value: DashboardPresenter.ratioText(currentFocus.confidenceRatio)
        )
      }

      if let lastGoodContext = currentFocus.lastGoodContext {
        VStack(alignment: .leading, spacing: 4) {
          Text("Recovery Anchor")
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)

          Text(lastGoodContext)
            .textSelection(.enabled)
        }
      }
    }
  }

  private func progressSection(_ dashboard: DashboardViewModel) -> some View {
    let taskContent = DashboardPresenter.taskProgressContent(dashboard.progress.tasks)

    return VStack(alignment: .leading, spacing: 12) {
      Text("Progress")
        .font(.title2.weight(.semibold))

      HStack(spacing: 16) {
        MetricTile(
          title: "Aligned",
          value: DashboardPresenter.durationText(dashboard.progress.totalAlignedSeconds)
        )

        MetricTile(
          title: "Support",
          value: DashboardPresenter.durationText(dashboard.progress.totalSupportSeconds)
        )

        MetricTile(
          title: "Drift",
          value: DashboardPresenter.durationText(dashboard.progress.totalDriftSeconds)
        )

        MetricTile(
          title: "Planned",
          value: dashboard.progress.totalIntendedWorkSeconds.map(DashboardPresenter.durationText)
            ?? "Unknown"
        )
      }

      if let plan = dashboard.plan {
        Text("Focus goals for \(plan.localDate)")
          .font(.headline)

        if let notesForTracker = plan.notesForTracker {
          Text(notesForTracker)
            .font(.caption)
            .foregroundStyle(.secondary)
        }
      }

      ForEach(taskContent, id: \.taskId) { task in
        VStack(alignment: .leading, spacing: 8) {
          HStack {
            Text(task.title)
              .font(.headline)

            Spacer()

            Text(task.progressText)
              .font(.headline)
          }

          if let etaText = task.etaText {
            Text(etaText)
              .font(.caption)
              .foregroundStyle(.secondary)
          }

          if let confidenceText = task.confidenceText {
            Text(confidenceText)
              .font(.caption)
              .foregroundStyle(.secondary)
          }

          if let riskText = task.riskText {
            Text(riskText)
              .font(.caption)
              .foregroundStyle(.secondary)
          }

          Text(task.latestStatusText)
            .font(.subheadline)

          HStack(spacing: 12) {
            Text(task.alignedText)
            Text(task.supportText)
            Text(task.driftText)
          }
          .font(.caption)
          .foregroundStyle(.secondary)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(nsColor: .controlBackgroundColor))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
      }
    }
  }

  private func ambiguitiesSection(_ items: [AmbiguityQueueItem]) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Unresolved Ambiguities")
        .font(.title2.weight(.semibold))

      if items.isEmpty {
        Text("No outstanding ambiguity items.")
          .font(.subheadline)
          .foregroundStyle(.secondary)
      } else {
        ForEach(items, id: \.ambiguityId) { item in
          QueueCard(
            title: item.prompt,
            detail: item.resolutionSummary ?? item.status.rawValue.capitalized,
            timestampText: item.createdAt
          )
        }
      }
    }
  }

  private func reviewQueueSection(_ items: [DurableRuleReviewItem]) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Pending Milestone Confirmations")
        .font(.title2.weight(.semibold))

      if items.isEmpty {
        Text("No pending confirmations.")
          .font(.subheadline)
          .foregroundStyle(.secondary)
      } else {
        Text("Selections stay local until the bridge exposes a durable-rule review command.")
          .font(.caption)
          .foregroundStyle(.secondary)

        ForEach(items, id: \.reviewItemId) { item in
          VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
              VStack(alignment: .leading, spacing: 4) {
                Text(item.title)
                  .font(.headline)

                Text(item.rationale)
                  .font(.subheadline)

                Text(item.proposedRuleText)
                  .font(.caption)
                  .foregroundStyle(.secondary)
              }

              Spacer()

              VStack(alignment: .leading, spacing: 6) {
                Toggle(
                  "Promote",
                  isOn: reviewBinding(for: item.reviewItemId, decision: .promote)
                )

                Toggle(
                  "Reject",
                  isOn: reviewBinding(for: item.reviewItemId, decision: .reject)
                )
              }
              .toggleStyle(.checkbox)
            }

            Text(item.createdAt)
              .font(.caption)
              .foregroundStyle(.secondary)
          }
          .padding(12)
          .frame(maxWidth: .infinity, alignment: .leading)
          .background(Color(nsColor: .controlBackgroundColor))
          .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
      }
    }
  }

  private func reviewBinding(
    for reviewItemId: String,
    decision: ReviewDecision
  ) -> Binding<Bool> {
    Binding(
      get: { reviewSelections[reviewItemId] == decision },
      set: { isSelected in
        reviewSelections[reviewItemId] = isSelected ? decision : nil
      }
    )
  }

  private func recentEventsSection(_ dashboard: DashboardViewModel) -> some View {
    let items = DashboardPresenter.recentEvents(
      episodes: dashboard.recentEpisodes,
      corrections: dashboard.corrections
    )

    return VStack(alignment: .leading, spacing: 12) {
      Text("Recent Events")
        .font(.title2.weight(.semibold))

      if items.isEmpty {
        Text("No recent events.")
          .font(.subheadline)
          .foregroundStyle(.secondary)
      } else {
        ForEach(items, id: \.id) { item in
          VStack(alignment: .leading, spacing: 4) {
            Text(item.title)
              .font(.headline)

            Text(item.detail)
              .font(.subheadline)

            Text(item.timestampText)
              .font(.caption)
              .foregroundStyle(.secondary)
          }
          .padding(12)
          .frame(maxWidth: .infinity, alignment: .leading)
          .background(Color(nsColor: .controlBackgroundColor))
          .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
      }
    }
  }

  private func explainabilitySection(_ items: [ExplainabilityItem]) -> some View {
    let content = DashboardPresenter.explainabilityContent(items)

    return VStack(alignment: .leading, spacing: 12) {
      DisclosureGroup(
        "Why am I seeing this?",
        isExpanded: $isExplainabilityExpanded
      ) {
        VStack(alignment: .leading, spacing: 8) {
          if content.isEmpty {
            Text("No explainability entries were provided.")
              .font(.subheadline)
              .foregroundStyle(.secondary)
          } else {
            ForEach(Array(content.enumerated()), id: \.offset) { _, item in
              VStack(alignment: .leading, spacing: 4) {
                Text(item.code)
                  .font(.caption.monospaced())
                  .foregroundStyle(.secondary)

                Text(item.detail)
                  .font(.subheadline)

                Text("Weight \(item.weightText)")
                  .font(.caption)
                  .foregroundStyle(.secondary)
              }
              .padding(12)
              .frame(maxWidth: .infinity, alignment: .leading)
              .background(Color(nsColor: .controlBackgroundColor))
              .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
          }
        }
        .padding(.top, 8)
      }
      .font(.title2.weight(.semibold))
    }
  }

  private func privacySection(exclusions: [PrivacyExclusionEntry]) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Privacy Exclusions")
        .font(.title2.weight(.semibold))

      if exclusions.isEmpty {
        Text("No privacy exclusions were provided by the logic runtime.")
          .font(.subheadline)
          .foregroundStyle(.secondary)
      } else {
        ForEach(Array(exclusions.enumerated()), id: \.offset) { _, entry in
          PrivacyExclusionRow(entry: entry) { updatedEntry in
            _ = try? await bridgeClient.dispatchCommand(
              UpdateExclusionsCommandPayload(operations: [.upsert(updatedEntry)])
            )
          } onRemove: { exclusionId in
            _ = try? await bridgeClient.dispatchCommand(
              UpdateExclusionsCommandPayload(operations: [.remove(exclusionId: exclusionId)])
            )
          }
        }
      }
    }
  }

  private func bannerBackgroundColor(for severity: Severity) -> Color {
    switch severity {
    case .info:
      return Color.blue.opacity(0.16)
    case .warning:
      return Color.yellow.opacity(0.18)
    case .critical:
      return Color.red.opacity(0.16)
    }
  }

  private func revealLocalDataFolder() {
    guard let directoryURL = DashboardPresenter.localDataDirectoryURL() else {
      return
    }

    NSWorkspace.shared.activateFileViewerSelecting([directoryURL])
  }

  private func openNotificationsSettings() {
    guard
      let settingsURL = URL(
        string: "x-apple.systempreferences:com.apple.Notifications-Settings.extension"
      )
    else {
      return
    }

    NSWorkspace.shared.open(settingsURL)
  }
}

private struct MetricTile: View {
  let title: String
  let value: String

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(title)
        .font(.caption.weight(.semibold))
        .foregroundStyle(.secondary)

      Text(value)
        .font(.headline)
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Color(nsColor: .controlBackgroundColor))
    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
  }
}

private struct QueueCard: View {
  let title: String
  let detail: String
  let timestampText: String
  var footerText: String? = nil

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(title)
        .font(.headline)

      Text(detail)
        .font(.subheadline)

      if let footerText {
        Text(footerText)
          .font(.caption)
          .foregroundStyle(.secondary)
      }

      Text(timestampText)
        .font(.caption)
        .foregroundStyle(.secondary)
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Color(nsColor: .controlBackgroundColor))
    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
  }
}

private struct SettingsCard<Content: View>: View {
  let title: String
  @ViewBuilder let content: Content

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title)
        .font(.headline)

      content
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Color(nsColor: .controlBackgroundColor))
    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
  }
}

private struct PrivacyExclusionRow: View {
  let entry: PrivacyExclusionEntry
  let onUpsert: (PrivacyExclusionEntry) async -> Void
  let onRemove: (String) async -> Void

  @State private var label: String
  @State private var pattern: String
  @State private var enabled: Bool
  @State private var saveTask: Task<Void, Never>?

  init(
    entry: PrivacyExclusionEntry,
    onUpsert: @escaping (PrivacyExclusionEntry) async -> Void,
    onRemove: @escaping (String) async -> Void
  ) {
    self.entry = entry
    self.onUpsert = onUpsert
    self.onRemove = onRemove
    _label = State(initialValue: entry.label)
    _pattern = State(initialValue: entry.pattern)
    _enabled = State(initialValue: entry.enabled)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        Text(entry.matchType.rawValue.replacingOccurrences(of: "_", with: " ").capitalized)
          .font(.caption.weight(.semibold))
          .foregroundStyle(.secondary)

        Spacer()

        Toggle("Enabled", isOn: $enabled)
          .toggleStyle(.switch)
          .labelsHidden()
      }

      TextField("Label", text: $label)
        .textFieldStyle(.roundedBorder)

      TextField("Pattern", text: $pattern)
        .textFieldStyle(.roundedBorder)

      if let exclusionId = entry.exclusionId {
        Button("Remove Exclusion") {
          Task {
            await onRemove(exclusionId)
          }
        }
        .foregroundStyle(.red)
      }
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Color(nsColor: .controlBackgroundColor))
    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    .onChange(of: label) {
      scheduleSave()
    }
    .onChange(of: pattern) {
      scheduleSave()
    }
    .onChange(of: enabled) {
      scheduleSave()
    }
    .onChange(of: entry) { _, updatedEntry in
      label = updatedEntry.label
      pattern = updatedEntry.pattern
      enabled = updatedEntry.enabled
    }
    .onDisappear {
      saveTask?.cancel()
    }
  }

  private func scheduleSave() {
    saveTask?.cancel()
    let updatedEntry = PrivacyExclusionEntry(
      exclusionId: entry.exclusionId,
      label: label,
      matchType: entry.matchType,
      pattern: pattern,
      enabled: enabled
    )

    saveTask = Task {
      try? await Task.sleep(nanoseconds: 400_000_000)
      guard Task.isCancelled == false else {
        return
      }

      await onUpsert(updatedEntry)
    }
  }
}
