import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { toJSONSchema } from "zod";

import {
  coachingExchangeSchema,
  commandSchema,
  systemStateSchema,
} from "../src/index.js";

const readSnapshot = (relativePath: string): unknown =>
  JSON.parse(
    readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8"),
  );

describe("JSON Schema snapshots", () => {
  it("matches the command schema snapshot", () => {
    expect(readSnapshot("json-schema/command.schema.json")).toEqual(
      toJSONSchema(commandSchema),
    );
  });

  it("matches the coaching exchange schema snapshot", () => {
    expect(readSnapshot("json-schema/coaching-exchange.schema.json")).toEqual(
      toJSONSchema(coachingExchangeSchema),
    );
  });

  it("matches the system state schema snapshot", () => {
    expect(readSnapshot("json-schema/system-state.schema.json")).toEqual(
      toJSONSchema(systemStateSchema),
    );
  });
});
