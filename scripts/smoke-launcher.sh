#!/usr/bin/env bash
# RAI Go launcher smoke test — builds local launcher and verifies delegation.
# Usage: ./scripts/smoke-launcher.sh
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

BIN="dist/rai/rai"
FIXTURE="fixtures/duplication/buttons"
PASS=0
FAIL=0

ok() { printf '  \033[32m✓\033[0m %s\n' "$1"; PASS=$((PASS + 1)); }
bad() { printf '  \033[31m✗\033[0m %s\n' "$1"; FAIL=$((FAIL + 1)); }
section() { printf '\n\033[1m%s\033[0m\n' "$1"; }

section "Building TypeScript engine and Go launcher"
pnpm build >/dev/null 2>&1 && ok "pnpm build" || { bad "pnpm build"; exit 1; }
pnpm build:launcher >/dev/null 2>&1 && ok "pnpm build:launcher" || { bad "pnpm build:launcher"; exit 1; }

section "doctor delegation"
OUT=$("$BIN" doctor . --json 2>"$BIN.doctor.err"); RC=$?
[ "$RC" -eq 0 ] && ok "doctor exit 0" || bad "doctor exit $RC"
printf '%s' "$OUT" | grep -q '"projectRoot"' && ok "doctor JSON stdout" || bad "doctor JSON missing"
[ ! -s "$BIN.doctor.err" ] && ok "doctor launcher stderr clean" || bad "doctor stderr not clean"
rm -f "$BIN.doctor.err"

section "install delegation"
OUT=$("$BIN" install --dry-run --platform opencode --no-instructions . 2>"$BIN.install.err"); RC=$?
[ "$RC" -eq 0 ] && ok "install dry-run exit 0" || bad "install dry-run exit $RC"
printf '%s' "$OUT" | grep -q '"platform": "opencode"' && ok "install JSON stdout" || bad "install JSON missing opencode"
[ ! -s "$BIN.install.err" ] && ok "install launcher stderr clean" || bad "install stderr not clean"
rm -f "$BIN.install.err"

section "failure propagation"
"$BIN" frobnicate >/dev/null 2>"$BIN.fail.err"; RC=$?
[ "$RC" -eq 1 ] && ok "unsupported command exit 1" || bad "unsupported command exit $RC"
grep -q "Usage:" "$BIN.fail.err" && ok "engine failure on stderr" || bad "missing engine stderr diagnostic"
rm -f "$BIN.fail.err"

section "mcp stdout cleanliness"
FIFO=$(mktemp -u); mkfifo "$FIFO"
"$BIN" mcp "$FIXTURE" <"$FIFO" 2>"$FIFO.err" >"$FIFO.out" &
MPID=$!
exec 3>"$FIFO"
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke-launcher","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' >&3
for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
  grep -q '"record_feedback"' "$FIFO.out" 2>/dev/null && break
  sleep 0.5
done
exec 3>&-
kill "$MPID" 2>/dev/null
wait "$MPID" 2>/dev/null
MCP=$(cat "$FIFO.out" 2>/dev/null)
ERR=$(cat "$FIFO.err" 2>/dev/null)
rm -f "$FIFO" "$FIFO.out" "$FIFO.err"
printf '%s' "$MCP" | grep -q '"name":"rai"' && ok "mcp handshake stdout" || bad "mcp handshake missing"
printf '%s' "$MCP" | grep -q 'rai launcher' && bad "launcher diagnostic leaked to stdout" || ok "launcher stdout clean"
[ -z "$ERR" ] && ok "mcp stderr clean" || bad "mcp stderr not clean"

section "Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
