import { describe, expect, it } from "vitest";

import {
  createDiagnosticsLogSink,
  createModuleLogger,
  DiagnosticsLogStore,
} from "../src/index.js";

describe("DiagnosticsLogStore", () => {
  it("stores structured entries for the requested module", () => {
    const store = new DiagnosticsLogStore();
    const logger = createModuleLogger({
      minLevel: "info",
      module: "scheduler",
      sink: createDiagnosticsLogSink(store),
    });

    logger.info("Slow tick ran.", { stream_sequence: 7 });

    expect(store.list()).toHaveLength(1);
    expect(store.list("scheduler")[0]).toMatchObject({
      context: { stream_sequence: 7 },
      level: "info",
      message: "Slow tick ran.",
      module: "scheduler",
    });
  });

  it("filters out entries below the configured log level", () => {
    const store = new DiagnosticsLogStore();
    const logger = createModuleLogger({
      minLevel: "warn",
      module: "screenpipe",
      sink: createDiagnosticsLogSink(store),
    });

    logger.debug("Ignored debug entry.");
    logger.info("Ignored info entry.");
    logger.warn("Captured warning.");

    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]?.message).toBe("Captured warning.");
  });

  it("caps the in-memory log buffer", () => {
    const store = new DiagnosticsLogStore(2);
    const logger = createModuleLogger({
      minLevel: "debug",
      module: "classifier",
      sink: createDiagnosticsLogSink(store),
    });

    logger.debug("Entry 1");
    logger.debug("Entry 2");
    logger.debug("Entry 3");

    expect(store.list().map((entry) => entry.message)).toEqual([
      "Entry 2",
      "Entry 3",
    ]);
  });
});
