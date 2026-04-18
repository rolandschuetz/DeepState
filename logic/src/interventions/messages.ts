/**
 * Central copy for interventions. User-facing strings must originate here (logic layer).
 * Positive reinforcement prefixes: Locked., Check., Reset., Back.
 */

export const messages = {
  hardDrift: {
    body: (taskTitle: string | null): string =>
      taskTitle === null
        ? "You have been away from the planned task for a while. Return when ready."
        : `You have been away from "${taskTitle}" for a while. Return when ready.`,
    title: "Check. Refocus now?",
  },
  milestoneCandidate: {
    body: (taskTitle: string, hint: string): string =>
      `Possible milestone on "${taskTitle}": ${hint}`,
    title: "Locked. Milestone detected?",
  },
  recoveryAnchor: {
    body: (context: string): string => `Back. Continue at [${context}].`,
    title: "Back. Pick up where you left off",
  },
  riskPrompt: {
    body: (detail: string): string => `Reset. ${detail}`,
    title: "Check. Day at risk",
  },
} as const;
