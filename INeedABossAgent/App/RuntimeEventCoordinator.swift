import AppKit
import SwiftUI
import UserNotifications

struct NotificationActionContext: Equatable {
  let compositeIdentifier: String
  let interventionId: String
  let actionId: String
  let semanticAction: InterventionSemanticAction
}

enum RuntimeEventPresenter {
  static func notificationPermissionStatus(
    for authorizationStatus: UNAuthorizationStatus
  ) -> NotificationPermissionStatus {
    switch authorizationStatus {
    case .authorized, .provisional, .ephemeral:
      return .granted
    case .denied:
      return .denied
    case .notDetermined:
      return .unknown
    @unknown default:
      return .unknown
    }
  }

  static func shouldDeliverNotification(for systemState: SystemState) -> Bool {
    guard let intervention = systemState.intervention else {
      return false
    }

    guard
      intervention.presentation == .both || intervention.presentation == .localNotification
    else {
      return false
    }

    guard intervention.suppressNativeNotification == false else {
      return false
    }

    return systemState.systemHealth.notifications.osPermission != .denied
  }

  static func actionContexts(
    for intervention: InterventionViewModel
  ) -> [NotificationActionContext] {
    intervention.actions.map { action in
      NotificationActionContext(
        compositeIdentifier: "\(intervention.interventionId)::\(action.actionId)",
        interventionId: intervention.interventionId,
        actionId: action.actionId,
        semanticAction: action.semanticAction
      )
    }
  }

  static func rememberChoice(
    for choice: ClarificationChoice,
    rememberSelection: Bool
  ) -> ResolveAmbiguityCommandPayload.RememberChoice {
    guard rememberSelection else {
      return .doNotRemember
    }

    if choice.semantics == .task, choice.taskId != nil {
      return .rememberAsTask
    }

    return .rememberAsWorkGroup
  }
}

@MainActor
final class RuntimeEventCoordinator: NSObject, ObservableObject {
  @Published private(set) var dashboardOpenRequestID = UUID()

  private let notificationCenter: UNUserNotificationCenter
  private let clarificationHUDController = ClarificationHUDController()
  private var actionContextsByCompositeIdentifier: [String: NotificationActionContext] = [:]
  private var dedupedNotificationKeys: Set<String> = []
  private var registeredCategories: [String: UNNotificationCategory] = [:]
  private var didStart = false
  private var lastReportedPermission: NotificationPermissionStatus?
  private var lastRuntimeSessionId: String?
  private weak var bridgeClient: BridgeClient?

  init(notificationCenter: UNUserNotificationCenter = .current()) {
    self.notificationCenter = notificationCenter
    super.init()
  }

  func configure(bridgeClient: BridgeClient) {
    self.bridgeClient = bridgeClient
  }

  func start() async {
    guard didStart == false else {
      return
    }

    didStart = true
    notificationCenter.delegate = self
    await refreshNotificationPermission(requestIfNeeded: true)
  }

  func refreshNotificationPermission(requestIfNeeded: Bool = false) async {
    let settings = await notificationCenter.notificationSettings()
    var status = RuntimeEventPresenter.notificationPermissionStatus(
      for: settings.authorizationStatus
    )

    if settings.authorizationStatus == .notDetermined, requestIfNeeded {
      let granted =
        (try? await notificationCenter.requestAuthorization(options: [.alert, .sound, .badge]))
        ?? false
      status = granted ? .granted : .denied
    }

    guard lastReportedPermission != status else {
      return
    }

    lastReportedPermission = status

    guard let bridgeClient else {
      return
    }

    _ = try? await bridgeClient.dispatchCommand(
      ReportNotificationPermissionCommandPayload(osPermission: status)
    )
  }

  func handle(systemState: SystemState?) {
    guard let systemState else {
      dedupedNotificationKeys.removeAll()
      actionContextsByCompositeIdentifier.removeAll()
      clarificationHUDController.dismiss()
      return
    }

    if lastRuntimeSessionId != systemState.runtimeSessionId {
      lastRuntimeSessionId = systemState.runtimeSessionId
      dedupedNotificationKeys.removeAll()
      actionContextsByCompositeIdentifier.removeAll()
      clarificationHUDController.dismiss()
    }

    if RuntimeEventPresenter.shouldDeliverNotification(for: systemState) {
      scheduleNotification(for: systemState)
    }

    clarificationHUDController.update(
      clarification: systemState.clarificationHud,
      bridgeClient: bridgeClient
    )
  }

  func requestDashboardOpen() {
    dashboardOpenRequestID = UUID()
  }

  private func scheduleNotification(for systemState: SystemState) {
    guard let intervention = systemState.intervention else {
      return
    }

    guard dedupedNotificationKeys.contains(intervention.dedupeKey) == false else {
      return
    }

    let actionContexts = RuntimeEventPresenter.actionContexts(for: intervention)
    let categoryIdentifier = "intervention.\(intervention.interventionId)"
    let actions = actionContexts.map { context in
      UNNotificationAction(
        identifier: context.compositeIdentifier,
        title: title(for: context, in: intervention),
        options: options(for: context.semanticAction)
      )
    }

    let category = UNNotificationCategory(
      identifier: categoryIdentifier,
      actions: actions,
      intentIdentifiers: [],
      options: []
    )
    register(category: category)

    let content = UNMutableNotificationContent()
    content.title = intervention.title
    content.body = intervention.body
    content.sound = .default
    content.categoryIdentifier = categoryIdentifier
    content.userInfo = [
      "intervention_id": intervention.interventionId,
      "dedupe_key": intervention.dedupeKey,
    ]

    let request = UNNotificationRequest(
      identifier: intervention.dedupeKey,
      content: content,
      trigger: nil
    )

    for context in actionContexts {
      actionContextsByCompositeIdentifier[context.compositeIdentifier] = context
    }

    notificationCenter.add(request)
    dedupedNotificationKeys.insert(intervention.dedupeKey)
  }

  private func register(category: UNNotificationCategory) {
    registeredCategories[category.identifier] = category
    notificationCenter.setNotificationCategories(Set(registeredCategories.values))
  }

  private func title(
    for context: NotificationActionContext,
    in intervention: InterventionViewModel
  ) -> String {
    intervention.actions.first(where: { $0.actionId == context.actionId })?.label ?? "Respond"
  }

  private func options(
    for semanticAction: InterventionSemanticAction
  ) -> UNNotificationActionOptions {
    switch semanticAction {
    case .openDashboard:
      return [.foreground]
    case .returnNow, .intentionalDetour, .pause10Minutes, .dismiss:
      return []
    }
  }

  private func handleNotificationAction(_ context: NotificationActionContext) {
    switch context.semanticAction {
    case .returnNow, .intentionalDetour, .openDashboard:
      requestDashboardOpen()
      NSApp.activate(ignoringOtherApps: true)
    case .pause10Minutes, .dismiss:
      break
    }

    guard let bridgeClient else {
      return
    }

    Task {
      _ = try? await bridgeClient.dispatchCommand(
        NotificationActionCommandPayload(
          interventionId: context.interventionId,
          actionId: context.actionId
        )
      )
    }
  }
}

extension RuntimeEventCoordinator: UNUserNotificationCenterDelegate {
  nonisolated func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification
  ) async -> UNNotificationPresentationOptions {
    [.banner, .sound, .list]
  }

  nonisolated func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse
  ) async {
    let actionIdentifier = response.actionIdentifier

    await MainActor.run {
      guard
        let context = actionContextsByCompositeIdentifier[actionIdentifier]
      else {
        return
      }

      handleNotificationAction(context)
    }
  }
}

@MainActor
final class ClarificationHUDController {
  private var panel: NSPanel?
  private var expirationTask: Task<Void, Never>?
  private var currentClarificationId: String?

  func update(
    clarification: ClarificationHudViewModel?,
    bridgeClient: BridgeClient?
  ) {
    guard let clarification, let bridgeClient else {
      dismiss()
      return
    }

    if currentClarificationId != clarification.clarificationId {
      expirationTask?.cancel()
    }

    currentClarificationId = clarification.clarificationId
    let panel = panel ?? makePanel()
    self.panel = panel

    let rootView = ClarificationHUDView(
      clarification: clarification,
      bridgeClient: bridgeClient
    )

    if let hostingView = panel.contentView as? NSHostingView<ClarificationHUDView> {
      hostingView.rootView = rootView
    } else {
      panel.contentView = NSHostingView(rootView: rootView)
    }

    position(panel)
    panel.orderFrontRegardless()
    panel.makeKey()
    scheduleDismissalIfNeeded(expiresAt: clarification.expiresAt)
  }

  func dismiss() {
    expirationTask?.cancel()
    expirationTask = nil
    currentClarificationId = nil
    panel?.orderOut(nil)
  }

  private func makePanel() -> NSPanel {
    let panel = NSPanel(
      contentRect: NSRect(x: 0, y: 0, width: 420, height: 260),
      styleMask: [.titled, .fullSizeContentView, .utilityWindow],
      backing: .buffered,
      defer: false
    )
    panel.isFloatingPanel = true
    panel.level = .statusBar
    panel.titleVisibility = .hidden
    panel.titlebarAppearsTransparent = true
    panel.standardWindowButton(.closeButton)?.isHidden = true
    panel.standardWindowButton(.miniaturizeButton)?.isHidden = true
    panel.standardWindowButton(.zoomButton)?.isHidden = true
    panel.collectionBehavior = [.canJoinAllSpaces, .transient, .moveToActiveSpace]
    panel.isMovableByWindowBackground = true
    panel.hidesOnDeactivate = false
    return panel
  }

  private func position(_ panel: NSPanel) {
    guard let screenFrame = NSScreen.main?.visibleFrame else {
      return
    }

    let origin = NSPoint(
      x: screenFrame.maxX - panel.frame.width - 24,
      y: screenFrame.maxY - panel.frame.height - 24
    )
    panel.setFrameOrigin(origin)
  }

  private func scheduleDismissalIfNeeded(expiresAt: String?) {
    expirationTask?.cancel()

    guard
      let expiresAt,
      let expirationDate = ISO8601DateFormatter().date(from: expiresAt)
    else {
      return
    }

    let delay = expirationDate.timeIntervalSinceNow
    guard delay > 0 else {
      dismiss()
      return
    }

    expirationTask = Task {
      try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
      guard Task.isCancelled == false else {
        return
      }

      dismiss()
    }
  }
}

private struct ClarificationHUDView: View {
  let clarification: ClarificationHudViewModel
  let bridgeClient: BridgeClient

  @State private var rememberChoice = false

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text(clarification.prompt)
        .font(.headline)
        .accessibilityLabel("Clarification prompt")

      if let subtitle = clarification.subtitle {
        Text(subtitle)
          .font(.subheadline)
          .foregroundStyle(.secondary)
      }

      if clarification.allowRememberToggle {
        Toggle("Remember this choice", isOn: $rememberChoice)
          .toggleStyle(.switch)
      }

      ForEach(Array(clarification.choices.enumerated()), id: \.offset) { index, choice in
        Button(choice.label) {
          resolve(choice)
        }
        .keyboardShortcut(keyEquivalent(for: index))
        .accessibilityLabel(choice.label)
      }
    }
    .padding(16)
    .frame(width: 420)
    .onAppear {
      rememberChoice = clarification.rememberToggleDefault
    }
  }

  private func resolve(_ choice: ClarificationChoice) {
    let rememberSelection =
      clarification.allowRememberToggle
      ? rememberChoice
      : clarification.rememberToggleDefault

    Task {
      _ = try? await bridgeClient.dispatchCommand(
        ResolveAmbiguityCommandPayload(
          clarificationId: clarification.clarificationId,
          answerId: choice.answerId,
          rememberChoice: RuntimeEventPresenter.rememberChoice(
            for: choice,
            rememberSelection: rememberSelection
          ),
          userNote: nil
        )
      )
    }
  }

  private func keyEquivalent(for index: Int) -> KeyEquivalent {
    guard let scalar = UnicodeScalar("\(min(index + 1, 9))") else {
      return .return
    }

    return KeyEquivalent(Character(scalar))
  }
}
