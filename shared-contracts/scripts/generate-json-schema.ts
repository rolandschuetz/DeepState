import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { toJSONSchema } from "zod";

import {
  coachingExchangeSchema,
  commandSchema,
  systemStateSchema,
} from "../src/index.js";

const projectRoot = resolve(import.meta.dirname, "..");

const schemaTargets = {
  "json-schema/coaching-exchange.schema.json": coachingExchangeSchema,
  "json-schema/command.schema.json": commandSchema,
  "json-schema/system-state.schema.json": systemStateSchema,
} as const;

for (const [relativePath, schema] of Object.entries(schemaTargets)) {
  const outputPath = resolve(projectRoot, relativePath);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(
    outputPath,
    `${JSON.stringify(toJSONSchema(schema), null, 2)}\n`,
    "utf8",
  );
}
