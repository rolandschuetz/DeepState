import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_PRIVACY_EXCLUSIONS,
  openDatabase,
  PrivacyExclusionsRepo,
  runStartupMigrations,
  seedDefaultPrivacyExclusions,
  appMigrations,
  type SqliteDatabase,
} from "../src/index.js";

const openConnections: SqliteDatabase[] = [];

afterEach(() => {
  for (const database of openConnections.splice(0)) {
    database.close();
  }
});

const createDatabase = (): SqliteDatabase => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ineedabossagent-privacy-seeds-"));
  const database = openDatabase({
    dbPath: join(tempDirectory, "logic.sqlite"),
  });

  runStartupMigrations(database, appMigrations);
  openConnections.push(database);
  return database;
};

describe("seedDefaultPrivacyExclusions", () => {
  it("seeds the default exclusions when the table is empty", () => {
    const database = createDatabase();

    const seeded = seedDefaultPrivacyExclusions(
      database,
      "2026-04-18T09:00:00Z",
    );

    expect(seeded).toHaveLength(DEFAULT_PRIVACY_EXCLUSIONS.length);
    expect(seeded.map((entry) => entry.exclusionId)).toEqual([
      "seed_1password_app",
      "seed_keychain_app",
      "seed_checkout_domains",
      "seed_banking_domains",
    ]);
  });

  it("does not duplicate records when exclusions already exist", () => {
    const database = createDatabase();
    const repo = new PrivacyExclusionsRepo(database);

    repo.create({
      createdAt: "2026-04-18T09:00:00Z",
      enabled: true,
      exclusionId: "custom_1",
      label: "Custom rule",
      matchType: "domain",
      pattern: "internal.example.com",
      source: "user_defined",
      updatedAt: "2026-04-18T09:00:00Z",
    });

    const seeded = seedDefaultPrivacyExclusions(
      database,
      "2026-04-18T09:05:00Z",
    );

    expect(seeded).toHaveLength(1);
    expect(seeded[0]?.exclusionId).toBe("custom_1");
  });
});
