#!/usr/bin/env node
/**
 * Bundle the RAI engine into a single self-contained ESM file for distribution.
 *
 * Usage:
 *   node scripts/bundle-engine.mjs [options]
 *
 * Options:
 *   --out <dir>              Output directory (default: build/release-assets/rai/lib/rai/engine)
 *   --platform <os>/<arch>  Target platform, e.g. darwin/arm64 (default: current host)
 *   --launcher-version <v>  Launcher version string written to metadata.json (default: 0.0.0)
 *
 * Produces:
 *   <out>/packages/cli/dist/index.js   — esbuild bundle (ESM, node22)
 *   <out>/packages/cli/dist/schema.sql — co-located next to bundle
 *   <out>/node_modules/                — native-only pruned node_modules
 *   <out>/../metadata.json             — runtime metadata (lib/rai/metadata.json)
 *
 * Externals (resolved at runtime from co-located node_modules):
 *   better-sqlite3, bindings, file-uri-to-path, sqlite-vec, sqlite-vec-<platform>,
 *   oxc-parser, @oxc-parser/binding-<platform>
 *
 * schema.sql strategy:
 *   db.ts resolves schema.sql via `join(dirname(fileURLToPath(import.meta.url)), "schema.sql")`.
 *   In the bundle, import.meta.url points at the bundle file, so schema.sql must sit
 *   next to the bundle. We copy it from packages/core/dist/db/schema.sql.
 *
 * Native node_modules strategy:
 *   `pnpm --filter @rai/cli deploy <deploy-tmp> --prod --legacy` produces a workspace-aware
 *   pruned tree. The virtual store (.pnpm/) inside that output contains exactly the right
 *   packages at the right versions. We extract native packages from there into a flat
 *   node_modules/ for archive distribution.
 *
 * Banner (CJS globals injected into the ESM bundle):
 *   esbuild emits __dirname2/__filename2/__require internally. Unprefixed names collide →
 *   SyntaxError: Identifier has already been declared. __rai_ prefix avoids this.
 */

import {
  existsSync,
  mkdirSync,
  cpSync,
  copyFileSync,
  statSync,
  readdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

// ── Helpers ────────────────────────────────────────────────────────────────────

function dirSizeMB(dir) {
  let total = 0;
  function walk(d) {
    try {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, entry.name);
        if (entry.isDirectory()) walk(p);
        else total += statSync(p).size;
      }
    } catch {}
  }
  walk(dir);
  return (total / 1024 / 1024).toFixed(1);
}

// ── Parse CLI flags ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : null;
}

const outFlag = getArg("--out");
const platformFlag = getArg("--platform");
const launcherVersionFlag = getArg("--launcher-version");

// Default --out is the goreleaser source path for the engine.
const OUT = outFlag
  ? resolve(outFlag)
  : join(ROOT, "build", "release-assets", "rai", "lib", "rai", "engine");

// metadata.json sits at <engine-dir>/../metadata.json = lib/rai/metadata.json
const METADATA_FILE = join(OUT, "..", "metadata.json");

const ENGINE_DIR = join(OUT, "packages", "cli", "dist");
const BUNDLE_FILE = join(ENGINE_DIR, "index.js");
const NM_DIR = join(OUT, "node_modules");

// Platform detection
const hostOs =
  process.platform === "darwin" ? "darwin"
  : process.platform === "win32" ? "windows"
  : "linux";
const hostArch = process.arch === "arm64" ? "arm64" : "amd64";
const PLATFORM = platformFlag || `${hostOs}/${hostArch}`;
const [TARGET_OS, TARGET_ARCH] = PLATFORM.split("/");

const LAUNCHER_VERSION = launcherVersionFlag || "0.0.0";

console.log(`[bundle-engine] OUT=${OUT}`);
console.log(`[bundle-engine] BUNDLE=${BUNDLE_FILE}`);
console.log(`[bundle-engine] PLATFORM=${PLATFORM}`);

// ── 1. Validate entry point ────────────────────────────────────────────────────

mkdirSync(ENGINE_DIR, { recursive: true });
mkdirSync(NM_DIR, { recursive: true });

const entryPoint = join(ROOT, "packages", "cli", "dist", "index.js");
if (!existsSync(entryPoint)) {
  console.error(`[bundle-engine] ERROR: entry not found: ${entryPoint}`);
  console.error("  Run `pnpm build` first.");
  process.exit(1);
}

// ── 2. Find esbuild binary ─────────────────────────────────────────────────────

function findEsbuild() {
  const rootBin = join(ROOT, "node_modules", ".bin", "esbuild");
  if (existsSync(rootBin)) return rootBin;
  const store = join(ROOT, "node_modules", ".pnpm");
  try {
    const entries = readdirSync(store).filter(e => e.startsWith("esbuild@")).sort().reverse();
    for (const entry of entries) {
      const bin = join(store, entry, "node_modules", "esbuild", "bin", "esbuild");
      if (existsSync(bin)) return bin;
    }
  } catch {}
  return null;
}

const ESBUILD_BIN = findEsbuild();
if (!ESBUILD_BIN) {
  console.error("[bundle-engine] ERROR: esbuild not found. Run: pnpm add -D esbuild");
  process.exit(1);
}
console.log(`[bundle-engine] Using esbuild: ${ESBUILD_BIN}`);

// ── 3. esbuild bundle ─────────────────────────────────────────────────────────

// Externals: native deps + all their platform-specific binding sub-packages.
// esbuild skips packages that match --external; they must exist in co-located node_modules.
const externals = [
  "better-sqlite3",
  "sqlite-vec",
  "sqlite-vec-darwin-arm64",
  "sqlite-vec-darwin-x64",
  "sqlite-vec-linux-x64",
  "sqlite-vec-linux-arm64",
  "sqlite-vec-windows-x64",
  "oxc-parser",
  "@oxc-parser/binding-darwin-arm64",
  "@oxc-parser/binding-darwin-x64",
  "@oxc-parser/binding-linux-x64-gnu",
  "@oxc-parser/binding-linux-arm64-gnu",
  "@oxc-parser/binding-linux-x64-musl",
  "@oxc-parser/binding-linux-arm64-musl",
  "@oxc-parser/binding-win32-x64-msvc",
  "@oxc-parser/binding-win32-arm64-msvc",
];

// Banner: inject CJS compatibility globals into ESM bundle.
// esbuild uses __dirname2/__filename2/__require internally — do NOT use those names.
// __rai_ prefix avoids the SyntaxError: Identifier has already been declared collision.
const banner = [
  `import { createRequire as __rai_createRequire } from "node:module";`,
  `import { fileURLToPath as __rai_fileURLToPath } from "node:url";`,
  `import { dirname as __rai_dirname } from "node:path";`,
  `const require = __rai_createRequire(import.meta.url);`,
  `const __filename = __rai_fileURLToPath(import.meta.url);`,
  `const __dirname = __rai_dirname(__filename);`,
].join("\n");

console.log("[bundle-engine] Running esbuild...");

const esbuildArgs = [
  entryPoint,
  `--outfile=${BUNDLE_FILE}`,
  "--bundle",
  "--platform=node",
  "--format=esm",
  "--target=node22",
  "--log-level=warning",
  `--banner:js=${banner}`,
  ...externals.map(e => `--external:${e}`),
];

const esbuildResult = spawnSync(ESBUILD_BIN, esbuildArgs, {
  encoding: "utf8",
  stdio: "inherit",
});

if (esbuildResult.status !== 0) {
  console.error(`[bundle-engine] esbuild failed (exit ${esbuildResult.status})`);
  process.exit(esbuildResult.status ?? 1);
}

console.log("[bundle-engine] esbuild done.");

// ── 4. Co-locate schema.sql next to the bundle ────────────────────────────────
// db.ts: join(dirname(fileURLToPath(import.meta.url)), "schema.sql")
// In the bundle, import.meta.url === file:///path/to/index.js, so schema.sql
// must sit at the same level as index.js.

const schemaSrc = join(ROOT, "packages", "core", "dist", "db", "schema.sql");
if (!existsSync(schemaSrc)) {
  console.error(`[bundle-engine] ERROR: schema.sql not found at ${schemaSrc}`);
  console.error("  Run `pnpm build` first.");
  process.exit(1);
}
const schemaDst = join(ENGINE_DIR, "schema.sql");
copyFileSync(schemaSrc, schemaDst);
console.log(`[bundle-engine] schema.sql -> ${schemaDst}`);

// ── 5. Assemble native node_modules via pnpm deploy ───────────────────────────
// `pnpm --filter @rai/cli deploy <dir> --prod --legacy` produces a workspace-aware
// pruned tree. The virtual store (.pnpm/) contains exactly the right native packages.
// We extract them into a flat node_modules/ for archive distribution.
//
// Node resolves 'better-sqlite3' from node_modules/ walking up from the bundle:
// dist/ -> cli/ -> packages/ -> OUT -> finds node_modules/

const DEPLOY_TMP = join(ROOT, "build", "deploy-tmp");

// Clean deploy-tmp to avoid ERR_PNPM_DEPLOY_DIR_NOT_EMPTY
if (existsSync(DEPLOY_TMP)) {
  console.log("[bundle-engine] Cleaning previous deploy-tmp...");
  rmSync(DEPLOY_TMP, { recursive: true, force: true });
}

console.log("[bundle-engine] Running pnpm deploy (builds pruned native node_modules)...");

const deployResult = spawnSync(
  "pnpm",
  ["--filter", "@rai/cli", "deploy", DEPLOY_TMP, "--prod", "--legacy", "--config.confirmModulesPurge=false"],
  { cwd: ROOT, encoding: "utf8", stdio: "inherit" }
);

if (deployResult.status !== 0) {
  console.error(`[bundle-engine] pnpm deploy failed (exit ${deployResult.status})`);
  process.exit(deployResult.status ?? 1);
}

// Map from (pnpm virtual store dir name) → (npm package name) for each native package.
// pnpm --legacy deploy puts packages in .pnpm/<storeDir>/node_modules/<pkgName>.
// For scoped packages, pnpm encodes "/" as "+" in the store dir name.
//
// oxc-parser linux binding: uses "-gnu" suffix (musl not relevant for our targets).

const OXC_ARCH = TARGET_ARCH === "amd64" ? "x64" : TARGET_ARCH;
const OXC_SUFFIX = TARGET_OS === "linux" ? "-gnu" : "";

const NATIVE_PACKAGES = [
  { storeDir: "better-sqlite3@11.10.0",  name: "better-sqlite3" },
  { storeDir: "bindings@1.5.0",          name: "bindings" },
  { storeDir: "file-uri-to-path@1.0.0",  name: "file-uri-to-path" },
  { storeDir: "sqlite-vec@0.1.9",        name: "sqlite-vec" },
  {
    storeDir: `sqlite-vec-${TARGET_OS}-${TARGET_ARCH}@0.1.9`,
    name:     `sqlite-vec-${TARGET_OS}-${TARGET_ARCH}`,
  },
  { storeDir: "oxc-parser@0.30.5",       name: "oxc-parser" },
  {
    storeDir: `@oxc-parser+binding-${TARGET_OS}-${OXC_ARCH}${OXC_SUFFIX}@0.30.5`,
    name:     `@oxc-parser/binding-${TARGET_OS}-${OXC_ARCH}${OXC_SUFFIX}`,
  },
];

const DEPLOY_STORE = join(DEPLOY_TMP, "node_modules", ".pnpm");

console.log("[bundle-engine] Extracting native packages from deploy output...");

const kept = [];
const missingPkgs = [];

for (const { storeDir, name } of NATIVE_PACKAGES) {
  let src;
  if (name.startsWith("@")) {
    const slashIdx = name.indexOf("/");
    const scope = name.slice(0, slashIdx);
    const pkg = name.slice(slashIdx + 1);
    src = join(DEPLOY_STORE, storeDir, "node_modules", scope, pkg);
  } else {
    src = join(DEPLOY_STORE, storeDir, "node_modules", name);
  }

  const dst = join(NM_DIR, name);

  if (!existsSync(src)) {
    console.warn(`[bundle-engine] WARN: not found in deploy output: ${src}`);
    missingPkgs.push(name);
    continue;
  }

  mkdirSync(dirname(dst), { recursive: true });
  cpSync(src, dst, { recursive: true, dereference: true });
  const sizeMB = dirSizeMB(dst);
  console.log(`[bundle-engine] extracted ${name} (${sizeMB} MB)`);
  kept.push(name);
}

if (missingPkgs.length > 0) {
  console.error(`[bundle-engine] ERROR: ${missingPkgs.length} native package(s) missing:`);
  for (const m of missingPkgs) console.error(`  - ${m}`);
  console.error("  Verify pnpm lockfile includes these for the target platform.");
  process.exit(1);
}

// ── 6. Write metadata.json ────────────────────────────────────────────────────
// Placed at lib/rai/metadata.json (one level up from engine dir).
// Launcher reads this to report version and validate the archive layout.

const cliPkg = JSON.parse(readFileSync(join(ROOT, "packages", "cli", "package.json"), "utf8"));
const enginePackageVersion = cliPkg.version || "0.0.0";

const gitResult = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" });
const gitCommit =
  process.env.GORELEASER_CURRENT_TAG ||
  process.env.GIT_COMMIT ||
  gitResult.stdout?.trim() ||
  "unknown";

const buildDate = process.env.BUILD_DATE || new Date().toISOString();

const metadata = {
  launcherVersion: LAUNCHER_VERSION,
  enginePackageVersion,
  assetSchemaVersion: "1",
  runtimeKind: "system-node",
  platform: PLATFORM,
  gitCommit,
  buildDate,
};

mkdirSync(dirname(METADATA_FILE), { recursive: true });
writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2) + "\n");
console.log(`[bundle-engine] metadata.json -> ${METADATA_FILE}`);

// ── 7. Report ─────────────────────────────────────────────────────────────────

const bundleSize = (statSync(BUNDLE_FILE).size / 1024).toFixed(1);
const nmSize = dirSizeMB(NM_DIR);

console.log("\n[bundle-engine] Summary:");
console.log(`  Bundle:        ${BUNDLE_FILE} (${bundleSize} KB)`);
console.log(`  schema.sql:    ${schemaDst}`);
console.log(`  node_modules:  ${NM_DIR} (${nmSize} MB)`);
console.log(`  metadata.json: ${METADATA_FILE}`);
console.log(`  Platform:      ${PLATFORM}`);
console.log(`  Packages kept (${kept.length}): ${kept.join(", ")}`);
console.log("\nArchive layout for goreleaser:");
console.log("  <root>/lib/rai/metadata.json");
console.log("  <root>/lib/rai/engine/packages/cli/dist/index.js   (bundle)");
console.log("  <root>/lib/rai/engine/packages/cli/dist/schema.sql (co-located)");
console.log("  <root>/lib/rai/engine/node_modules/                (native deps)");
for (const name of kept) console.log(`    ${name}/`);
console.log("\n[bundle-engine] Done.");
