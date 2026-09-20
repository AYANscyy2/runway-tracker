// Bundles the TypeScript tests with esbuild, then runs them on Node's built-in
// test runner. Node can strip types itself but only with explicit file
// extensions on every import, which the app's own source does not use.
import { rm, mkdir, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const OUT = "tests/.build";
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

// No shell: passing args through one leaves them unescaped (DEP0190), so the
// glob is expanded here and esbuild is invoked directly from node_modules.
const sources = (await readdir("tests"))
  .filter((f) => f.endsWith(".test.ts"))
  .map((f) => `tests/${f}`);

const esbuild = process.platform === "win32" ? "esbuild.cmd" : "esbuild";
const build = spawnSync(`node_modules/.bin/${esbuild}`, [
  ...sources,
  "--bundle", "--platform=node", "--format=esm", "--packages=external",
  `--outdir=${OUT}`, "--log-level=warning",
  // .mjs so Node doesn't have to guess the module type of each bundle.
  "--out-extension:.js=.mjs",
], { stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);

// Node's --test wants file paths, not a directory.
const files = (await readdir(OUT)).filter((f) => f.endsWith(".test.mjs")).map((f) => `${OUT}/${f}`);
if (files.length === 0) {
  console.error("No tests were built.");
  process.exit(1);
}
const run = spawnSync("node", ["--test", ...files], { stdio: "inherit" });
process.exit(run.status ?? 1);
