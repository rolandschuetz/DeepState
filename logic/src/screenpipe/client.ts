import type {
  HealthStatus,
  SystemState,
} from "@ineedabossagent/shared-contracts";
import { systemStateSchema } from "@ineedabossagent/shared-contracts";

export type ScreenpipeHealthProbe = {
  checkedAt: string;
  details: unknown;
  httpStatus: number | null;
  lastErrorAt: string | null;
  lastOkAt: string | null;
  message: string;
  status: HealthStatus;
  url: string;
};

export type ScreenpipeClient = {
  probeHealth: (checkedAt?: string) => Promise<ScreenpipeHealthProbe>;
};

export type CreateScreenpipeClientOptions = {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  healthTimeoutMs: number;
};

const deriveOverallHealthStatus = (
  databaseStatus: HealthStatus,
  screenpipeStatus: HealthStatus,
): HealthStatus => {
  if (databaseStatus === "down") {
    return "down";
  }

  if (databaseStatus === "degraded" || screenpipeStatus !== "ok") {
    return "degraded";
  }

  return "ok";
};

const toScreenpipeMessage = (status: HealthStatus, httpStatus: number | null): string => {
  if (status === "ok") {
    return "Screenpipe health probe succeeded.";
  }

  if (httpStatus !== null) {
    return `Screenpipe health probe failed with HTTP ${httpStatus}.`;
  }

  return "Screenpipe health probe failed.";
};

const normalizeHealthStatus = (value: unknown): HealthStatus => {
  if (value === "ok" || value === "degraded" || value === "down") {
    return value;
  }

  return "ok";
};

export const applyScreenpipeHealthToSystemState = (
  systemState: SystemState,
  probe: ScreenpipeHealthProbe,
): SystemState =>
  systemStateSchema.parse({
    ...systemState,
    dashboard: {
      ...systemState.dashboard,
      header: {
        ...systemState.dashboard.header,
        mode:
          probe.status === "ok"
            ? systemState.dashboard.header.mode
            : "degraded_screenpipe",
        summary_text:
          probe.status === "ok"
            ? systemState.dashboard.header.summary_text
            : "Screenpipe is unavailable, so autonomous observation is paused.",
        warning_banner:
          probe.status === "ok"
            ? systemState.dashboard.header.warning_banner
            : {
                body: probe.message,
                severity: probe.status === "down" ? "critical" : "warning",
                title: "Screenpipe degraded",
              },
      },
    },
    menu_bar: {
      ...systemState.menu_bar,
      mode_label: probe.status === "ok" ? systemState.menu_bar.mode_label : "Degraded",
      primary_label:
        probe.status === "ok"
          ? systemState.menu_bar.primary_label
          : "Screenpipe unavailable",
      secondary_label:
        probe.status === "ok"
          ? systemState.menu_bar.secondary_label
          : probe.message,
    },
    mode: probe.status === "ok" ? systemState.mode : "degraded_screenpipe",
    system_health: {
      ...systemState.system_health,
      overall_status: deriveOverallHealthStatus(
        systemState.system_health.database.status,
        probe.status,
      ),
      screenpipe: {
        status: probe.status,
        last_error_at: probe.lastErrorAt,
        last_ok_at: probe.lastOkAt,
        message: probe.message,
      },
    },
  });

export const createScreenpipeClient = ({
  baseUrl,
  fetch: fetchImpl = globalThis.fetch,
  healthTimeoutMs,
}: CreateScreenpipeClientOptions): ScreenpipeClient => {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");

  return {
    probeHealth: async (checkedAt = new Date().toISOString()): Promise<ScreenpipeHealthProbe> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, healthTimeoutMs);
      const url = `${normalizedBaseUrl}/health`;

      try {
        const response = await fetchImpl(url, {
          method: "GET",
          signal: controller.signal,
        });
        const details = response.headers.get("content-type")?.includes("application/json")
          ? await response.json()
          : await response.text();
        const responseStatus = response.ok
          ? normalizeHealthStatus(
              typeof details === "object" &&
                details !== null &&
                "status" in details
                ? (details as { status?: unknown }).status
                : undefined,
            )
          : "down";

        return {
          checkedAt,
          details,
          httpStatus: response.status,
          lastErrorAt: responseStatus === "ok" ? null : checkedAt,
          lastOkAt: responseStatus === "ok" ? checkedAt : null,
          message: toScreenpipeMessage(responseStatus, response.status),
          status: responseStatus,
          url,
        };
      } catch (error) {
        return {
          checkedAt,
          details: {
            error: error instanceof Error ? error.message : "Unknown Screenpipe error.",
          },
          httpStatus: null,
          lastErrorAt: checkedAt,
          lastOkAt: null,
          message:
            error instanceof Error && error.name === "AbortError"
              ? `Screenpipe health probe timed out after ${healthTimeoutMs}ms.`
              : toScreenpipeMessage("down", null),
          status: "down",
          url,
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
};
