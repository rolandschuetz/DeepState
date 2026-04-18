import { randomUUID } from "node:crypto";

import type { SystemState } from "@ineedabossagent/shared-contracts";

import type { AggregatedContextWindow } from "../context/context-aggregator.js";

export type ClarificationHudModel = NonNullable<SystemState["clarification_hud"]>;

export type EvidenceSnapshot = {
  activeApps: string[];
  keywords: string[];
  urls: string[];
  windowTitles: string[];
};

export const evidenceSnapshotFromWindow = (
  window: AggregatedContextWindow,
): EvidenceSnapshot => ({
  activeApps: window.summary.activeApps.slice(0, 4),
  keywords: window.summary.keywords.slice(0, 8),
  urls: window.summary.urls.slice(0, 4),
  windowTitles: window.summary.windowTitles.slice(0, 4),
});

export const buildClarificationHud = ({
  nowIso,
  relatedEpisodeId,
  subtitle,
  tasks,
}: {
  nowIso: string;
  relatedEpisodeId: string | null;
  subtitle: string | null;
  tasks: { taskId: string; title: string }[];
}): ClarificationHudModel => {
  const clarificationId = randomUUID();

  const taskChoices = tasks.map((task) => ({
    answer_id: randomUUID(),
    label: task.title,
    semantics: "task" as const,
    task_id: task.taskId,
    work_group_id: null as string | null,
  }));

  const staticChoices = [
    {
      answer_id: randomUUID(),
      label: "Support work",
      semantics: "support_work" as const,
      task_id: null as string | null,
      work_group_id: null as string | null,
    },
    {
      answer_id: randomUUID(),
      label: "Admin",
      semantics: "admin" as const,
      task_id: null,
      work_group_id: null,
    },
    {
      answer_id: randomUUID(),
      label: "Break",
      semantics: "break" as const,
      task_id: null,
      work_group_id: null,
    },
    {
      answer_id: randomUUID(),
      label: "Not related",
      semantics: "not_related" as const,
      task_id: null,
      work_group_id: null,
    },
  ];

  return {
    allow_remember_toggle: true,
    choices: [...taskChoices, ...staticChoices],
    clarification_id: clarificationId,
    created_at: nowIso,
    expires_at: null,
    prompt: "Does the current work belong to one of today’s tasks?",
    related_episode_id: relatedEpisodeId,
    remember_toggle_default: false,
    subtitle,
  };
};
