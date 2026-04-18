import XCTest

final class DashboardWindowViewTests: XCTestCase {
  func testBuildsTaskProgressContentWithPercentEtaAndRisk() {
    let content = DashboardPresenter.taskProgressContent(
      [
        TaskProgressCard(
          taskId: "task-1",
          title: "Ship checkout",
          progressRatio: 0.45,
          confidenceRatio: 0.88,
          riskLevel: .medium,
          alignedSeconds: 4800,
          supportSeconds: 900,
          driftSeconds: 300,
          etaRemainingSeconds: 5400,
          latestStatusText: "Validation states still pending."
        )
      ]
    )

    XCTAssertEqual(content.count, 1)
    XCTAssertEqual(content.first?.progressText, "45%")
    XCTAssertEqual(content.first?.etaText, "ETA remaining: 1h 30m")
    XCTAssertEqual(content.first?.confidenceText, "Confidence: 88%")
    XCTAssertEqual(content.first?.riskText, "Risk: Medium")
    XCTAssertEqual(content.first?.alignedText, "Aligned 1h 20m")
  }

  func testRecentEventsOrdersEpisodesAndCorrectionsByNewestTimestamp() {
    let items = DashboardPresenter.recentEvents(
      episodes: [
        EpisodeSummary(
          episodeId: "episode-1",
          startedAt: "2026-04-18T08:35:00Z",
          endedAt: "2026-04-18T08:40:00Z",
          runtimeState: .aligned,
          matchedTaskId: "task-1",
          matchedTaskTitle: "Checkout redesign",
          isSupportWork: false,
          confidenceRatio: 0.89,
          topEvidence: ["Figma active", "Low app switching"]
        )
      ],
      corrections: [
        CorrectionSummary(
          correctionId: "correction-1",
          createdAt: "2026-04-18T08:45:00Z",
          kind: .clarification,
          summaryText: "Classified docs as valid support work."
        )
      ]
    )

    XCTAssertEqual(items.map(\.id), ["correction-1", "episode-1"])
    XCTAssertEqual(items.first?.title, "Clarification")
  }

  func testExplainabilityContentPreservesIncomingOrder() {
    let content = DashboardPresenter.explainabilityContent(
      [
        ExplainabilityItem(
          code: "first_signal",
          detail: "Primary evidence arrived first.",
          weight: 0.9
        ),
        ExplainabilityItem(
          code: "second_signal",
          detail: "Secondary evidence arrived second.",
          weight: 0.25
        ),
      ]
    )

    XCTAssertEqual(content.map(\.code), ["first_signal", "second_signal"])
    XCTAssertEqual(content.map(\.weightText), ["0.90", "0.25"])
  }

  func testUsesFixturePurgeConfirmPhrase() {
    XCTAssertEqual(DashboardPresenter.purgeConfirmPhrase, "DELETE ALL COACHING DATA")
  }
}
