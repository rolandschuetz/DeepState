import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

import {
  openDatabase,
  runStartupMigrations,
} from "../src/index.js";
import { migrationSmokeTestFixtureMigrations } from "../src/db/migration-smoke-test-fixture.js";

const fixturePath = resolve(
  import.meta.dirname,
  "../../fixtures/databases/migration-smoke-test.sqlite",
);

if (existsSync(fixturePath)) {
  rmSync(fixturePath);
}

const database = openDatabase({
  dbPath: fixturePath,
});

try {
  runStartupMigrations(database, migrationSmokeTestFixtureMigrations);
} finally {
  database.close();
}
