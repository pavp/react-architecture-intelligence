#!/usr/bin/env bash
# RAI pre-release smoke gate — validates the PACKAGED artifact and the Homebrew
# install layout. Catches packaging/bundling bugs BEFORE a tag is published.
#
# Usage:
#   ./scripts/smoke-release.sh                 # auto-detect a built archive in dist/
#   ./scripts/smoke-release.sh <archive.tar.gz>
#
# Intended to run AFTER `goreleaser release --snapshot --clean --skip=publish`
# has produced dist/ archives. Unpacks the real archive GoReleaser built and
# exercises the launcher FROM THAT LAYOUT from an isolated cwd, so a broken
# package can never reach users.
#
# What it proves:
#   1. The archive contains engine bundle, schema.sql, and node_modules.
#   2. `rai doctor <fixture>` exits 0 from the unpacked archive layout, exercising
#      better-sqlite3, sqlite-vec, and MCP wiring (native deps).
#   3. `rai analyze <fixture>` exits 0 and produces at least one finding keyword,
#      exercising the full analysis pipeline.
#   4. The Homebrew install layout (libexec.install Dir["*"] + bin symlink)
#      preserves the layout so both commands work post-install.
#   5. Negative control: a binary-only layout (no lib/) fails — proving this
#      gate actually detects the bug class.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
ROOT="$(pwd)"

PASS=0
FAIL=0
ok()      { printf '  \033[32m✓\033[0m %s\n' "$1"; PASS=$((PASS + 1)); }
bad()     { printf '  \033[31m✗\033[0m %s\n' "$1"; FAIL=$((FAIL + 1)); }
section() { printf '\n\033[1m%s\033[0m\n' "$1"; }

ENGINE_REL="lib/rai/engine/packages/cli/dist/index.js"
SCHEMA_REL="lib/rai/engine/packages/cli/dist/schema.sql"
NM_REL="lib/rai/engine/node_modules"
FIXTURE="$ROOT/fixtures/react/compound-primitives"

# Resolve the archive to test: explicit arg, else the host-matching tar.gz in dist/.
ARCHIVE_TGZ="${1:-}"
if [ -z "$ARCHIVE_TGZ" ]; then
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"; [ "$os" = "darwin" ] && os="darwin"
  arch="$(uname -m)"; case "$arch" in arm64|aarch64) arch="arm64";; x86_64|amd64) arch="amd64";; esac
  ARCHIVE_TGZ="$(ls "$ROOT"/dist/rai_*_"${os}"_"${arch}".tar.gz 2>/dev/null | head -1)"
fi

section "Locate built archive"
if [ -z "$ARCHIVE_TGZ" ] || [ ! -f "$ARCHIVE_TGZ" ]; then
  bad "no built archive found (run goreleaser snapshot first, or pass a path)"
  printf '\n\033[1mResult: %d passed, %d failed\033[0m\n' "$PASS" "$FAIL"
  exit 1
fi
ok "archive: $(basename "$ARCHIVE_TGZ")"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
ARCHIVE="$WORK/unpacked"
mkdir -p "$ARCHIVE"
tar xzf "$ARCHIVE_TGZ" -C "$ARCHIVE" || { bad "failed to unpack archive"; exit 1; }

section "Archive payload"
[ -f "$ARCHIVE/rai" ]               && ok "rai binary present"            || bad "rai binary missing"
[ -f "$ARCHIVE/$ENGINE_REL" ]       && ok "engine bundle present"         || bad "engine bundle missing from archive (packaging bug)"
[ -f "$ARCHIVE/$SCHEMA_REL" ]       && ok "schema.sql present"            || bad "schema.sql missing from archive"
[ -d "$ARCHIVE/$NM_REL" ]           && ok "node_modules dir present"      || bad "node_modules/ missing from archive"
[ -d "$ARCHIVE/$NM_REL/better-sqlite3" ] && ok "better-sqlite3 present"   || bad "better-sqlite3 missing from node_modules"
[ -d "$ARCHIVE/$NM_REL/bindings" ]       && ok "bindings present"         || bad "bindings missing from node_modules (critical transitive dep)"
[ -d "$ARCHIVE/$NM_REL/sqlite-vec" ]     && ok "sqlite-vec present"       || bad "sqlite-vec missing from node_modules"
[ -f "$ARCHIVE/lib/rai/metadata.json" ]  && ok "metadata.json present"    || bad "metadata.json missing"
chmod +x "$ARCHIVE/rai" 2>/dev/null || true

section "Archive-mode resolution (rai version)"
OUT=$(cd "$WORK" && "$ARCHIVE/rai" version 2>"$WORK/arch.err"); RC=$?
[ "$RC" -eq 0 ] && ok "rai version exit 0 from archive" || bad "rai version exit $RC: $(cat "$WORK/arch.err")"
printf '%s' "$OUT" | grep -q '"mode": "archive"' && ok "resolves in archive mode" || bad "not archive mode: $OUT"
printf '%s' "$OUT" | grep -q '"enginePackageVersion": "dev"' && bad "engine version is dev (engine not bundled)" || ok "engine version is non-dev"
grep -q 'engine not found' "$WORK/arch.err" 2>/dev/null && bad "engine not found from archive" || ok "no engine-not-found error"

section "rai doctor (exercises native deps: better-sqlite3, sqlite-vec, MCP wiring)"
if [ ! -d "$FIXTURE" ]; then
  bad "fixture not found: $FIXTURE — cannot run rai doctor"
else
  DOCTOR_OUT=$(cd "$WORK" && "$ARCHIVE/rai" doctor "$FIXTURE" 2>"$WORK/doctor.err"); DOCTOR_RC=$?
  [ "$DOCTOR_RC" -eq 0 ] && ok "rai doctor exit 0" || bad "rai doctor exit $DOCTOR_RC (see $WORK/doctor.err)"
  if [ "$DOCTOR_RC" -ne 0 ]; then
    printf '  stderr: %s\n' "$(head -5 "$WORK/doctor.err")"
  fi
  # doctor must produce some output (not empty)
  [ -n "$DOCTOR_OUT" ] && ok "rai doctor produced output" || bad "rai doctor produced no output"
fi

section "rai analyze (exercises full analysis pipeline)"
if [ ! -d "$FIXTURE" ]; then
  bad "fixture not found: $FIXTURE — cannot run rai analyze"
else
  ANALYZE_OUT=$(cd "$WORK" && "$ARCHIVE/rai" analyze "$FIXTURE" 2>"$WORK/analyze.err"); ANALYZE_RC=$?
  [ "$ANALYZE_RC" -eq 0 ] && ok "rai analyze exit 0" || bad "rai analyze exit $ANALYZE_RC (see $WORK/analyze.err)"
  if [ "$ANALYZE_RC" -ne 0 ]; then
    printf '  stderr: %s\n' "$(head -5 "$WORK/analyze.err")"
  fi
  # analyze must include at least one finding keyword
  if printf '%s' "$ANALYZE_OUT" | grep -qiE 'finding|component|issue|warning|error|result|analysis'; then
    ok "rai analyze output contains finding keyword"
  else
    bad "rai analyze output has no finding keyword: $(printf '%s' "$ANALYZE_OUT" | head -3)"
  fi
fi

section "Homebrew install layout (libexec.install Dir[*] + bin symlink)"
PREFIX="$WORK/brew-prefix"
mkdir -p "$PREFIX/libexec" "$PREFIX/bin"
cp -R "$ARCHIVE/." "$PREFIX/libexec/"
ln -s "$PREFIX/libexec/rai" "$PREFIX/bin/rai"
OUT=$(cd "$WORK" && "$PREFIX/bin/rai" version 2>"$WORK/brew.err"); RC=$?
[ "$RC" -eq 0 ] && ok "rai version exit 0 via bin symlink" || bad "exit $RC via symlink: $(cat "$WORK/brew.err")"
printf '%s' "$OUT" | grep -q '"mode": "archive"' && ok "symlinked rai resolves engine" || bad "symlinked rai failed: $OUT"

# Homebrew doctor check
BREW_DOCTOR_OUT=$(cd "$WORK" && "$PREFIX/bin/rai" doctor "$FIXTURE" 2>"$WORK/brew-doctor.err"); BREW_RC=$?
[ "$BREW_RC" -eq 0 ] && ok "rai doctor exit 0 via Homebrew layout" || bad "rai doctor exit $BREW_RC via Homebrew layout"

section "Negative control (binary only, no lib/ — the old broken formula)"
BROKEN="$WORK/broken/bin"
mkdir -p "$BROKEN"
cp "$ARCHIVE/rai" "$BROKEN/rai"
OUT=$(cd "$WORK" && "$BROKEN/rai" version 2>"$WORK/broken.err"); RC=$?
if [ "$RC" -ne 0 ] && grep -q 'engine not found' "$WORK/broken.err"; then
  ok "binary-only layout correctly fails (gate detects the bug class)"
else
  bad "binary-only layout did NOT fail — this gate would miss the packaging bug"
fi

printf '\n\033[1mResult: %d passed, %d failed\033[0m\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
