import Foundation

enum BridgeJSONCoding {
  static let decoder: JSONDecoder = {
    let decoder = JSONDecoder()
    decoder.keyDecodingStrategy = .convertFromSnakeCase
    return decoder
  }()

  static let encoder: JSONEncoder = {
    let encoder = JSONEncoder()
    encoder.keyEncodingStrategy = .convertToSnakeCase
    encoder.outputFormatting = [.sortedKeys]
    return encoder
  }()
}

typealias SchemaVersion = String

enum Mode: String, Codable, Equatable {
  case booting
  case noPlan = "no_plan"
  case running
  case paused
  case degradedScreenpipe = "degraded_screenpipe"
  case logicError = "logic_error"
}

enum RuntimeState: String, Codable, Equatable {
  case aligned
  case uncertain
  case softDrift = "soft_drift"
  case hardDrift = "hard_drift"
  case paused
}

enum Severity: String, Codable, Equatable {
  case info
  case warning
  case critical
}

enum ColorToken: String, Codable, Equatable {
  case green
  case blue
  case yellow
  case red
  case gray
}

enum RiskLevel: String, Codable, Equatable {
  case low
  case medium
  case high
}

enum ProgressKind: String, Codable, Equatable {
  case timeBased = "time_based"
  case milestoneBased = "milestone_based"
  case artifactBased = "artifact_based"
  case hybrid
}

enum CorrectionKind: String, Codable, Equatable {
  case clarification
  case manualOverride = "manual_override"
  case notificationAction = "notification_action"
}

enum AmbiguityStatus: String, Codable, Equatable {
  case pending
  case resolved
  case dismissed
}

enum MorningExchangeStatus: String, Codable, Equatable {
  case requiredStatus = "required"
  case available
  case completed
}

enum EveningExchangeStatus: String, Codable, Equatable {
  case notReady = "not_ready"
  case available
  case completed
}

enum PrivacyMatchType: String, Codable, Equatable {
  case app
  case domain
  case urlRegex = "url_regex"
  case windowTitleRegex = "window_title_regex"
}

enum ClarificationChoiceSemantic: String, Codable, Equatable {
  case task
  case supportWork = "support_work"
  case workGroup = "work_group"
  case admin
  case `break`
  case intentionalDetour = "intentional_detour"
  case notRelated = "not_related"
}

enum InterventionKind: String, Codable, Equatable {
  case hardDrift = "hard_drift"
  case praise
  case recoveryAnchor = "recovery_anchor"
  case riskPrompt = "risk_prompt"
  case clarificationNotification = "clarification_notification"
}

enum InterventionPresentation: String, Codable, Equatable {
  case dashboardOnly = "dashboard_only"
  case localNotification = "local_notification"
  case both
}

enum InterventionSemanticAction: String, Codable, Equatable {
  case returnNow = "return_now"
  case intentionalDetour = "intentional_detour"
  case pause10Minutes = "pause_10_minutes"
  case openDashboard = "open_dashboard"
  case dismiss
}

enum InterventionSuppressionReason: String, Codable, Equatable {
  case observeOnly = "observe_only"
  case cooldown
  case paused
  case permissionsMissing = "permissions_missing"
  case modeGate = "mode_gate"
}

enum HealthStatus: String, Codable, Equatable {
  case ok
  case degraded
  case down
}

enum NotificationPermissionStatus: String, Codable, Equatable {
  case unknown
  case granted
  case denied
}

enum NotificationMuteReason: String, Codable, Equatable {
  case observeOnly = "observe_only"
  case cooldown
  case paused
  case modeGate = "mode_gate"
}

struct SystemState: Codable, Equatable {
  let schemaVersion: SchemaVersion
  let runtimeSessionId: String
  let streamSequence: Int
  let emittedAt: String
  let causedByCommandId: String?
  let mode: Mode
  let menuBar: MenuBarViewModel
  let dashboard: DashboardViewModel
  let clarificationHud: ClarificationHudViewModel?
  let intervention: InterventionViewModel?
  let systemHealth: SystemHealthViewModel
}

struct MenuBarViewModel: Codable, Equatable {
  let colorToken: ColorToken
  let modeLabel: String
  let primaryLabel: String
  let secondaryLabel: String?
  let runtimeState: RuntimeState
  let isSupportWork: Bool
  let confidenceRatio: Double?
  let activeGoalId: String?
  let activeGoalTitle: String?
  let activeTaskId: String?
  let activeTaskTitle: String?
  let stateStartedAt: String?
  let focusedElapsedSeconds: Int?
  let pauseUntil: String?
  let allowedActions: AllowedActionsViewModel
}

struct AllowedActionsViewModel: Codable, Equatable {
  let canPause: Bool
  let canResume: Bool
  let canTakeBreak: Bool
  let canOpenMorningFlow: Bool
  let canOpenEveningFlow: Bool
}

struct DashboardViewModel: Codable, Equatable {
  let header: DashboardHeaderViewModel
  let plan: DailyPlanViewModel?
  let currentFocus: CurrentFocusViewModel
  let progress: ProgressSummaryViewModel
  let recentEpisodes: [EpisodeSummary]
  let corrections: [CorrectionSummary]
  let ambiguityQueue: [AmbiguityQueueItem]
  let reviewQueue: [DurableRuleReviewItem]
  let morningExchange: MorningExchangeViewModel?
  let eveningExchange: EveningExchangeViewModel?
  let privacyExclusions: PrivacyExclusionsViewModel
}

struct DashboardHeaderViewModel: Codable, Equatable {
  let localDate: String
  let mode: Mode
  let summaryText: String
  let warningBanner: BannerViewModel?
}

struct BannerViewModel: Codable, Equatable {
  let severity: Severity
  let title: String
  let body: String
}

struct DailyPlanViewModel: Codable, Equatable {
  let planId: String
  let importedAt: String
  let localDate: String
  let totalIntendedWorkSeconds: Int
  let notesForTracker: String?
  let tasks: [PlannedTaskViewModel]
}

struct PlannedTaskViewModel: Codable, Equatable {
  let taskId: String
  let title: String
  let successDefinition: String
  let totalRemainingEffortSeconds: Int?
  let intendedWorkSecondsToday: Int
  let progressKind: ProgressKind
  let allowedSupportWork: [String]
  let likelyDetoursThatStillCount: [String]
}

struct CurrentFocusViewModel: Codable, Equatable {
  let runtimeState: RuntimeState
  let isSupportWork: Bool
  let confidenceRatio: Double?
  let explainability: [ExplainabilityItem]
  let lastGoodContext: String?
  let lastUpdatedAt: String
}

struct ExplainabilityItem: Codable, Equatable {
  let code: String
  let detail: String
  let weight: Double
}

struct ProgressSummaryViewModel: Codable, Equatable {
  let totalIntendedWorkSeconds: Int?
  let totalAlignedSeconds: Int
  let totalSupportSeconds: Int
  let totalDriftSeconds: Int
  let tasks: [TaskProgressCard]
}

struct TaskProgressCard: Codable, Equatable {
  let taskId: String
  let title: String
  let progressRatio: Double?
  let confidenceRatio: Double?
  let riskLevel: RiskLevel?
  let alignedSeconds: Int
  let supportSeconds: Int
  let driftSeconds: Int
  let etaRemainingSeconds: Int?
  let latestStatusText: String
}

struct EpisodeSummary: Codable, Equatable {
  let episodeId: String
  let startedAt: String
  let endedAt: String
  let runtimeState: RuntimeState
  let matchedTaskId: String?
  let matchedTaskTitle: String?
  let isSupportWork: Bool
  let confidenceRatio: Double?
  let topEvidence: [String]
}

struct CorrectionSummary: Codable, Equatable {
  let correctionId: String
  let createdAt: String
  let kind: CorrectionKind
  let summaryText: String
}

struct AmbiguityQueueItem: Codable, Equatable {
  let ambiguityId: String
  let createdAt: String
  let prompt: String
  let status: AmbiguityStatus
  let resolutionSummary: String?
}

struct DurableRuleReviewItem: Codable, Equatable {
  let reviewItemId: String
  let createdAt: String
  let title: String
  let rationale: String
  let proposedRuleText: String
}

struct MorningExchangeViewModel: Codable, Equatable {
  let status: MorningExchangeStatus
  let contextPacketText: String?
  let promptText: String?
}

struct EveningExchangeViewModel: Codable, Equatable {
  let status: EveningExchangeStatus
  let debriefPacketText: String?
  let promptText: String?
}

struct PrivacyExclusionsViewModel: Codable, Equatable {
  let exclusions: [PrivacyExclusionEntry]
}

struct PrivacyExclusionEntry: Codable, Equatable {
  let exclusionId: String?
  let label: String
  let matchType: PrivacyMatchType
  let pattern: String
  let enabled: Bool
}

struct ClarificationHudViewModel: Codable, Equatable {
  let clarificationId: String
  let createdAt: String
  let expiresAt: String?
  let prompt: String
  let subtitle: String?
  let choices: [ClarificationChoice]
  let relatedEpisodeId: String?
  let rememberToggleDefault: Bool
  let allowRememberToggle: Bool
}

struct ClarificationChoice: Codable, Equatable {
  let answerId: String
  let label: String
  let semantics: ClarificationChoiceSemantic
  let taskId: String?
  let workGroupId: String?
}

struct InterventionViewModel: Codable, Equatable {
  let interventionId: String
  let createdAt: String
  let kind: InterventionKind
  let presentation: InterventionPresentation
  let severity: Severity
  let title: String
  let body: String
  let actions: [InterventionAction]
  let suppressNativeNotification: Bool
  let suppressionReason: InterventionSuppressionReason?
  let dedupeKey: String
  let expiresAt: String?
}

struct InterventionAction: Codable, Equatable {
  let actionId: String
  let label: String
  let semanticAction: InterventionSemanticAction
}

struct SystemHealthViewModel: Codable, Equatable {
  let overallStatus: HealthStatus
  let screenpipe: SystemComponentHealth
  let database: SystemComponentHealth
  let scheduler: SchedulerHealth
  let notifications: NotificationHealth
  let observeOnly: ObserveOnlyHealth
}

struct SystemComponentHealth: Codable, Equatable {
  let status: HealthStatus
  let lastOkAt: String?
  let lastErrorAt: String?
  let message: String?
}

struct SchedulerHealth: Codable, Equatable {
  let fastTickLastRanAt: String?
  let slowTickLastRanAt: String?
}

struct NotificationHealth: Codable, Equatable {
  let osPermission: NotificationPermissionStatus
  let mutedByLogic: Bool
  let mutedReason: NotificationMuteReason?
}

struct ObserveOnlyHealth: Codable, Equatable {
  let active: Bool
  let ticksRemaining: Int?
}
