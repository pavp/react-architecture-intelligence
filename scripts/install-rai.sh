#!/usr/bin/env bash
set -euo pipefail

# DRY_RUN_ONLY: P8-S2 documents install-script shape but must not install or publish.
cat <<'MSG'
RAI install script dry-run only.

Future behavior:
1. Detect OS/architecture.
2. Select matching GitHub Release archive.
3. Verify checksums.
4. Install user-facing rai launcher on PATH.

Real install is disabled until P8-S3 maintainer setup exists.
MSG
