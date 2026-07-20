#!/usr/bin/env bash
# Agent Hub launcher — starts the dashboard if it isn't already up, then opens it.
#
#   hub          start (if needed) and open the dashboard
#   hub demo     same, but against generated demo data
#   hub stop     stop whatever is running
#   hub log      tail the server log
#   hub status   show what's running
#
# Install by symlinking it somewhere on your PATH:
#   ln -s "$PWD/scripts/hub.sh" ~/.local/bin/hub
#
# The repo location is resolved from this script's own path (symlinks included),
# so the symlink keeps working wherever you cloned to. Override with AGENT_HUB_REPO.
set -uo pipefail

resolve_repo() {
  local source="${BASH_SOURCE[0]}" dir
  while [ -L "$source" ]; do
    dir="$(cd -P "$(dirname "$source")" && pwd)"
    source="$(readlink "$source")"
    [ "${source#/}" = "$source" ] && source="$dir/$source"
  done
  (cd -P "$(dirname "$source")/.." && pwd)
}

REPO="${AGENT_HUB_REPO:-$(resolve_repo)}"
WEB_PORT="${AGENT_HUB_WEB_PORT:-5179}"
API_PORT="${AGENT_HUB_API_PORT:-5178}"
LOG="$REPO/.hub.log"
MODE_FILE="$REPO/.hub.mode"

die() { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }
info() { printf '\033[2m%s\033[0m\n' "$*"; }

[ -f "$REPO/package.json" ] || die "Agent Hub not found at $REPO (set AGENT_HUB_REPO)"

open_url() {
  if command -v open >/dev/null 2>&1; then open "$1"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$1" >/dev/null 2>&1
  else info "open $1"
  fi
}

pids_on_port() { lsof -ti tcp:"$1" -sTCP:LISTEN 2>/dev/null; }

# Vite binds IPv6 ::1 while the API binds 127.0.0.1 — "localhost" reaches both.
web_up() { curl -sf -o /dev/null --max-time 2 "http://localhost:$WEB_PORT" 2>/dev/null; }
api_up() { curl -sf -o /dev/null --max-time 90 "http://localhost:$API_PORT/api/dashboard" 2>/dev/null; }

stop_all() {
  local found=0 pids ppid
  for port in "$API_PORT" "$WEB_PORT"; do
    pids=$(pids_on_port "$port")
    [ -z "$pids" ] && continue
    found=1
    for pid in $pids; do
      # kill the child and its npm/concurrently parent
      ppid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
      kill "$pid" 2>/dev/null
      [ -n "${ppid:-}" ] && [ "$ppid" != "1" ] && kill "$ppid" 2>/dev/null
    done
  done
  pkill -f "$REPO.*concurrently" 2>/dev/null
  sleep 1
  [ "$found" = 1 ] && info "stopped" || info "nothing was running"
  rm -f "$MODE_FILE"
}

start() {
  local mode="$1" script running_mode
  running_mode=$(cat "$MODE_FILE" 2>/dev/null || echo "")

  if web_up; then
    if [ "$running_mode" = "$mode" ]; then
      info "already running ($mode)"
      open_url "http://localhost:$WEB_PORT"
      return 0
    fi
    info "switching from ${running_mode:-unknown} to $mode…"
    stop_all
  fi

  [ "$mode" = demo ] && script=demo || script=dev
  info "starting agent-hub ($mode)…"
  ( cd "$REPO" && nohup npm run "$script" >"$LOG" 2>&1 & )
  echo "$mode" >"$MODE_FILE"

  for _ in $(seq 1 40); do web_up && break; sleep 0.5; done
  web_up || { info "server did not come up — last log lines:"; tail -20 "$LOG"; exit 1; }

  open_url "http://localhost:$WEB_PORT"
  info "open http://localhost:$WEB_PORT  (hub stop / hub log)"
  [ "$mode" = real ] && info "the first scan after a reboot can take a minute — the page fills in when it finishes"
  return 0
}

case "${1:-start}" in
  start|"")  start real ;;
  demo)      start demo ;;
  stop)      stop_all ;;
  log)       tail -f "$LOG" ;;
  status)
    if web_up; then
      printf 'running (%s) on http://localhost:%s\n' "$(cat "$MODE_FILE" 2>/dev/null || echo '?')" "$WEB_PORT"
      api_up && echo "api: ok" || echo "api: not responding yet"
    else
      echo "not running"
    fi ;;
  *) die "usage: hub [demo|stop|log|status]" ;;
esac
