import { cpSync, copyFileSync, chmodSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const distDir = join(projectRoot, "dist");
const runtimeDir = join(distDir, "logic-runtime");
const bundlePath = join(runtimeDir, "logic-runtime.cjs");
const nodeBinaryPath = join(runtimeDir, "INeedABossAgentNode");
const nodeModulesDir = join(runtimeDir, "node_modules");
const runtimePackages = ["better-sqlite3", "bindings", "file-uri-to-path"];
const require = createRequire(import.meta.url);

function rebuildNativeDependency(packageName) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath) {
    execFileSync(
      process.execPath,
      [npmExecPath, "rebuild", packageName],
      { cwd: projectRoot, stdio: "inherit" },
    );
    return;
  }

  execFileSync(
    "npm",
    ["rebuild", packageName],
    { cwd: projectRoot, stdio: "inherit" },
  );
}

function ensureNativeDependencyMatchesCurrentNode() {
  try {
    const Database = require("better-sqlite3");
    const database = new Database(":memory:");
    database.close();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? error.code
        : undefined;

    if (code !== "ERR_DLOPEN_FAILED" && !message.includes("NODE_MODULE_VERSION")) {
      throw error;
    }

    console.warn(
      `Rebuilding better-sqlite3 for Node ABI ${process.versions.modules}.`,
    );
    rebuildNativeDependency("better-sqlite3");
    const Database = require("better-sqlite3");
    const database = new Database(":memory:");
    database.close();
  }
}

mkdirSync(distDir, { recursive: true });
rmSync(runtimeDir, { force: true, recursive: true });
mkdirSync(runtimeDir, { recursive: true });
ensureNativeDependencyMatchesCurrentNode();

execFileSync(
  "./node_modules/.bin/esbuild",
  [
    "src/cli/run-logic-runtime.ts",
    "--bundle",
    "--platform=node",
    "--format=cjs",
    "--external:better-sqlite3",
    `--target=node${process.versions.node.split(".")[0]}`,
    `--outfile=${bundlePath}`,
  ],
  { cwd: projectRoot, stdio: "inherit" },
);

copyFileSync(process.execPath, nodeBinaryPath);
chmodSync(nodeBinaryPath, 0o755);

mkdirSync(nodeModulesDir, { recursive: true });
for (const packageName of runtimePackages) {
  cpSync(
    join(projectRoot, "node_modules", packageName),
    join(nodeModulesDir, packageName),
    { recursive: true },
  );
}
