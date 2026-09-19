// Bundles the TypeScript tests with esbuild, then runs them on Node's built-in
// test runner. Node can strip types itself but only with explicit file
// extensions on every import, which the app's own source does not use.
import { rm, mkdir, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const OUT = "tests/.build";
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const build = spawnSync("npx", [
  "esbuild", "tests/*.test.ts",
  "--bundle", "--platform=node", "--format=esm", "--packages=external",
  `--outdir=${OUT}`, "--log-level=warning",
  // .mjs so Node doesn't have to guess the module type of each bundle.
  "--out-extension:.js=.mjs",
], { stdio: "inherit", shell: true });
if (build.status !== 0) process.exit(build.status ?? 1);

// Node's --test wants file paths, not a directory.
const files = (await readdir(OUT)).filter((f) => f.endsWith(".test.mjs")).map((f) => `${OUT}/${f}`);
const run = spawnSync("node", ["--test", ...files], { stdio: "inherit" });
process.exit(run.status ?? 1);
