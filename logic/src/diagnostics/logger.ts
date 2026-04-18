import type { RuntimeConfig } from "../config/runtime-config.js";

export type DiagnosticsModule =
  | "scheduler"
  | "screenpipe"
  | "classifier"
  | "intervention"
  | "import"
  | "memory";

export type DiagnosticsLogLevel = RuntimeConfig["logLevel"];

export type DiagnosticsLogEntry = {
  context: Record<string, unknown> | null;
  level: DiagnosticsLogLevel;
  message: string;
  module: DiagnosticsModule;
  timestamp: string;
};

type DiagnosticsLogSink = (entry: DiagnosticsLogEntry) => void;

type ModuleLogger = {
  debug: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, context?: Record<string, unknown>) => void;
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
};

const LOG_LEVEL_PRIORITY: Record<DiagnosticsLogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class DiagnosticsLogStore {
  readonly #entries: DiagnosticsLogEntry[] = [];
  readonly #maxEntries: number;

  constructor(maxEntries = 200) {
    this.#maxEntries = maxEntries;
  }

  append(entry: DiagnosticsLogEntry): void {
    this.#entries.push(entry);

    if (this.#entries.length > this.#maxEntries) {
      this.#entries.splice(0, this.#entries.length - this.#maxEntries);
    }
  }

  list(module?: DiagnosticsModule): DiagnosticsLogEntry[] {
    if (module === undefined) {
      return [...this.#entries];
    }

    return this.#entries.filter((entry) => entry.module === module);
  }
}

export const createDiagnosticsLogSink = (
  store: DiagnosticsLogStore,
): DiagnosticsLogSink => (entry) => {
  store.append(entry);
};

export const createModuleLogger = ({
  minLevel,
  module,
  sink,
}: {
  minLevel: DiagnosticsLogLevel;
  module: DiagnosticsModule;
  sink: DiagnosticsLogSink;
}): ModuleLogger => {
  const write = (
    level: DiagnosticsLogLevel,
    message: string,
    context?: Record<string, unknown>,
  ): void => {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[minLevel]) {
      return;
    }

    sink({
      context: context ?? null,
      level,
      message,
      module,
      timestamp: new Date().toISOString(),
    });
  };

  return {
    debug: (message, context) => {
      write("debug", message, context);
    },
    error: (message, context) => {
      write("error", message, context);
    },
    info: (message, context) => {
      write("info", message, context);
    },
    warn: (message, context) => {
      write("warn", message, context);
    },
  };
};
