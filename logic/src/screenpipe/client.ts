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

export type ScreenpipeCapabilities = {
  audioTranscriptsAvailable: boolean | null;
  checkedAt: string;
  elementsEndpointAvailable: boolean;
  frameContextEndpointAvailable: boolean | null;
  sampleFrameId: number | string | null;
  searchEndpointAvailable: boolean;
  version: string | null;
};

type ScreenpipeDiagnosticsLogger = {
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
};

export type ScreenpipeClient = {
  detectCapabilities: (
    checkedAt?: string,
    diagnosticsLogger?: ScreenpipeDiagnosticsLogger,
  ) => Promise<ScreenpipeCapabilities>;
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

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const findFirstNestedValue = (
  value: unknown,
  candidateKeys: string[],
): unknown => {
  if (Array.isArray(value)) {
    for (const item of value) {
      const nestedMatch = findFirstNestedValue(item, candidateKeys);

      if (nestedMatch !== undefined) {
        return nestedMatch;
      }
    }

    return undefined;
  }

  if (!isPlainObject(value)) {
    return undefined;
  }

  for (const candidateKey of candidateKeys) {
    if (candidateKey in value) {
      return value[candidateKey];
    }
  }

  for (const nestedValue of Object.values(value)) {
    const nestedMatch = findFirstNestedValue(nestedValue, candidateKeys);

    if (nestedMatch !== undefined) {
      return nestedMatch;
    }
  }

  return undefined;
};

const parseJsonResponse = async (response: Response): Promise<unknown> =>
  response.headers.get("content-type")?.includes("application/json")
    ? await response.json()
    : await response.text();

const detectAudioTranscriptAvailability = (value: unknown): boolean | null => {
  const transcriptValue = findFirstNestedValue(value, [
    "audio_transcript",
    "audioTranscript",
    "transcript",
    "transcription",
  ]);

  if (transcriptValue === undefined || transcriptValue === null) {
    return null;
  }

  if (typeof transcriptValue === "boolean") {
    return transcriptValue;
  }

  if (typeof transcriptValue === "string") {
    return transcriptValue.trim().length > 0;
  }

  if (Array.isArray(transcriptValue)) {
    return transcriptValue.length > 0;
  }

  return true;
};

const extractVersion = (...values: unknown[]): string | null => {
  for (const value of values) {
    const version = findFirstNestedValue(value, [
      "version",
      "app_version",
      "server_version",
    ]);

    if (typeof version === "string" && version.trim().length > 0) {
      return version;
    }
  }

  return null;
};

const extractSampleFrameId = (value: unknown): number | string | null => {
  const frameId = findFirstNestedValue(value, ["frame_id", "frameId", "id"]);

  return typeof frameId === "number" || typeof frameId === "string"
    ? frameId
    : null;
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

  const probeHealth = async (
    checkedAt = new Date().toISOString(),
  ): Promise<ScreenpipeHealthProbe> => {
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
      const details = await parseJsonResponse(response);
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
  };

  const detectCapabilities = async (
    checkedAt = new Date().toISOString(),
    diagnosticsLogger?: ScreenpipeDiagnosticsLogger,
  ): Promise<ScreenpipeCapabilities> => {
    const healthProbe = await probeHealth(checkedAt);
    const [elementsResponse, searchResponse] = await Promise.all([
      fetchImpl(`${normalizedBaseUrl}/elements?limit=1`, { method: "GET" }),
      fetchImpl(`${normalizedBaseUrl}/search?limit=1`, { method: "GET" }),
    ]);
    const elementsDetails = await parseJsonResponse(elementsResponse);
    const searchDetails = await parseJsonResponse(searchResponse);
    const sampleFrameId = extractSampleFrameId(searchDetails);

    let frameContextEndpointAvailable: boolean | null = null;

    if (sampleFrameId !== null) {
      const frameContextResponse = await fetchImpl(
        `${normalizedBaseUrl}/frames/${sampleFrameId}/context`,
        { method: "GET" },
      );

      frameContextEndpointAvailable = frameContextResponse.ok;
    }

    const capabilities = {
      audioTranscriptsAvailable:
        detectAudioTranscriptAvailability(searchDetails) ??
        detectAudioTranscriptAvailability(healthProbe.details),
      checkedAt,
      elementsEndpointAvailable: elementsResponse.ok,
      frameContextEndpointAvailable,
      sampleFrameId,
      searchEndpointAvailable: searchResponse.ok,
      version: extractVersion(healthProbe.details, searchDetails, elementsDetails),
    };

    const logContext = {
      audio_transcripts_available: capabilities.audioTranscriptsAvailable,
      elements_endpoint_available: capabilities.elementsEndpointAvailable,
      frame_context_endpoint_available: capabilities.frameContextEndpointAvailable,
      sample_frame_id: capabilities.sampleFrameId,
      search_endpoint_available: capabilities.searchEndpointAvailable,
      version: capabilities.version,
    };

    if (
      capabilities.elementsEndpointAvailable &&
      capabilities.searchEndpointAvailable
    ) {
      diagnosticsLogger?.info("Detected Screenpipe startup capabilities.", logContext);
    } else {
      diagnosticsLogger?.warn("Screenpipe startup capability detection is partial.", logContext);
    }

    return capabilities;
  };

  return {
    detectCapabilities,
    probeHealth,
  };
};
