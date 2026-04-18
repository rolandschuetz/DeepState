import { randomUUID } from "node:crypto";

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
const MIGRATION_LOCK_TABLE = "schema_migration_lock";
const MIGRATION_LOCK_KEY = 1;

export class MigrationLockedError extends Error {}

export class MigrationExecutionError extends Error {
  readonly migrationName: string;
  readonly migrationVersion: number;

  constructor(migration: SqliteMigration, cause: unknown) {
    super(
      `Migration ${migration.version} (${migration.name}) failed: ${
        cause instanceof Error ? cause.message : "unknown error"
      }`,
    );
    this.cause = cause;
    this.migrationName = migration.name;
    this.migrationVersion = migration.version;
  }
}

const ensureMigrationsTable = (database: SqliteDatabase): void => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);
};

const ensureMigrationLockTable = (database: SqliteDatabase): void => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATION_LOCK_TABLE} (
      lock_key INTEGER PRIMARY KEY CHECK (lock_key = ${MIGRATION_LOCK_KEY}),
      owner_id TEXT NOT NULL,
      acquired_at TEXT NOT NULL
    )
  `);
};

const ensureMigrationMetadataTables = (database: SqliteDatabase): void => {
  ensureMigrationsTable(database);
  ensureMigrationLockTable(database);
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

const acquireMigrationLock = (
  database: SqliteDatabase,
  ownerId = randomUUID(),
): string => {
  ensureMigrationLockTable(database);

  try {
    database
      .prepare(
        `
          INSERT INTO ${MIGRATION_LOCK_TABLE} (lock_key, owner_id, acquired_at)
          VALUES (@lock_key, @owner_id, @acquired_at)
        `,
      )
      .run({
        acquired_at: new Date().toISOString(),
        lock_key: MIGRATION_LOCK_KEY,
        owner_id: ownerId,
      });
  } catch (error) {
    throw new MigrationLockedError("Another migration runner already holds the lock.", {
      cause: error,
    });
  }

  return ownerId;
};

const releaseMigrationLock = (
  database: SqliteDatabase,
  ownerId: string,
): void => {
  database
    .prepare(
      `
        DELETE FROM ${MIGRATION_LOCK_TABLE}
        WHERE lock_key = @lock_key AND owner_id = @owner_id
      `,
    )
    .run({
      lock_key: MIGRATION_LOCK_KEY,
      owner_id: ownerId,
    });
};

export const listAppliedMigrations = (
  database: SqliteDatabase,
): AppliedMigration[] => {
  ensureMigrationMetadataTables(database);

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
  ensureMigrationMetadataTables(database);
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
    try {
      const applyMigration = database.transaction(() => {
        migration.up(database);
        insertAppliedMigration.run({
          applied_at: new Date().toISOString(),
          name: migration.name,
          version: migration.version,
        });
      });

      applyMigration();
    } catch (error) {
      throw new MigrationExecutionError(migration, error);
    }
  }

  return listAppliedMigrations(database);
};

export const runStartupMigrations = (
  database: SqliteDatabase,
  migrations: SqliteMigration[],
): AppliedMigration[] => {
  ensureMigrationMetadataTables(database);

  const lockOwnerId = acquireMigrationLock(database);

  try {
    return runMigrations(database, migrations);
  } finally {
    releaseMigrationLock(database, lockOwnerId);
  }
};

export const withMigrationLock = <T>(
  database: SqliteDatabase,
  operation: () => T,
): T => {
  const lockOwnerId = acquireMigrationLock(database);

  try {
    return operation();
  } finally {
    releaseMigrationLock(database, lockOwnerId);
  }
};
