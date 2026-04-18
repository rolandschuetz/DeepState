import { resolve } from "node:path";

import { z } from "zod";

const runtimeConfigEnvSchema = z.object({
  INEEDABOSSAGENT_BRIDGE_HEALTH_TIMEOUT_MS: z.coerce.number().int().positive().default(2_000),
  INEEDABOSSAGENT_DATABASE_HEALTH_TIMEOUT_MS: z.coerce.number().int().positive().default(2_000),
  INEEDABOSSAGENT_DB_PATH: z.string().min(1).default(resolve(process.cwd(), "data/logic.sqlite")),
  INEEDABOSSAGENT_FEATURE_FLAGS: z.string().default(""),
  INEEDABOSSAGENT_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  INEEDABOSSAGENT_MAINTENANCE_EVERY_N_SLOW_TICKS: z.coerce.number().int().min(1).default(10),
  INEEDABOSSAGENT_FAST_TICK_MS: z.coerce.number().int().min(1_000).default(15_000),
  INEEDABOSSAGENT_SCREENPIPE_BASE_URL: z.url().default("http://127.0.0.1:3030"),
  INEEDABOSSAGENT_SCREENPIPE_HEALTH_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
  INEEDABOSSAGENT_SCREENPIPE_SEARCH_BUDGET_MS: z.coerce.number().int().min(1_000).default(12_000),
  INEEDABOSSAGENT_SLOW_TICK_MS: z.coerce.number().int().min(5_000).default(90_000),
});

export type RuntimeConfig = {
  dbPath: string;
  featureFlags: string[];
  healthTimeouts: {
    bridgeMs: number;
    databaseMs: number;
    screenpipeMs: number;
  };
  logLevel: "debug" | "info" | "warn" | "error";
  maintenanceEveryNSlowTicks: number;
  scheduler: {
    fastTickMs: number;
    slowTickMs: number;
    screenpipeSearchBudgetMs: number;
  };
  screenpipeBaseUrl: string;
};

export const loadRuntimeConfig = (
  env: Partial<Record<string, string | undefined>> = process.env,
): RuntimeConfig => {
  const parsed = runtimeConfigEnvSchema.parse(env);

  return {
    dbPath: parsed.INEEDABOSSAGENT_DB_PATH,
    featureFlags: parsed.INEEDABOSSAGENT_FEATURE_FLAGS
      .split(",")
      .map((flag) => flag.trim())
      .filter((flag) => flag.length > 0),
    healthTimeouts: {
      bridgeMs: parsed.INEEDABOSSAGENT_BRIDGE_HEALTH_TIMEOUT_MS,
      databaseMs: parsed.INEEDABOSSAGENT_DATABASE_HEALTH_TIMEOUT_MS,
      screenpipeMs: parsed.INEEDABOSSAGENT_SCREENPIPE_HEALTH_TIMEOUT_MS,
    },
    logLevel: parsed.INEEDABOSSAGENT_LOG_LEVEL,
    maintenanceEveryNSlowTicks: parsed.INEEDABOSSAGENT_MAINTENANCE_EVERY_N_SLOW_TICKS,
    scheduler: {
      fastTickMs: parsed.INEEDABOSSAGENT_FAST_TICK_MS,
      screenpipeSearchBudgetMs: parsed.INEEDABOSSAGENT_SCREENPIPE_SEARCH_BUDGET_MS,
      slowTickMs: parsed.INEEDABOSSAGENT_SLOW_TICK_MS,
    },
    screenpipeBaseUrl: parsed.INEEDABOSSAGENT_SCREENPIPE_BASE_URL.replace(/\/+$/, ""),
  };
};

export const isFeatureFlagEnabled = (
  runtimeConfig: RuntimeConfig,
  featureFlag: string,
): boolean => runtimeConfig.featureFlags.includes(featureFlag);
