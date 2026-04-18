import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadRuntimeConfig } from "../src/config/runtime-config.js";
import { createLogicRuntime } from "../src/runtime/logic-runtime.js";

const screenpipeHealthJson = { status: "ok" };
const morningPlanJson = JSON.stringify({
  exchange_type: "morning_plan",
  local_date: "2026-04-18",
  notes_for_tracker: "Protect the deep work block.",
  schema_version: "1.0.0",
  tasks: [
    {
      allowed_support_work: ["Design QA"],
      intended_work_seconds_today: 7_200,
      likely_detours_that_still_count: ["Stakeholder review"],
      progress_kind: "milestone_based",
      success_definition: "Ready for implementation handoff.",
      title: "Finish checkout redesign",
      total_remaining_effort_seconds: 7_200,
    },
  ],
  total_intended_work_seconds: 7_200,
});

const createMockFetch = (): typeof fetch => {
  const impl = (input: string | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input.href;

    if (url.includes("/health")) {
      return Promise.resolve(
        new Response(JSON.stringify(screenpipeHealthJson), { status: 200 }),
      );
    }

    if (url.includes("/elements")) {
      return Promise.resolve(
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
      );
    }

    if (url.includes("/search")) {
      return Promise.resolve(
        new Response(JSON.stringify({
          data: [
            {
              app_name: "Cursor",
              id: "event_1",
              timestamp: "2026-04-18T10:00:00Z",
              window_title: "logic-runtime.ts - repo",
            },
          ],
        }), { status: 200 }),
      );
    }

    if (url.includes("/frames/")) {
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    }

    return Promise.resolve(new Response("not found", { status: 404 }));
  };

  return vi.fn(impl) as typeof fetch;
};

const createLinkedInDriftFetch = (): typeof fetch => {
  const impl = (input: string | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input.href;

    if (url.includes("/health")) {
      return Promise.resolve(
        new Response(JSON.stringify(screenpipeHealthJson), { status: 200 }),
      );
    }

    if (url.includes("/elements")) {
      return Promise.resolve(
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
      );
    }

    if (url.includes("/search")) {
      return Promise.resolve(
        new Response(JSON.stringify({
          data: [
            {
              app_name: "Google Chrome",
              id: "event_linkedin_1",
              page_url: "https://www.linkedin.com/feed/",
              timestamp: "2026-04-18T10:00:00Z",
              window_title: "Feed | LinkedIn",
            },
          ],
        }), { status: 200 }),
      );
    }

    if (url.includes("/frames/")) {
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    }

    return Promise.resolve(new Response("not found", { status: 404 }));
  };

  return vi.fn(impl) as typeof fetch;
};

const createScreenpipeAuthFailureFetch = (): typeof fetch => {
  const impl = (input: string | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input.href;

    if (url.includes("/health")) {
      return Promise.resolve(
        new Response(JSON.stringify(screenpipeHealthJson), { status: 200 }),
      );
    }

    if (url.includes("/elements")) {
      return Promise.resolve(
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
      );
    }

    if (url.includes("/search")) {
      return Promise.resolve(
        new Response(JSON.stringify({
          error:
            "unauthorized: API access requires authentication. Pass Authorization: Bearer <your-api-key>",
        }), { status: 403 }),
      );
    }

    if (url.includes("/frames/")) {
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    }

    return Promise.resolve(new Response("not found", { status: 404 }));
  };

  return vi.fn(impl) as typeof fetch;
};

describe("createLogicRuntime", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "ineedabossagent-logic-runtime-"));
  });

  afterEach(() => {
    rmSync(tempDir, { force: true, recursive: true });
  });

  it("bootstraps, publishes initial state, and exposes enriched health and diagnostics probes", async () => {
    vi.useFakeTimers();

    const fetchMock = createMockFetch();
    const config = loadRuntimeConfig({
      INEEDABOSSAGENT_DB_PATH: join(tempDir, "logic.sqlite"),
      INEEDABOSSAGENT_FAST_TICK_MS: "15000",
      INEEDABOSSAGENT_SLOW_TICK_MS: "90000",
    });

    const runtime = createLogicRuntime({ config, fetch: fetchMock });
    const { host, port } = await runtime.listen(0, "127.0.0.1");
    runtime.start();

    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    const healthResponse = await fetch(`http://${host}:${port}/health`);
    expect(healthResponse.status).toBe(200);
    const healthBody = (await healthResponse.json()) as Record<string, unknown>;
    expect(healthBody.status).toBe("ok");
    expect(healthBody.screenpipe).toBe("ok");

    const diagnosticsResponse = await fetch(`http://${host}:${port}/diagnostics`);
    expect(diagnosticsResponse.status).toBe(200);
    const diagnosticsBody = (await diagnosticsResponse.json()) as Record<string, unknown>;
    expect(diagnosticsBody.bridge_status).toBe("ok");
    expect(diagnosticsBody.mode).toBeDefined();
    expect(diagnosticsBody.slow_tick_count).toBe(0);

    const state = runtime.getState();
    expect(state.system_health.scheduler.fast_tick_last_ran_at).toBeNull();
    expect(state.system_health.scheduler.slow_tick_last_ran_at).toBeNull();

    const importResponse = await fetch(`http://${host}:${port}/command`, {
      body: JSON.stringify({
        command_id: "b0000000-0000-4000-8000-000000000001",
        kind: "import_coaching_exchange",
        payload: {
          raw_text: morningPlanJson,
          source: "manual_paste",
        },
        schema_version: "1.0.0",
        sent_at: "2026-04-18T09:00:00Z",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(importResponse.status).toBe(202);
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(30_000);
    await Promise.resolve();

    const afterFast = runtime.getState();
    expect(afterFast.system_health.scheduler.fast_tick_last_ran_at).not.toBeNull();

    await vi.advanceTimersByTimeAsync(90_000);
    await Promise.resolve();

    const afterSlow = runtime.getState();
    expect(afterSlow.system_health.scheduler.slow_tick_last_ran_at).not.toBeNull();
    expect(afterSlow.stream_sequence).toBeGreaterThan(state.stream_sequence);

    await runtime.close();
    vi.useRealTimers();
  });

  it("purge_all resets derived scheduler state", async () => {
    vi.useFakeTimers();

    const fetchMock = createMockFetch();
    const config = loadRuntimeConfig({
      INEEDABOSSAGENT_DB_PATH: join(tempDir, "logic.sqlite"),
      INEEDABOSSAGENT_FAST_TICK_MS: "15000",
      INEEDABOSSAGENT_SLOW_TICK_MS: "90000",
    });

    const runtime = createLogicRuntime({ config, fetch: fetchMock });
    const { host, port } = await runtime.listen(0, "127.0.0.1");
    runtime.start();
    await vi.advanceTimersByTimeAsync(0);

    await fetch(`http://${host}:${port}/command`, {
      body: JSON.stringify({
        schema_version: "1.0.0",
        command_id: "a0000000-0000-4000-8000-000000000001",
        sent_at: "2026-04-18T10:00:00Z",
        kind: "purge_all",
        payload: {
          confirm_phrase: "DELETE ALL COACHING DATA",
        },
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const after = runtime.getState();
    expect(after.mode).toBe("no_plan");

    await runtime.close();
    vi.useRealTimers();
  });

  it("reacts on the fast tick when LinkedIn appears during a running plan", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-18T10:01:00Z"));

    const fetchMock = createLinkedInDriftFetch();
    const config = loadRuntimeConfig({
      INEEDABOSSAGENT_DB_PATH: join(tempDir, "logic.sqlite"),
      INEEDABOSSAGENT_FAST_TICK_MS: "15000",
      INEEDABOSSAGENT_SLOW_TICK_MS: "90000",
    });

    const runtime = createLogicRuntime({ config, fetch: fetchMock });
    const { host, port } = await runtime.listen(0, "127.0.0.1");
    runtime.start();

    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    const importResponse = await fetch(`http://${host}:${port}/command`, {
      body: JSON.stringify({
        command_id: "c0000000-0000-4000-8000-000000000001",
        kind: "import_coaching_exchange",
        payload: {
          raw_text: morningPlanJson,
          source: "manual_paste",
        },
        schema_version: "1.0.0",
        sent_at: "2026-04-18T09:00:00Z",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(importResponse.status).toBe(202);
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(30_000);
    await Promise.resolve();

    const state = runtime.getState();
    expect(state.mode).toBe("running");
    expect(state.dashboard.current_focus.runtime_state).toBe("hard_drift");
    expect(state.intervention?.kind).toBe("hard_drift");
    expect(state.dashboard.current_focus.explainability.some((item) =>
      item.code === "known_distraction_linkedin"
    )).toBe(true);

    await runtime.close();
    vi.useRealTimers();
  });

  it("marks Screenpipe degraded when /search requires API authentication", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-18T10:01:00Z"));

    const fetchMock = createScreenpipeAuthFailureFetch();
    const config = loadRuntimeConfig({
      INEEDABOSSAGENT_DB_PATH: join(tempDir, "logic.sqlite"),
      INEEDABOSSAGENT_FAST_TICK_MS: "15000",
      INEEDABOSSAGENT_SLOW_TICK_MS: "90000",
    });

    const runtime = createLogicRuntime({ config, fetch: fetchMock });
    const { host, port } = await runtime.listen(0, "127.0.0.1");
    runtime.start();

    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    const importResponse = await fetch(`http://${host}:${port}/command`, {
      body: JSON.stringify({
        command_id: "d0000000-0000-4000-8000-000000000001",
        kind: "import_coaching_exchange",
        payload: {
          raw_text: morningPlanJson,
          source: "manual_paste",
        },
        schema_version: "1.0.0",
        sent_at: "2026-04-18T09:00:00Z",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(importResponse.status).toBe(202);
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(15_000);
    await Promise.resolve();

    const state = runtime.getState();
    expect(state.mode).toBe("degraded_screenpipe");
    expect(state.system_health.screenpipe.status).toBe("degraded");
    expect(state.system_health.screenpipe.message).toContain(
      "Screenpipe search requires API authentication",
    );

    const diagnosticsResponse = await fetch(`http://${host}:${port}/diagnostics`);
    expect(diagnosticsResponse.status).toBe(200);
    const diagnosticsBody = (await diagnosticsResponse.json()) as {
      last_screenpipe_probe: { message: string; status: string };
    };
    expect(diagnosticsBody.last_screenpipe_probe.status).toBe("degraded");
    expect(diagnosticsBody.last_screenpipe_probe.message).toContain(
      "Screenpipe search requires API authentication",
    );

    await runtime.close();
    vi.useRealTimers();
  });
});
