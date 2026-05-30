#!/usr/bin/env bash
# RAI CLI smoke test — exercises the compiled bin end-to-end.
# Usage:  ./scripts/smoke.sh           (assumes `pnpm build` already ran)
#         ./scripts/smoke.sh --build   (runs pnpm build first)
#
# Exits 0 if every check passes, 1 on the first failure.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

BIN="packages/cli/dist/index.js"
FIXTURE="fixtures/duplication/buttons"
PASS=0
FAIL=0

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; FAIL=$((FAIL+1)); }
head() { printf '\n\033[1m%s\033[0m\n' "$1"; }

if [ "${1:-}" = "--build" ]; then
  head "Building"
  pnpm build >/dev/null 2>&1 && ok "pnpm build" || { bad "pnpm build"; exit 1; }
fi

if [ ! -f "$BIN" ]; then
  echo "ERROR: $BIN not found. Run: pnpm build  (or pass --build)"
  exit 1
fi

# ── 1. analyze: one opportunity, warn severity, exit 0 ──────────────────
head "1. analyze (buttons fixture)"
OUT=$(node "$BIN" analyze "$FIXTURE"); RC=$?
[ "$RC" -eq 0 ] && ok "exit 0" || bad "exit $RC (expected 0)"
echo "$OUT" | grep -q '"opportunity": 1' && ok "1 opportunity" || bad "expected 1 opportunity"
echo "$OUT" | grep -q '"warn": 1'        && ok "1 warn"        || bad "expected 1 warn"

# ── 2. analyze default dir (.) — just must succeed ──────────────────────
head "2. analyze default dir (.)"
node "$BIN" analyze >/dev/null 2>&1 && ok "exit 0 on repo root" || bad "non-zero on repo root"

# ── 3. help + unknown command -> usage on stderr, exit 1 ────────────────
head "3. help / unknown -> exit 1"
ERR=$(node "$BIN" 2>&1 >/dev/null); RC=$?
[ "$RC" -eq 1 ] && ok "no-args exit 1" || bad "no-args exit $RC (expected 1)"
echo "$ERR" | grep -q "Usage:" && ok "usage on stderr" || bad "no usage text"
node "$BIN" frobnicate >/dev/null 2>&1; [ "$?" -eq 1 ] && ok "unknown-cmd exit 1" || bad "unknown-cmd not 1"

# ── 4. mcp stdio: initialize handshake + tools/list returns 4 tools ─────
# Drive the server over a FIFO so we can keep stdin open until it answers
# (a fixed `sleep` races cold Node start). Poll output up to ~6s, then stop.
head "4. mcp stdio handshake"
FIFO=$(mktemp -u); mkfifo "$FIFO"
node "$BIN" mcp "$FIXTURE" <"$FIFO" 2>/dev/null >"$FIFO.out" &
MPID=$!
exec 3>"$FIFO"   # hold the write end open so the server's stdin never EOFs
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' >&3
for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
  grep -q '"record_feedback"' "$FIFO.out" 2>/dev/null && break
  sleep 0.5
done
exec 3>&-
kill "$MPID" 2>/dev/null
wait "$MPID" 2>/dev/null   # reap quietly so the kill notice never prints
MCP=$(cat "$FIFO.out" 2>/dev/null)
rm -f "$FIFO" "$FIFO.out"
echo "$MCP" | grep -q '"name":"rai"' && ok "server handshake (name: rai)" || bad "no handshake"
for t in analyze_repo find_shared_opportunities explain_finding record_feedback; do
  echo "$MCP" | grep -q "\"name\":\"$t\"" && ok "tool: $t" || bad "missing tool: $t"
done

# ── summary ─────────────────────────────────────────────────────────────
head "Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
