import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import {
  commandSchema,
  systemStateSchema,
  type Command,
  type SystemState,
} from "@ineedabossagent/shared-contracts";

import {
  createCommandCorrelationId,
  RetryableCommandError,
  type CommandActionResult,
} from "./command-action-result.js";
import { createDefaultSystemState } from "../system-state/default-system-state.js";

type BridgeServerOptions = {
  diagnosticsProbe?: () => Promise<Record<string, unknown>> | Record<string, unknown>;
  healthProbe?: () => Promise<Record<string, unknown>> | Record<string, unknown>;
  initialState?: SystemState;
  heartbeatIntervalMs?: number;
  handleCommand?: (command: Command) => Promise<void> | void;
};

type BridgeServerInstance = {
  close: () => Promise<void>;
  getSystemState: () => SystemState;
  listen: (port?: number, host?: string) => Promise<{ port: number; host: string }>;
  publishSystemState: (nextState: SystemState) => void;
  server: Server;
};

const SYSTEM_STATE_EVENT = "system_state";

const writeSystemStateEvent = (
  response: ServerResponse<IncomingMessage>,
  systemState: SystemState,
): void => {
  response.write(`event: ${SYSTEM_STATE_EVENT}\n`);
  response.write(`data: ${JSON.stringify(systemState)}\n\n`);
};

const parseJsonBody = async (request: IncomingMessage): Promise<unknown> => {
  const rawBody = await new Promise<string>((resolve, reject) => {
    let body = "";

    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      body += chunk;
    });
    request.on("end", () => {
      resolve(body);
    });
    request.on("error", reject);
  });

  if (rawBody.length === 0) {
    return null;
  }

  return JSON.parse(rawBody);
};

export const createBridgeServer = (
  options: BridgeServerOptions = {},
): BridgeServerInstance => {
  let currentState = systemStateSchema.parse(
    options.initialState ?? createDefaultSystemState(),
  );
  const clients = new Set<ServerResponse<IncomingMessage>>();

  const heartbeatInterval = setInterval(() => {
    for (const client of clients) {
      writeSystemStateEvent(client, currentState);
    }
  }, options.heartbeatIntervalMs ?? 30_000);

  const handleRequest = async (
    request: IncomingMessage,
    response: ServerResponse<IncomingMessage>,
  ): Promise<void> => {
    const method = request.method ?? "GET";
    const url = request.url ?? "/";

    if (method === "GET" && url === "/stream") {
      response.writeHead(200, {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
      });

      clients.add(response);
      writeSystemStateEvent(response, currentState);

      request.on("close", () => {
        clients.delete(response);
      });

      return;
    }

    if (method === "POST" && url === "/command") {
      const correlationId = createCommandCorrelationId();
      let commandId: string | null = null;

      try {
        const payload = await parseJsonBody(request);
        const parsed = commandSchema.safeParse(payload);

        if (!parsed.success) {
          const validationError: CommandActionResult = {
            command_id: null,
            correlation_id: correlationId,
            message: "Command payload failed validation.",
            status: "validation_error",
            issues: parsed.error.issues.map((issue) =>
              `${issue.path.join(".") || "root"}: ${issue.message}`),
          };

          response.writeHead(400, { "Content-Type": "application/json" });
          response.end(JSON.stringify(validationError));
          return;
        }

        commandId = parsed.data.command_id;
        await options.handleCommand?.(parsed.data);

        const accepted: CommandActionResult = {
          command_id: commandId,
          correlation_id: correlationId,
          kind: parsed.data.kind,
          message: "Command accepted.",
          status: "success",
        };

        response.writeHead(202, { "Content-Type": "application/json" });
        response.end(JSON.stringify(accepted));
        return;
      } catch (error) {
        const retryableFailure: CommandActionResult = {
          command_id: commandId,
          correlation_id: correlationId,
          message:
            error instanceof Error
              ? error.message
              : "Unknown retryable command failure.",
          status: "retryable_failure",
        };

        if (error instanceof RetryableCommandError) {
          response.writeHead(503, { "Content-Type": "application/json" });
          response.end(JSON.stringify(retryableFailure));
          return;
        }

        const fatalFailure: CommandActionResult = {
          command_id: commandId,
          correlation_id: correlationId,
          message: error instanceof Error ? error.message : "Unknown command failure.",
          status: "fatal_failure",
        };

        response.writeHead(500, { "Content-Type": "application/json" });
        response.end(JSON.stringify(fatalFailure));
        return;
      }
    }

    if (method === "GET" && url === "/health") {
      response.writeHead(200, { "Content-Type": "application/json" });
      const baseHealth = { status: "ok" as const };
      const extra =
        options.healthProbe === undefined
          ? {}
          : await Promise.resolve(options.healthProbe());
      response.end(JSON.stringify({ ...baseHealth, ...extra }));
      return;
    }

    if (method === "GET" && url === "/diagnostics") {
      response.writeHead(200, { "Content-Type": "application/json" });
      const baseDiagnostics = {
        connected_clients: clients.size,
        mode: currentState.mode,
        stream_sequence: currentState.stream_sequence,
      };
      const extra =
        options.diagnosticsProbe === undefined
          ? {}
          : await Promise.resolve(options.diagnosticsProbe());
      response.end(JSON.stringify({ ...baseDiagnostics, ...extra }));
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ status: "not_found" }));
  };

  const server = createServer((request, response) => {
    void handleRequest(request, response);
  });

  return {
    server,
    listen: async (port = 0, host = "127.0.0.1") =>
      await new Promise<{ port: number; host: string }>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          const address = server.address();

          if (address === null || typeof address === "string") {
            reject(new Error("Bridge server did not bind to a TCP port."));
            return;
          }

          resolve({ host: address.address, port: address.port });
        });
      }),
    close: async () =>
      await new Promise<void>((resolve, reject) => {
        clearInterval(heartbeatInterval);
        for (const client of clients) {
          client.end();
        }

        server.close((error) => {
          if (error !== undefined) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
    getSystemState: () => currentState,
    publishSystemState: (nextState) => {
      currentState = systemStateSchema.parse(nextState);

      for (const client of clients) {
        writeSystemStateEvent(client, currentState);
      }
    },
  };
};
