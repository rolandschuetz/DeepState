import { describe, expect, it, vi } from "vitest";

import {
  createDiagnosticsLogSink,
  applyScreenpipeHealthToSystemState,
  createDefaultSystemState,
  createModuleLogger,
  createScreenpipeClient,
  DiagnosticsLogStore,
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
    expect(firstCall?.[1]?.headers).toEqual({});
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

  it("sends the configured bearer token to Screenpipe endpoints", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ status: "ok" }), {
        headers: {
          "content-type": "application/json",
        },
        status: 200,
      }))
    );
    const client = createScreenpipeClient({
      authToken: "sp-test-key",
      baseUrl: "http://127.0.0.1:3030/",
      fetch: fetchImpl,
      healthTimeoutMs: 5_000,
    });

    await client.probeHealth("2026-04-18T10:00:00Z");

    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toEqual({
      Authorization: "Bearer sp-test-key",
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

  it("detects startup capabilities and records them in diagnostics", async () => {
    const fetchImpl = vi.fn<typeof fetch>((input) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (url.endsWith("/health")) {
        return Promise.resolve(new Response(JSON.stringify({
          status: "ok",
          version: "0.5.0",
        }), {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        }));
      }

      if (url.endsWith("/elements?limit=1")) {
        return Promise.resolve(new Response(JSON.stringify({
          data: [{ id: "element_1" }],
        }), {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        }));
      }

      if (url.endsWith("/search?limit=1")) {
        return Promise.resolve(new Response(JSON.stringify({
          data: [{
            audio_transcript: "Weekly sync transcript",
            frame_id: 44,
          }],
        }), {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        }));
      }

      if (url.endsWith("/frames/44/context")) {
        return Promise.resolve(new Response(JSON.stringify({
          frame_id: 44,
          context: "Checkout design",
        }), {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        }));
      }

      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    const diagnosticsStore = new DiagnosticsLogStore();
    const diagnosticsLogger = createModuleLogger({
      minLevel: "info",
      module: "screenpipe",
      sink: createDiagnosticsLogSink(diagnosticsStore),
    });
    const client = createScreenpipeClient({
      baseUrl: "http://127.0.0.1:3030",
      fetch: fetchImpl,
      healthTimeoutMs: 5_000,
    });

    const capabilities = await client.detectCapabilities(
      "2026-04-18T10:00:00Z",
      diagnosticsLogger,
    );

    expect(capabilities).toEqual({
      audioTranscriptsAvailable: true,
      checkedAt: "2026-04-18T10:00:00Z",
      elementsEndpointAvailable: true,
      frameContextEndpointAvailable: true,
      sampleFrameId: 44,
      searchEndpointAvailable: true,
      version: "0.5.0",
    });
    expect(diagnosticsStore.list("screenpipe")[0]).toMatchObject({
      level: "info",
      message: "Detected Screenpipe startup capabilities.",
      module: "screenpipe",
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
