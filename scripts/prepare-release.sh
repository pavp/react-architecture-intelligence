#!/usr/bin/env bash
# Prepare the release assets for goreleaser.
#
# Called by goreleaser's before.hooks (via pnpm release:prepare) before GoReleaser
# cross-compiles the Go binaries and produces archives.
#
# IMPORTANT: This script assumes `pnpm build` has already been run (the CI workflow
# does this as a separate step before goreleaser runs). Do not call `pnpm build`
# here to avoid pnpm TTY/module-purge issues in the goreleaser subprocess context.
# Locally, run `pnpm build && pnpm release:prepare` manually.
#
# Produces:
#   build/release-assets/rai/lib/rai/metadata.json
#   build/release-assets/rai/lib/rai/engine/packages/cli/dist/index.js  (esbuild bundle)
#   build/release-assets/rai/lib/rai/engine/packages/cli/dist/schema.sql
#   build/release-assets/rai/lib/rai/engine/node_modules/               (native deps)
#
# Usage:
#   ./scripts/prepare-release.sh                             # host arch, launcher version 0.0.0
#   LAUNCHER_VERSION=1.2.3 ./scripts/prepare-release.sh     # explicit launcher version
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

PLATFORM="$(go env GOOS)/$(go env GOARCH)"
LAUNCHER_VERSION="${LAUNCHER_VERSION:-0.0.0}"

echo "[prepare-release] Bundling engine for platform=${PLATFORM} launcher=${LAUNCHER_VERSION}..."
node "$ROOT/scripts/bundle-engine.mjs" \
  --platform "$PLATFORM" \
  --launcher-version "$LAUNCHER_VERSION"

echo "[prepare-release] Done. Release assets ready at:"
echo "  $ROOT/build/release-assets/rai/lib/rai/"
