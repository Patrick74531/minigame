#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() {
  printf "[tiktok-build] %s\n" "$*"
}

die() {
  printf "[tiktok-build][error] %s\n" "$*" >&2
  exit 1
}

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

ensure_dir() {
  [ -d "$1" ] || mkdir -p "$1"
}

latest_index_html_dir() {
  local latest_file=""
  local latest_time=0
  while IFS= read -r -d '' f; do
    local mt
    if stat -f %m "$f" >/dev/null 2>&1; then
      mt="$(stat -f %m "$f")"
    else
      mt="$(stat -c %Y "$f")"
    fi
    if [ "$mt" -gt "$latest_time" ]; then
      latest_time="$mt"
      latest_file="$f"
    fi
  done < <(find "$ROOT_DIR/build" -type f -name "index.html" -print0 2>/dev/null || true)

  if [ -n "$latest_file" ]; then
    dirname "$latest_file"
  fi
}

copy_dir_clean() {
  local src="$1"
  local dst="$2"
  rm -rf "$dst"
  ensure_dir "$dst"
  if has_cmd rsync; then
    rsync -a --delete "$src"/ "$dst"/
  else
    cp -a "$src"/. "$dst"/
  fi
}

detect_default_cocos_creator() {
  local version=""
  if has_cmd node && [ -f "$ROOT_DIR/package.json" ]; then
    version="$(node -e "try{const p=require('$ROOT_DIR/package.json');process.stdout.write((p.creator&&p.creator.version)||'')}catch(_e){}")"
  fi

  local candidates=()
  if [ -n "$version" ]; then
    candidates+=("/Applications/Cocos/Creator/${version}/CocosCreator.app/Contents/MacOS/CocosCreator")
  fi
  candidates+=(
    "/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator"
    "/Applications/Cocos/Creator/CocosCreator.app/Contents/MacOS/CocosCreator"
  )

  for c in "${candidates[@]}"; do
    if [ -x "$c" ]; then
      printf "%s" "$c"
      return 0
    fi
  done
  return 1
}

inject_platform_config() {
  local webroot="$1"
  local index_file="${webroot}/index.html"
  local config_file="${webroot}/platform-config.js"

  [ -f "$index_file" ] || die "index.html not found in output: $index_file"

  cat > "$config_file" <<'EOF'
(function () {
  window.__GVR_PLATFORM__ = 'tiktok';
  if (typeof window.__GVR_TIKTOK_API_BASE__ !== 'string') {
    window.__GVR_TIKTOK_API_BASE__ = '/api/tiktok';
  }
})();
EOF

  if ! grep -q 'platform-config.js' "$index_file"; then
    perl -0pi -e 's#</head>#  <script src="./platform-config.js"></script>\n</head>#i' "$index_file"
  fi
}

SKIP_COCOS_BUILD=0
SOURCE_BUILD_DIR=""
OUTPUT_WEBROOT="dist/tiktok-package/webroot"
BUILD_PLATFORM="web-mobile"
COCOS_CREATOR="${COCOS_CREATOR:-}"
COCOS_BUILD_OPTS=""

usage() {
  cat <<'EOF'
Usage:
  bash scripts/build_tiktok_package.sh [options]

Options:
  --skip-cocos-build            Skip headless Cocos build and package existing output.
  --source-build-dir <dir>      Existing web build directory (must contain index.html).
  --output-webroot <dir>        Output directory. Default: dist/tiktok-package/webroot
  --platform <name>             Cocos build platform. Default: web-mobile
  --cocos-creator <path>        Path to CocosCreator executable.
  --cocos-build-opts <string>   Extra raw Cocos --build options (append).
  -h, --help                    Show this help.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-cocos-build) SKIP_COCOS_BUILD=1 ;;
    --source-build-dir) SOURCE_BUILD_DIR="$2"; shift ;;
    --output-webroot) OUTPUT_WEBROOT="$2"; shift ;;
    --platform) BUILD_PLATFORM="$2"; shift ;;
    --cocos-creator) COCOS_CREATOR="$2"; shift ;;
    --cocos-build-opts) COCOS_BUILD_OPTS="$2"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
  shift
done

OUTPUT_WEBROOT="${ROOT_DIR}/${OUTPUT_WEBROOT#./}"
ensure_dir "$(dirname "$OUTPUT_WEBROOT")"

if [ "$SKIP_COCOS_BUILD" -eq 0 ]; then
  if [ -z "$COCOS_CREATOR" ]; then
    if COCOS_CREATOR="$(detect_default_cocos_creator)"; then
      log "Auto-detected COCOS_CREATOR: $COCOS_CREATOR"
    else
      die "Missing COCOS_CREATOR path. Pass --cocos-creator or set COCOS_CREATOR env."
    fi
  fi
  [ -x "$COCOS_CREATOR" ] || die "CocosCreator executable not found or not executable: $COCOS_CREATOR"

  BUILD_OPT_BASE="platform=${BUILD_PLATFORM};debug=false;sourceMaps=false"
  if [ -n "$COCOS_BUILD_OPTS" ]; then
    BUILD_OPT_BASE="${BUILD_OPT_BASE};${COCOS_BUILD_OPTS}"
  fi

  log "Running headless Cocos build (TikTok target)..."
  GVR_ENABLE_REDDIT_CSP_PATCH=0 "$COCOS_CREATOR" --project "$ROOT_DIR" --build "$BUILD_OPT_BASE"
fi

if [ -z "$SOURCE_BUILD_DIR" ]; then
  SOURCE_BUILD_DIR="$(latest_index_html_dir)"
fi
[ -n "$SOURCE_BUILD_DIR" ] || die "Could not detect source build dir. Pass --source-build-dir."

if [ "${SOURCE_BUILD_DIR#/}" = "$SOURCE_BUILD_DIR" ]; then
  SOURCE_BUILD_DIR="${ROOT_DIR}/${SOURCE_BUILD_DIR#./}"
fi
[ -f "$SOURCE_BUILD_DIR/index.html" ] || die "index.html not found in source build dir: $SOURCE_BUILD_DIR"

log "Packaging from $SOURCE_BUILD_DIR"
copy_dir_clean "$SOURCE_BUILD_DIR" "$OUTPUT_WEBROOT"

find "$OUTPUT_WEBROOT" -type f \( -name "*.map" -o -name ".DS_Store" \) -delete
inject_platform_config "$OUTPUT_WEBROOT"

log "Done."
log "Output webroot: $OUTPUT_WEBROOT"
