#!/usr/bin/env bash
# RAI pre-release smoke gate — validates the PACKAGED artifact and the Homebrew
# install layout, not just the source. Catches packaging/formula bugs (e.g. a
# formula that installs only `bin/rai` and drops `lib/rai/**`, breaking the
# launcher's archive-mode engine resolution) BEFORE a tag is published.
#
# Usage:
#   ./scripts/smoke-release.sh                 # auto-detect a built archive in dist/
#   ./scripts/smoke-release.sh <archive.tar.gz>
#
# Intended to run in the release workflow AFTER `goreleaser release --snapshot`
# has produced dist/ archives, and BEFORE the real publish step. It unpacks the
# real archive GoReleaser built and exercises the launcher from that layout, so
# a broken package can never reach users.
#
# What it proves:
#   1. The archive contains the engine payload at lib/rai/engine/.../index.js.
#   2. The Go launcher resolves the engine when `rai` and `lib/` are siblings
#      (the real unpacked layout), reporting a non-dev engine version.
#   3. The Homebrew install logic (libexec.install Dir["*"] + bin symlink)
#      preserves that sibling layout so `rai version` works post-install.
#   4. Negative control: a binary-only layout (no lib/) fails — proving this
#      gate actually detects the bug class.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
ROOT="$(pwd)"

PASS=0
FAIL=0
ok() { printf '  \033[32m✓\033[0m %s\n' "$1"; PASS=$((PASS + 1)); }
bad() { printf '  \033[31m✗\033[0m %s\n' "$1"; FAIL=$((FAIL + 1)); }
section() { printf '\n\033[1m%s\033[0m\n' "$1"; }

ENGINE_REL="lib/rai/engine/packages/cli/dist/index.js"

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
[ -f "$ARCHIVE/rai" ] && ok "rai binary present" || bad "rai binary missing"
[ -f "$ARCHIVE/$ENGINE_REL" ] && ok "engine present at $ENGINE_REL" || bad "engine missing from archive (packaging bug)"
[ -f "$ARCHIVE/lib/rai/metadata.json" ] && ok "metadata.json present" || bad "metadata.json missing"
chmod +x "$ARCHIVE/rai" 2>/dev/null || true

section "Archive-mode resolution (rai + lib/ siblings)"
# Run from an isolated cwd OUTSIDE any checkout: the launcher's dev-mode probe
# walks up from cwd looking for packages/cli/dist/index.js, so running inside
# the repo would mask archive-mode resolution.
OUT=$(cd "$WORK" && "$ARCHIVE/rai" version 2>"$WORK/arch.err"); RC=$?
[ "$RC" -eq 0 ] && ok "rai version exit 0 from archive" || bad "rai version exit $RC: $(cat "$WORK/arch.err")"
printf '%s' "$OUT" | grep -q '"mode": "archive"' && ok "resolves in archive mode" || bad "not archive mode: $OUT"
printf '%s' "$OUT" | grep -q '"enginePackageVersion": "dev"' && bad "engine version is dev (engine not bundled)" || ok "engine version is non-dev"
grep -q 'engine not found' "$WORK/arch.err" && bad "engine not found from archive" || ok "no engine-not-found error"

section "Homebrew install layout (libexec.install Dir[*] + bin symlink)"
# Mirror the .goreleaser.yaml brews install: stanza exactly.
PREFIX="$WORK/brew-prefix"
mkdir -p "$PREFIX/libexec" "$PREFIX/bin"
cp -R "$ARCHIVE/." "$PREFIX/libexec/"
ln -s "$PREFIX/libexec/rai" "$PREFIX/bin/rai"
OUT=$(cd "$WORK" && "$PREFIX/bin/rai" version 2>"$WORK/brew.err"); RC=$?
[ "$RC" -eq 0 ] && ok "rai version exit 0 via bin symlink" || bad "exit $RC via symlink: $(cat "$WORK/brew.err")"
printf '%s' "$OUT" | grep -q '"mode": "archive"' && ok "symlinked rai resolves engine" || bad "symlinked rai failed: $OUT"

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

section "Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
