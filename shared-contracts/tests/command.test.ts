import { describe, expect, it } from "vitest";

import { commandSchema } from "../src/index.js";

describe("commandSchema", () => {
  it("accepts every supported command kind", () => {
    const samples = [
      {
        schema_version: "1.0.0",
        command_id: "c7942526-57a3-4ccb-a4da-2480b496759c",
        sent_at: "2026-04-18T09:00:00Z",
        kind: "pause",
        payload: {
          reason: "user_pause",
          duration_seconds: 600,
          note: "Taking a break",
        },
      },
      {
        schema_version: "1.0.0",
        command_id: "31af6d8b-65ea-48e0-ae22-d4b05e265544",
        sent_at: "2026-04-18T09:01:00Z",
        kind: "resume",
        payload: {
          reason: "user_resume",
        },
      },
      {
        schema_version: "1.0.0",
        command_id: "787c4699-a3d7-4b15-9245-749668115d84",
        sent_at: "2026-04-18T09:02:00Z",
        kind: "update_exclusions",
        payload: {
          operations: [
            {
              op: "upsert",
              entry: {
                exclusion_id: null,
                label: "Banking",
                match_type: "domain",
                pattern: "bank.example.com",
                enabled: true,
              },
            },
            {
              op: "remove",
              exclusion_id: "privacy_1",
            },
          ],
        },
      },
      {
        schema_version: "1.0.0",
        command_id: "15c23639-23fe-4196-8fd9-138ff171564c",
        sent_at: "2026-04-18T09:03:00Z",
        kind: "resolve_ambiguity",
        payload: {
          clarification_id: "clarification_1",
          answer_id: "answer_1",
          remember_choice: "remember_as_task",
          user_note: null,
        },
      },
      {
        schema_version: "1.0.0",
        command_id: "9c9caef2-3f9a-4e00-ab1c-c4d6fbc4b2ae",
        sent_at: "2026-04-18T09:04:00Z",
        kind: "import_coaching_exchange",
        payload: {
          source: "manual_paste",
          raw_text: "{\"schema_version\":\"1.0.0\"}",
        },
      },
      {
        schema_version: "1.0.0",
        command_id: "cb8d609e-c4dc-4cfd-ac4f-67dc1212c84d",
        sent_at: "2026-04-18T09:05:00Z",
        kind: "notification_action",
        payload: {
          intervention_id: "intervention_1",
          action_id: "action_1",
        },
      },
      {
        schema_version: "1.0.0",
        command_id: "40c69955-71bd-4a45-a608-a6f8d8ce9686",
        sent_at: "2026-04-18T09:06:00Z",
        kind: "report_notification_permission",
        payload: {
          os_permission: "granted",
        },
      },
      {
        schema_version: "1.0.0",
        command_id: "7626a4cb-1d01-4746-bf14-dca5a2a13266",
        sent_at: "2026-04-18T09:06:30Z",
        kind: "request_morning_flow",
        payload: {
          local_date: "2026-04-18",
          opened_at: "2026-04-18T09:06:30",
          reason: "first_notebook_open_after_4am",
        },
      },
      {
        schema_version: "1.0.0",
        command_id: "98f78315-56d4-4bb6-8b1d-40190f48d7b4",
        sent_at: "2026-04-18T09:07:00Z",
        kind: "purge_all",
        payload: {
          confirm_phrase: "DELETE ALL COACHING DATA",
        },
      },
    ];

    for (const sample of samples) {
      expect(commandSchema.parse(sample)).toEqual(sample);
    }
  });

  it("rejects the wrong purge confirmation phrase", () => {
    expect(() =>
      commandSchema.parse({
        schema_version: "1.0.0",
        command_id: "98f78315-56d4-4bb6-8b1d-40190f48d7b4",
        sent_at: "2026-04-18T09:07:00Z",
        kind: "purge_all",
        payload: {
          confirm_phrase: "delete all coaching data",
        },
      }),
    ).toThrow(/DELETE ALL COACHING DATA/);
  });

  it("rejects empty import payload text", () => {
    expect(() =>
      commandSchema.parse({
        schema_version: "1.0.0",
        command_id: "9c9caef2-3f9a-4e00-ab1c-c4d6fbc4b2ae",
        sent_at: "2026-04-18T09:04:00Z",
        kind: "import_coaching_exchange",
        payload: {
          source: "manual_paste",
          raw_text: "",
        },
      }),
    ).toThrow();
  });

  it("rejects invalid morning-flow local timestamps", () => {
    expect(() =>
      commandSchema.parse({
        schema_version: "1.0.0",
        command_id: "7626a4cb-1d01-4746-bf14-dca5a2a13266",
        sent_at: "2026-04-18T09:06:30Z",
        kind: "request_morning_flow",
        payload: {
          local_date: "2026-04-18",
          opened_at: "2026-04-18T09:06:30Z",
          reason: "first_notebook_open_after_4am",
        },
      }),
    ).toThrow();
  });
});
