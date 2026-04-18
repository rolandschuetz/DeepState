import { copyFileSync, chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const distDir = join(projectRoot, "dist");
const bundlePath = join(distDir, "logic-runtime.cjs");
const blobPath = join(distDir, "logic-runtime.blob");
const binaryPath = join(distDir, "INeedABossAgentLogic");
const seaConfigPath = join(distDir, "sea-config.json");

mkdirSync(distDir, { recursive: true });
for (const path of [bundlePath, blobPath, binaryPath, seaConfigPath]) {
  rmSync(path, { force: true });
}

execFileSync(
  "./node_modules/.bin/esbuild",
  [
    "src/cli/run-logic-runtime.ts",
    "--bundle",
    "--platform=node",
    "--format=cjs",
    `--target=node${process.versions.node.split(".")[0]}`,
    `--outfile=${bundlePath}`,
  ],
  { cwd: projectRoot, stdio: "inherit" },
);

writeFileSync(
  seaConfigPath,
  JSON.stringify(
    {
      disableExperimentalSEAWarning: true,
      main: bundlePath,
      output: blobPath,
    },
    null,
    2,
  ),
);

execFileSync(process.execPath, ["--experimental-sea-config", seaConfigPath], {
  cwd: projectRoot,
  stdio: "inherit",
});

copyFileSync(process.execPath, binaryPath);
chmodSync(binaryPath, 0o755);

execFileSync(
  "./node_modules/.bin/postject",
  [
    binaryPath,
    "NODE_SEA_BLOB",
    blobPath,
    "--sentinel-fuse",
    "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
  ],
  { cwd: projectRoot, stdio: "inherit" },
);
