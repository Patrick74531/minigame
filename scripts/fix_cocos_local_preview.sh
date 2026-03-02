#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEEP_CLEAN=0
KILL_CREATOR=0

log() {
  printf "[cocos-preview-fix] %s\n" "$*"
}

warn() {
  printf "[cocos-preview-fix][warn] %s\n" "$*" >&2
}

usage() {
  cat <<'EOF_USAGE'
Usage:
  bash scripts/fix_cocos_local_preview.sh [options]

Options:
  --deep-clean      Also remove project library cache (slower reimport on next open).
  --kill-creator    Kill running Cocos Creator processes before cleanup.
  -h, --help        Show this help.
EOF_USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --deep-clean) DEEP_CLEAN=1 ;;
    --kill-creator) KILL_CREATOR=1 ;;
    -h|--help) usage; exit 0 ;;
    *) warn "Unknown option: $1"; usage; exit 1 ;;
  esac
  shift
done

if [ "$KILL_CREATOR" -eq 1 ]; then
  log "Stopping Cocos Creator processes..."
  pkill -f "CocosCreator|Cocos Creator" >/dev/null 2>&1 || true
  sleep 1
fi

log "Project root: $ROOT_DIR"

if [ -d "$ROOT_DIR/temp" ]; then
  log "Removing project temp cache: $ROOT_DIR/temp"
  rm -rf "$ROOT_DIR/temp"
fi

if [ "$DEEP_CLEAN" -eq 1 ] && [ -d "$ROOT_DIR/library" ]; then
  log "Removing project library cache: $ROOT_DIR/library"
  rm -rf "$ROOT_DIR/library"
fi

if [ -n "${TMPDIR:-}" ] && [ -d "${TMPDIR}" ]; then
  log "Cleaning Creator tmp handles in: ${TMPDIR}"
  find "${TMPDIR}" -maxdepth 1 -name '.com.cocos.creator*' -print0 | xargs -0 rm -rf || true
else
  warn "TMPDIR not available; skip tmp cleanup."
fi

mkdir -p "$ROOT_DIR/temp"

if command -v lsof >/dev/null 2>&1; then
  log "Port 7456 listeners (for preview service):"
  lsof -nP -iTCP:7456 -sTCP:LISTEN || true
fi

log "Cleanup complete. Reopen Cocos Creator and start Preview again."
