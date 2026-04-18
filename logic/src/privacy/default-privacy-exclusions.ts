import type { SqliteDatabase } from "../db/database.js";
import {
  PrivacyExclusionsRepo,
  type PrivacyExclusionRecord,
} from "../repos/sqlite-repositories.js";

export const DEFAULT_PRIVACY_EXCLUSIONS: PrivacyExclusionRecord[] = [
  {
    createdAt: "2026-04-18T00:00:00Z",
    enabled: true,
    exclusionId: "seed_1password_app",
    label: "1Password",
    matchType: "app",
    pattern: "1Password",
    source: "system_seed",
    updatedAt: "2026-04-18T00:00:00Z",
  },
  {
    createdAt: "2026-04-18T00:00:00Z",
    enabled: true,
    exclusionId: "seed_keychain_app",
    label: "Keychain Access",
    matchType: "app",
    pattern: "Keychain Access",
    source: "system_seed",
    updatedAt: "2026-04-18T00:00:00Z",
  },
  {
    createdAt: "2026-04-18T00:00:00Z",
    enabled: true,
    exclusionId: "seed_checkout_domains",
    label: "Checkout Domains",
    matchType: "url_regex",
    pattern:
      "^https?://([^/]+\\.)?(stripe\\.com|checkout\\.shopify\\.com|paypal\\.com|secure\\.authorize\\.net)(/|$)",
    source: "system_seed",
    updatedAt: "2026-04-18T00:00:00Z",
  },
  {
    createdAt: "2026-04-18T00:00:00Z",
    enabled: true,
    exclusionId: "seed_banking_domains",
    label: "Banking Domains",
    matchType: "url_regex",
    pattern:
      "^https?://([^/]+\\.)?(chase\\.com|bankofamerica\\.com|wellsfargo\\.com|americanexpress\\.com)(/|$)",
    source: "system_seed",
    updatedAt: "2026-04-18T00:00:00Z",
  },
];

export const seedDefaultPrivacyExclusions = (
  database: SqliteDatabase,
  now = new Date().toISOString(),
): PrivacyExclusionRecord[] => {
  const repo = new PrivacyExclusionsRepo(database);

  if (repo.listAll().length > 0) {
    return repo.listAll();
  }

  return DEFAULT_PRIVACY_EXCLUSIONS.map((preset) =>
    repo.create({
      ...preset,
      createdAt: now,
      updatedAt: now,
    }),
  );
};
