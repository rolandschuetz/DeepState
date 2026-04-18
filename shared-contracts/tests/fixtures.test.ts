import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  coachingExchangeSchema,
  commandSchema,
  systemStateSchema,
} from "../src/index.js";

const readJsonFixture = (relativePath: string): unknown =>
  JSON.parse(
    readFileSync(new URL(`../../fixtures/${relativePath}`, import.meta.url), "utf8"),
  );

describe("contract fixtures", () => {
  it("validates the outbound system state fixture", () => {
    const fixture = readJsonFixture("contracts/system-state.running.json");

    expect(systemStateSchema.parse(fixture)).toEqual(fixture);
  });

  it("validates the coaching exchange fixtures", () => {
    const fixturePaths = [
      "contracts/coaching-exchange/morning-plan.json",
      "contracts/coaching-exchange/evening-debrief.json",
    ];

    for (const fixturePath of fixturePaths) {
      const fixture = readJsonFixture(fixturePath);

      expect(coachingExchangeSchema.parse(fixture)).toEqual(fixture);
    }
  });

  it("validates every command fixture", () => {
    const fixturePaths = [
      "contracts/commands/pause.json",
      "contracts/commands/resume.json",
      "contracts/commands/update-exclusions.json",
      "contracts/commands/resolve-ambiguity.json",
      "contracts/commands/import-coaching-exchange.json",
      "contracts/commands/notification-action.json",
      "contracts/commands/report-notification-permission.json",
      "contracts/commands/request-morning-flow.json",
      "contracts/commands/purge-all.json",
    ];

    for (const fixturePath of fixturePaths) {
      const fixture = readJsonFixture(fixturePath);

      expect(commandSchema.parse(fixture)).toEqual(fixture);
    }
  });
});
