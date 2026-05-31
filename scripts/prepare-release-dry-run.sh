#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/build/release-assets/rai/lib/rai"
PLATFORM="$(go env GOOS)/$(go env GOARCH)"

rm -rf "$ROOT/build/release-assets/rai"
mkdir -p \
  "$DIST/engine/packages/cli/dist" \
  "$DIST/runtime" \
  "$DIST/native"

pnpm build

cp "$ROOT/packages/cli/dist/index.js" "$DIST/engine/packages/cli/dist/index.js"

cat >"$DIST/metadata.json" <<JSON
{
  "launcherVersion": "0.0.0",
  "enginePackageVersion": "0.0.0",
  "assetSchemaVersion": "1",
  "runtimeKind": "system-node",
  "platform": "$PLATFORM",
  "gitCommit": "dry-run",
  "buildDate": "dry-run"
}
JSON

cat >"$DIST/runtime/README.md" <<'MD'
Runtime placeholder for P8-S2 dry-run archives. Current launcher uses system Node.
MD

cat >"$DIST/native/README.md" <<'MD'
Native asset placeholder for P8-S2 dry-run archives. Real native support matrix gates P8-S3.
MD
