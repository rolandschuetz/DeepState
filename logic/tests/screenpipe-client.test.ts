import { describe, expect, it, vi } from "vitest";

import {
  applyScreenpipeHealthToSystemState,
  createDefaultSystemState,
  createScreenpipeClient,
} from "../src/index.js";

describe("createScreenpipeClient", () => {
  it("probes /health and returns an ok status for healthy responses", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ status: "ok" }), {
        headers: {
          "content-type": "application/json",
        },
        status: 200,
      }))
    );
    const client = createScreenpipeClient({
      baseUrl: "http://127.0.0.1:3030/",
      fetch: fetchImpl,
      healthTimeoutMs: 5_000,
    });

    const probe = await client.probeHealth("2026-04-18T10:00:00Z");

    expect(fetchImpl).toHaveBeenCalledOnce();

    const firstCall = fetchImpl.mock.calls[0];
    expect(firstCall).toBeDefined();
    expect(firstCall?.[0]).toBe("http://127.0.0.1:3030/health");
    expect(firstCall?.[1]?.method).toBe("GET");
    expect(firstCall?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(probe).toEqual({
      checkedAt: "2026-04-18T10:00:00Z",
      details: { status: "ok" },
      httpStatus: 200,
      lastErrorAt: null,
      lastOkAt: "2026-04-18T10:00:00Z",
      message: "Screenpipe health probe succeeded.",
      status: "ok",
      url: "http://127.0.0.1:3030/health",
    });
  });

  it("returns down when the health request fails", async () => {
    const client = createScreenpipeClient({
      baseUrl: "http://127.0.0.1:3030",
      fetch: vi.fn<typeof fetch>(() =>
        Promise.reject(new Error("connect ECONNREFUSED"))
      ),
      healthTimeoutMs: 5_000,
    });

    const probe = await client.probeHealth("2026-04-18T10:00:00Z");

    expect(probe).toEqual({
      checkedAt: "2026-04-18T10:00:00Z",
      details: { error: "connect ECONNREFUSED" },
      httpStatus: null,
      lastErrorAt: "2026-04-18T10:00:00Z",
      lastOkAt: null,
      message: "Screenpipe health probe failed.",
      status: "down",
      url: "http://127.0.0.1:3030/health",
    });
  });
});

describe("applyScreenpipeHealthToSystemState", () => {
  it("switches the runtime into degraded_screenpipe when Screenpipe is unavailable", () => {
    const degradedState = applyScreenpipeHealthToSystemState(createDefaultSystemState(), {
      checkedAt: "2026-04-18T10:00:00Z",
      details: { error: "connect ECONNREFUSED" },
      httpStatus: null,
      lastErrorAt: "2026-04-18T10:00:00Z",
      lastOkAt: null,
      message: "Screenpipe health probe failed.",
      status: "down",
      url: "http://127.0.0.1:3030/health",
    });

    expect(degradedState.mode).toBe("degraded_screenpipe");
    expect(degradedState.dashboard.header.mode).toBe("degraded_screenpipe");
    expect(degradedState.dashboard.header.warning_banner).toEqual({
      body: "Screenpipe health probe failed.",
      severity: "critical",
      title: "Screenpipe degraded",
    });
    expect(degradedState.system_health.overall_status).toBe("degraded");
    expect(degradedState.system_health.screenpipe.status).toBe("down");
    expect(degradedState.menu_bar.mode_label).toBe("Degraded");
  });
});
