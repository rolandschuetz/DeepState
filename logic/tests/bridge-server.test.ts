import { afterEach, describe, expect, it, vi } from "vitest";

import { systemStateSchema } from "@ineedabossagent/shared-contracts";

import { RetryableCommandError } from "../src/server/command-action-result.js";
import { createBridgeServer, createDefaultSystemState } from "../src/index.js";

const openServers: Array<ReturnType<typeof createBridgeServer>> = [];

afterEach(async () => {
  await Promise.all(openServers.splice(0).map(async (server) => await server.close()));
});

describe("createBridgeServer", () => {
  it("streams the latest SystemState snapshot immediately over SSE", async () => {
    const bridgeServer = createBridgeServer({
      initialState: createDefaultSystemState(),
      heartbeatIntervalMs: 60_000,
    });
    openServers.push(bridgeServer);

    const { host, port } = await bridgeServer.listen();
    const response = await fetch(`http://${host}:${port}/stream`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const reader = response.body?.getReader();
    expect(reader).toBeDefined();

    const firstChunk = await reader?.read();
    const streamedChunk =
      firstChunk?.value instanceof Uint8Array
        ? firstChunk.value
        : new Uint8Array();
    const bodyText = new TextDecoder().decode(streamedChunk);

    expect(bodyText).toContain("event: system_state");

    const dataLine = bodyText
      .split("\n")
      .find((line) => line.startsWith("data: "));

    expect(dataLine).toBeDefined();

    const streamedState = systemStateSchema.parse(
      JSON.parse(dataLine?.slice("data: ".length) ?? "null") as unknown,
    );

    expect(streamedState.mode).toBe("booting");

    await reader?.cancel();
  });

  it("accepts validated commands and forwards them to the handler", async () => {
    const handleCommand = vi.fn();
    const bridgeServer = createBridgeServer({
      handleCommand,
      heartbeatIntervalMs: 60_000,
    });
    openServers.push(bridgeServer);

    const { host, port } = await bridgeServer.listen();
    const response = await fetch(`http://${host}:${port}/command`, {
      body: JSON.stringify({
        schema_version: "1.0.0",
        command_id: "c7942526-57a3-4ccb-a4da-2480b496759c",
        sent_at: "2026-04-18T09:00:00Z",
        kind: "pause",
        payload: {
          reason: "user_pause",
          duration_seconds: 600,
          note: "Taking a break",
        },
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      command_id: "c7942526-57a3-4ccb-a4da-2480b496759c",
      kind: "pause",
      message: "Command accepted.",
      status: "success",
    });
    expect(handleCommand).toHaveBeenCalledOnce();
  });

  it("returns validation_error envelopes for malformed commands", async () => {
    const bridgeServer = createBridgeServer({
      heartbeatIntervalMs: 60_000,
    });
    openServers.push(bridgeServer);

    const { host, port } = await bridgeServer.listen();
    const response = await fetch(`http://${host}:${port}/command`, {
      body: JSON.stringify({
        schema_version: "1.0.0",
        command_id: "bad-command-id",
        sent_at: "2026-04-18T09:00:00Z",
        kind: "pause",
        payload: {
          reason: "user_pause",
          duration_seconds: 600,
          note: "Taking a break",
        },
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      command_id: null,
      message: "Command payload failed validation.",
      status: "validation_error",
    });
  });

  it("returns retryable_failure envelopes for retryable command errors", async () => {
    const bridgeServer = createBridgeServer({
      handleCommand: () => {
        throw new RetryableCommandError("Temporary persistence backoff.");
      },
      heartbeatIntervalMs: 60_000,
    });
    openServers.push(bridgeServer);

    const { host, port } = await bridgeServer.listen();
    const response = await fetch(`http://${host}:${port}/command`, {
      body: JSON.stringify({
        schema_version: "1.0.0",
        command_id: "c7942526-57a3-4ccb-a4da-2480b496759c",
        sent_at: "2026-04-18T09:00:00Z",
        kind: "pause",
        payload: {
          reason: "user_pause",
          duration_seconds: 600,
          note: "Taking a break",
        },
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      command_id: "c7942526-57a3-4ccb-a4da-2480b496759c",
      message: "Temporary persistence backoff.",
      status: "retryable_failure",
    });
  });

  it("exposes health and diagnostics probe routes", async () => {
    const bridgeServer = createBridgeServer({
      heartbeatIntervalMs: 60_000,
    });
    openServers.push(bridgeServer);

    const { host, port } = await bridgeServer.listen();
    const [healthResponse, diagnosticsResponse] = await Promise.all([
      fetch(`http://${host}:${port}/health`),
      fetch(`http://${host}:${port}/diagnostics`),
    ]);

    expect(healthResponse.status).toBe(200);
    expect(await healthResponse.json()).toEqual({ status: "ok" });
    expect(diagnosticsResponse.status).toBe(200);
    expect(await diagnosticsResponse.json()).toEqual({
      connected_clients: 0,
      mode: "booting",
      stream_sequence: 1,
    });
  });
});
