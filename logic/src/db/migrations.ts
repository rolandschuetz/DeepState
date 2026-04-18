import type { SqliteDatabase } from "./database.js";

export type SqliteMigration = {
  name: string;
  up: (database: SqliteDatabase) => void;
  version: number;
};

export type AppliedMigration = {
  applied_at: string;
  name: string;
  version: number;
};

const MIGRATIONS_TABLE = "schema_migrations";

const ensureMigrationsTable = (database: SqliteDatabase): void => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);
};

const assertUniqueVersions = (migrations: SqliteMigration[]): void => {
  const seenVersions = new Set<number>();

  for (const migration of migrations) {
    if (seenVersions.has(migration.version)) {
      throw new Error(`Duplicate migration version detected: ${migration.version}`);
    }

    seenVersions.add(migration.version);
  }
};

export const listAppliedMigrations = (
  database: SqliteDatabase,
): AppliedMigration[] => {
  ensureMigrationsTable(database);

  return database
    .prepare(
      `
        SELECT version, name, applied_at
        FROM ${MIGRATIONS_TABLE}
        ORDER BY version ASC
      `,
    )
    .all() as AppliedMigration[];
};

export const runMigrations = (
  database: SqliteDatabase,
  migrations: SqliteMigration[],
): AppliedMigration[] => {
  ensureMigrationsTable(database);
  assertUniqueVersions(migrations);

  const appliedVersions = new Set(
    listAppliedMigrations(database).map((migration) => migration.version),
  );

  const pendingMigrations = [...migrations]
    .sort((left, right) => left.version - right.version)
    .filter((migration) => !appliedVersions.has(migration.version));

  const insertAppliedMigration = database.prepare(
    `
      INSERT INTO ${MIGRATIONS_TABLE} (version, name, applied_at)
      VALUES (@version, @name, @applied_at)
    `,
  );

  for (const migration of pendingMigrations) {
    const applyMigration = database.transaction(() => {
      migration.up(database);
      insertAppliedMigration.run({
        applied_at: new Date().toISOString(),
        name: migration.name,
        version: migration.version,
      });
    });

    applyMigration();
  }

  return listAppliedMigrations(database);
};
