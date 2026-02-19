#!/usr/bin/env bash
set -euo pipefail

# Build + optimize + validate a Cocos web package for Reddit Devvit Web posts.
# - Optionally runs headless Cocos build
# - Optionally optimizes source assets/resources (with backup)
# - Copies build output to a clean webroot folder
# - Losslessly recompresses PNG/WEBP in output
# - Enforces single-file size cap (default 95 MB, under Reddit 100 MB upload limit)
# - Writes a build report

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

timestamp() {
  date +"%Y%m%d_%H%M%S"
}

log() {
  printf "[reddit-build] %s\n" "$*"
}

warn() {
  printf "[reddit-build][warn] %s\n" "$*" >&2
}

die() {
  printf "[reddit-build][error] %s\n" "$*" >&2
  exit 1
}

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

file_size() {
  if stat -f %z "$1" >/dev/null 2>&1; then
    stat -f %z "$1"
  else
    stat -c %s "$1"
  fi
}

file_mtime() {
  if stat -f %m "$1" >/dev/null 2>&1; then
    stat -f %m "$1"
  else
    stat -c %Y "$1"
  fi
}

sum_bytes_dir() {
  local dir="$1"
  if [ ! -d "$dir" ]; then
    echo 0
    return
  fi
  find "$dir" -type f -exec sh -c '
    for p in "$@"; do
      if stat -f %z "$p" >/dev/null 2>&1; then
        stat -f %z "$p"
      else
        stat -c %s "$p"
      fi
    done
  ' sh {} + | awk '{s+=$1} END{print s+0}'
}

human_bytes() {
  local n="$1"
  awk -v n="$n" '
    function human(x) {
      split("B KB MB GB TB", u, " ");
      i=1;
      while (x>=1024 && i<5) { x/=1024; i++; }
      return sprintf("%.2f %s", x, u[i]);
    }
    BEGIN { print human(n) }'
}

ensure_dir() {
  [ -d "$1" ] || mkdir -p "$1"
}

latest_index_html_dir() {
  local latest_file=""
  local latest_time=0
  while IFS= read -r -d '' f; do
    local mt
    mt="$(file_mtime "$f")"
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

rewrite_index_for_reddit() {
  local webroot="$1"
  local index_file="${webroot}/index.html"
  local boot_file="${webroot}/boot.js"

  [ -f "$index_file" ] || die "index.html not found for compliance rewrite: $index_file"
  log "Rewriting index.html for Reddit web constraints (no inline JS/CSS)..."

  # Move startup + contextmenu handler into an external JS file.
  cat > "$boot_file" <<'EOF'
(function () {
  if (screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('landscape-primary').catch(function () {});
  }
  function appendError(message) {
    var panelId = 'BootErrorPanel';
    var panel = document.getElementById(panelId);
    if (!panel) {
      panel = document.createElement('pre');
      panel.id = panelId;
      panel.style.position = 'fixed';
      panel.style.left = '8px';
      panel.style.right = '8px';
      panel.style.bottom = '8px';
      panel.style.maxHeight = '40%';
      panel.style.overflow = 'auto';
      panel.style.margin = '0';
      panel.style.padding = '10px';
      panel.style.background = 'rgba(0,0,0,0.75)';
      panel.style.color = '#ffb4b4';
      panel.style.font = '12px/1.4 Menlo, Monaco, monospace';
      panel.style.border = '1px solid rgba(255,180,180,0.5)';
      panel.style.borderRadius = '8px';
      panel.style.zIndex = '2147483647';
      panel.textContent = '[boot] runtime error\n';
      document.body.appendChild(panel);
    }
    panel.textContent += '\n' + message;
  }

  var originalConsoleError = console.error ? console.error.bind(console) : null;
  console.error = function () {
    var parts = [];
    for (var i = 0; i < arguments.length; i += 1) {
      var item = arguments[i];
      parts.push(String(item && item.stack ? item.stack : item));
    }
    appendError('[console.error] ' + parts.join(' | '));
    if (originalConsoleError) {
      originalConsoleError.apply(console, arguments);
    }
  };

  window.addEventListener('error', function (event) {
    var msg = event && (event.message || (event.error && event.error.stack));
    if (msg) appendError('[window.error] ' + msg);
  });

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event && event.reason;
    appendError('[unhandledrejection] ' + String(reason && reason.stack ? reason.stack : reason));
  });

  var gameCanvas = document.getElementById('GameCanvas');
  if (gameCanvas) {
    gameCanvas.addEventListener('contextmenu', function (event) {
      event.preventDefault();
    });
  }

  if (typeof System === 'undefined') {
    appendError('SystemJS is unavailable');
    return;
  }

  System.import('./index.js').catch(function (err) {
    appendError('[System.import] ' + String(err && err.stack ? err.stack : err));
    console.error(err);
  });
})();
EOF

  # Write orientation-fix.js: forces landscape rendering in portrait WebViews (Reddit mobile)
  # Intercepts canvas size setters so Cocos renders landscape, then CSS-rotates the canvas
  # to visually fill the portrait viewport. Touch coordinates work correctly with this transform.
  local orient_file="${webroot}/orientation-fix.js"
  cat > "$orient_file" <<'ORIENTEOF'
(function () {
  if (window.innerWidth >= window.innerHeight) return;
  var pW = window.innerWidth, pH = window.innerHeight;

  function applyCSS(canvas) {
    canvas.style.cssText = [
      'position:fixed', 'width:' + pH + 'px', 'height:' + pW + 'px',
      'top:0', 'left:0', 'transform-origin:top left',
      'transform:rotate(90deg) translateX(-' + pH + 'px)'
    ].join(';') + ';';
    var p = canvas.parentElement;
    while (p && p.tagName !== 'BODY') {
      p.style.width = pW + 'px'; p.style.height = pH + 'px';
      p.style.overflow = 'hidden'; p.style.position = 'fixed';
      p = p.parentElement;
    }
  }

  function setup(canvas) {
    applyCSS(canvas);
    var mo = new MutationObserver(function () { applyCSS(canvas); });
    mo.observe(canvas, { attributes: true, attributeFilter: ['style'] });
  }

  var c = document.getElementById('GameCanvas');
  if (c) { setup(c); } else {
    var mo2 = new MutationObserver(function () {
      var c2 = document.getElementById('GameCanvas');
      if (c2) { mo2.disconnect(); setup(c2); }
    });
    mo2.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
ORIENTEOF

  # Remove inline contextmenu handler attribute on canvas.
  perl -0pi -e 's/\s+oncontextmenu="event\.preventDefault\(\)"//g' "$index_file"

  # Replace the Cocos inline boot script with an external boot.js reference.
  perl -0pi -e 's#<script>\s*System\.import\(\s*["\047]\./index\.js["\047]\s*\).*?</script>#<script src="boot.js" charset="utf-8"></script>#gs' "$index_file"

  # Inject orientation-fix.js as the first script (before SystemJS/boot)
  perl -0pi -e 's#(<head[^>]*>)#$1\n  <script src="orientation-fix.js" charset="utf-8"></script>#i' "$index_file"

  if ! rg -q 'src="boot\.js"' "$index_file"; then
    die "Failed to inject external boot.js into index.html"
  fi
}

rewrite_systemjs_for_reddit_csp() {
  local webroot="$1"
  local system_bundle="${webroot}/src/system.bundle.js"
  [ -f "$system_bundle" ] || return 0

  log "Patching SystemJS for Reddit CSP (disable fetch+eval module path)..."

  perl -0pi -e 's~\Qvar n=/^[^#?]+\.(css|html|json|wasm)([?#].*)?$/;t.shouldFetch=function(e){return n.test(e)}\E~t.shouldFetch=function(){return!1}~g' "$system_bundle"
  perl -0pi -e 's~\Qt.shouldFetch=function(e){return n.test(e)}\E~t.shouldFetch=function(){return!1}~g' "$system_bundle"

  if rg -q 'shouldFetch=function\(e\)\{return n\.test\(e\)\}' "$system_bundle"; then
    die "Failed to patch system.bundle.js (unsafe shouldFetch pattern still present)"
  fi

  if ! rg -q 'shouldFetch=function\(\)\{return!1\}' "$system_bundle"; then
    die "Failed to patch system.bundle.js for CSP-safe shouldFetch behavior"
  fi
}

scan_reddit_html_compliance() {
  local webroot="$1"
  local report="$2"
  local has_violation=0

  {
    echo "Reddit HTML Compliance Scan"
    echo "root=$webroot"
    echo
  } > "$report"

  while IFS= read -r -d '' html; do
    local hit

    # No inline <script> tags (must use external src).
    hit="$(rg -n "<script" "$html" | rg -v "src=" || true)"
    if [ -n "$hit" ]; then
      has_violation=1
      {
        echo "violation=inline_script_tag"
        echo "file=$html"
        echo "$hit"
        echo
      } >> "$report"
    fi

    # No inline <style> tags.
    hit="$(rg -n "<style" "$html" || true)"
    if [ -n "$hit" ]; then
      has_violation=1
      {
        echo "violation=inline_style_tag"
        echo "file=$html"
        echo "$hit"
        echo
      } >> "$report"
    fi

    # No inline event handlers, e.g. onclick= / oncontextmenu=.
    hit="$(rg -n "[[:space:]]on[a-zA-Z]+[[:space:]]*=" "$html" || true)"
    if [ -n "$hit" ]; then
      has_violation=1
      {
        echo "violation=inline_event_handler"
        echo "file=$html"
        echo "$hit"
        echo
      } >> "$report"
    fi

    # No inline style attributes.
    hit="$(rg -n "style=" "$html" || true)"
    if [ -n "$hit" ]; then
      has_violation=1
      {
        echo "violation=inline_style_attribute"
        echo "file=$html"
        echo "$hit"
        echo
      } >> "$report"
    fi

    # No direct HTML form submission.
    hit="$(rg -n "<form[^>]*(action=|method=)" "$html" || true)"
    if [ -n "$hit" ]; then
      has_violation=1
      {
        echo "violation=direct_form_submission"
        echo "file=$html"
        echo "$hit"
        echo
      } >> "$report"
    fi
  done < <(find "$webroot" -type f -name "*.html" -print0)

  if [ "$has_violation" -eq 1 ]; then
    echo "status=FAIL" >> "$report"
    return 1
  fi

  echo "status=PASS" >> "$report"
  return 0
}

SKIP_COCOS_BUILD=0
OPTIMIZE_SOURCE_ASSETS=1
SOURCE_BUILD_DIR=""
OUTPUT_WEBROOT="dist/reddit-package/webroot"
REPORT_DIR="dist/reddit-package"
MAX_FILE_MB=95
BUILD_PLATFORM="web-mobile"
COCOS_CREATOR="${COCOS_CREATOR:-}"
COCOS_BUILD_OPTS=""
BACKUP_DIR=""

usage() {
  cat <<'EOF'
Usage:
  bash scripts/build_reddit_package.sh [options]

Options:
  --skip-cocos-build                Skip headless Cocos build and only package existing output.
  --source-build-dir <dir>          Existing web build directory (must contain index.html).
  --output-webroot <dir>            Output webroot directory. Default: dist/reddit-package/webroot
  --report-dir <dir>                Report directory. Default: dist/reddit-package
  --max-file-mb <num>               Max allowed single file size in MB. Default: 95
  --platform <name>                 Cocos build platform. Default: web-mobile
  --cocos-creator <path>            Path to CocosCreator executable.
  --cocos-build-opts <string>       Extra raw Cocos --build options (append).
  --no-optimize-source-assets       Do not optimize assets/resources before build.
  --optimize-source-assets          Optimize assets/resources before build (default).
  --backup-dir <dir>                Backup directory for assets/resources when optimization is enabled.
  -h, --help                        Show this help.

Examples:
  COCOS_CREATOR="/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator" \
  bash scripts/build_reddit_package.sh \
    --cocos-build-opts "stage=build;buildPath=project://build;outputName=reddit-web"

  bash scripts/build_reddit_package.sh \
    --skip-cocos-build \
    --source-build-dir build/reddit-web
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-cocos-build) SKIP_COCOS_BUILD=1 ;;
    --source-build-dir) SOURCE_BUILD_DIR="$2"; shift ;;
    --output-webroot) OUTPUT_WEBROOT="$2"; shift ;;
    --report-dir) REPORT_DIR="$2"; shift ;;
    --max-file-mb) MAX_FILE_MB="$2"; shift ;;
    --platform) BUILD_PLATFORM="$2"; shift ;;
    --cocos-creator) COCOS_CREATOR="$2"; shift ;;
    --cocos-build-opts) COCOS_BUILD_OPTS="$2"; shift ;;
    --no-optimize-source-assets) OPTIMIZE_SOURCE_ASSETS=0 ;;
    --optimize-source-assets) OPTIMIZE_SOURCE_ASSETS=1 ;;
    --backup-dir) BACKUP_DIR="$2"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
  shift
done

OUTPUT_WEBROOT="${ROOT_DIR}/${OUTPUT_WEBROOT#./}"
REPORT_DIR="${ROOT_DIR}/${REPORT_DIR#./}"
ensure_dir "$REPORT_DIR"

RUN_ID="$(timestamp)"
REPORT_FILE="${REPORT_DIR}/reddit_build_report_${RUN_ID}.txt"
ASSET_REPORT_TSV="${REPORT_DIR}/reddit_asset_opt_${RUN_ID}.tsv"
COMPLIANCE_REPORT="${REPORT_DIR}/reddit_compliance_${RUN_ID}.txt"

ASSETS_DIR="${ROOT_DIR}/assets/resources"
ASSETS_BEFORE=0
ASSETS_AFTER=0
ASSETS_SAVED=0

if [ "$OPTIMIZE_SOURCE_ASSETS" -eq 1 ]; then
  [ -d "$ASSETS_DIR" ] || die "Missing assets/resources directory: $ASSETS_DIR"
  if ! has_cmd magick; then
    die "Image optimization needs ImageMagick (magick). Install it or pass --no-optimize-source-assets."
  fi
  if ! has_cmd cwebp; then
    die "WEBP optimization needs cwebp. Install it or pass --no-optimize-source-assets."
  fi
  if ! has_cmd npx; then
    die "npx is required for glTF optimization."
  fi

  if [ -z "$BACKUP_DIR" ]; then
    BACKUP_DIR="${ROOT_DIR}/backups/resources_backup_${RUN_ID}"
  fi
  ensure_dir "$(dirname "$BACKUP_DIR")"
  log "Backing up assets/resources -> $BACKUP_DIR"
  cp -a "$ASSETS_DIR" "$BACKUP_DIR"

  ASSETS_BEFORE="$(sum_bytes_dir "$ASSETS_DIR")"
  echo -e "type\tstatus\tpath\told_bytes\tnew_bytes\tdelta_bytes" > "$ASSET_REPORT_TSV"
  TMP_DIR="$(mktemp -d "/tmp/reddit_asset_opt.${RUN_ID}.XXXX")"

  log "Optimizing source .glb files (safe mode, replace-only-if-smaller)..."
  while IFS= read -r -d '' f; do
    out="$TMP_DIR/out.glb"
    old="$(file_size "$f")"
    if npx gltf-transform optimize "$f" "$out" \
      --compress draco \
      --texture-compress false \
      --flatten false \
      --join false \
      --join-meshes false \
      --join-named false \
      --instance false \
      --palette false \
      --simplify false >/dev/null 2>&1; then
      new="$(file_size "$out")"
      delta=$((new-old))
      if [ "$new" -lt "$old" ]; then
        cp "$out" "$f"
        echo -e "glb\tupdated\t$f\t$old\t$new\t$delta" >> "$ASSET_REPORT_TSV"
      else
        echo -e "glb\tskipped\t$f\t$old\t$new\t$delta" >> "$ASSET_REPORT_TSV"
      fi
    else
      echo -e "glb\tfailed\t$f\t$old\t$old\t0" >> "$ASSET_REPORT_TSV"
    fi
    rm -f "$out"
  done < <(find "$ASSETS_DIR" -type f -name "*.glb" -print0)

  log "Optimizing source .png files (lossless, replace-only-if-smaller)..."
  while IFS= read -r -d '' f; do
    out="$TMP_DIR/out.png"
    old="$(file_size "$f")"
    if magick "$f" -strip \
      -define png:compression-level=9 \
      -define png:compression-filter=5 \
      -define png:compression-strategy=1 \
      "$out" >/dev/null 2>&1; then
      new="$(file_size "$out")"
      delta=$((new-old))
      if [ "$new" -lt "$old" ]; then
        cp "$out" "$f"
        echo -e "png\tupdated\t$f\t$old\t$new\t$delta" >> "$ASSET_REPORT_TSV"
      else
        echo -e "png\tskipped\t$f\t$old\t$new\t$delta" >> "$ASSET_REPORT_TSV"
      fi
    else
      echo -e "png\tfailed\t$f\t$old\t$old\t0" >> "$ASSET_REPORT_TSV"
    fi
    rm -f "$out"
  done < <(find "$ASSETS_DIR" -type f -name "*.png" -print0)

  log "Optimizing source .webp files (lossless, replace-only-if-smaller)..."
  while IFS= read -r -d '' f; do
    out="$TMP_DIR/out.webp"
    old="$(file_size "$f")"
    if cwebp -quiet -lossless -z 9 "$f" -o "$out" >/dev/null 2>&1; then
      new="$(file_size "$out")"
      delta=$((new-old))
      if [ "$new" -lt "$old" ]; then
        cp "$out" "$f"
        echo -e "webp\tupdated\t$f\t$old\t$new\t$delta" >> "$ASSET_REPORT_TSV"
      else
        echo -e "webp\tskipped\t$f\t$old\t$new\t$delta" >> "$ASSET_REPORT_TSV"
      fi
    else
      echo -e "webp\tfailed\t$f\t$old\t$old\t0" >> "$ASSET_REPORT_TSV"
    fi
    rm -f "$out"
  done < <(find "$ASSETS_DIR" -type f -name "*.webp" -print0)

  rm -rf "$TMP_DIR"
  ASSETS_AFTER="$(sum_bytes_dir "$ASSETS_DIR")"
  ASSETS_SAVED=$((ASSETS_BEFORE-ASSETS_AFTER))
fi

if [ "$SKIP_COCOS_BUILD" -eq 0 ]; then
  [ -n "$COCOS_CREATOR" ] || die "Missing COCOS_CREATOR path. Pass --cocos-creator or set COCOS_CREATOR env."
  [ -x "$COCOS_CREATOR" ] || die "CocosCreator executable not found or not executable: $COCOS_CREATOR"
  BUILD_OPT_BASE="platform=${BUILD_PLATFORM};debug=false;sourceMaps=false"
  if [ -n "$COCOS_BUILD_OPTS" ]; then
    BUILD_OPT_BASE="${BUILD_OPT_BASE};${COCOS_BUILD_OPTS}"
  fi
  log "Running headless Cocos build..."
  "$COCOS_CREATOR" --project "$ROOT_DIR" --build "$BUILD_OPT_BASE"
fi

if [ -z "$SOURCE_BUILD_DIR" ]; then
  SOURCE_BUILD_DIR="$(latest_index_html_dir)"
fi
[ -n "$SOURCE_BUILD_DIR" ] || die "Could not detect build output. Pass --source-build-dir explicitly."

if [ "${SOURCE_BUILD_DIR#/}" = "$SOURCE_BUILD_DIR" ]; then
  SOURCE_BUILD_DIR="${ROOT_DIR}/${SOURCE_BUILD_DIR#./}"
fi
[ -f "$SOURCE_BUILD_DIR/index.html" ] || die "index.html not found in source build dir: $SOURCE_BUILD_DIR"

log "Packaging build output from $SOURCE_BUILD_DIR"
copy_dir_clean "$SOURCE_BUILD_DIR" "$OUTPUT_WEBROOT"

log "Post-process output package (remove maps + metadata)..."
find "$OUTPUT_WEBROOT" -type f \( -name "*.map" -o -name ".DS_Store" \) -delete

if has_cmd magick; then
  while IFS= read -r -d '' f; do
    out="${f}.opt.png"
    old="$(file_size "$f")"
    if magick "$f" -strip \
      -define png:compression-level=9 \
      -define png:compression-filter=5 \
      -define png:compression-strategy=1 \
      "$out" >/dev/null 2>&1; then
      new="$(file_size "$out")"
      if [ "$new" -lt "$old" ]; then
        mv "$out" "$f"
      else
        rm -f "$out"
      fi
    fi
  done < <(find "$OUTPUT_WEBROOT" -type f -name "*.png" -print0)
fi

if has_cmd cwebp; then
  while IFS= read -r -d '' f; do
    out="${f}.opt.webp"
    old="$(file_size "$f")"
    if cwebp -quiet -lossless -z 9 "$f" -o "$out" >/dev/null 2>&1; then
      new="$(file_size "$out")"
      if [ "$new" -lt "$old" ]; then
        mv "$out" "$f"
      else
        rm -f "$out"
      fi
    fi
  done < <(find "$OUTPUT_WEBROOT" -type f -name "*.webp" -print0)
fi

rewrite_index_for_reddit "$OUTPUT_WEBROOT"
rewrite_systemjs_for_reddit_csp "$OUTPUT_WEBROOT"

if ! scan_reddit_html_compliance "$OUTPUT_WEBROOT" "$COMPLIANCE_REPORT"; then
  warn "Reddit HTML compliance scan failed. See: $COMPLIANCE_REPORT"
  exit 3
fi

TOTAL_BYTES="$(sum_bytes_dir "$OUTPUT_WEBROOT")"
TOTAL_HUMAN="$(human_bytes "$TOTAL_BYTES")"
MAX_FILE_BYTES=$((MAX_FILE_MB * 1024 * 1024))

MAX_INFO="$(find "$OUTPUT_WEBROOT" -type f -exec sh -c '
  max_size=0
  max_path=""
  for p in "$@"; do
    if stat -f %z "$p" >/dev/null 2>&1; then
      s=$(stat -f %z "$p")
    else
      s=$(stat -c %s "$p")
    fi
    if [ "$s" -gt "$max_size" ]; then
      max_size="$s"
      max_path="$p"
    fi
  done
  printf "%s\t%s\n" "$max_size" "$max_path"
' sh {} +)"

MAX_SIZE="$(printf "%s" "$MAX_INFO" | awk -F '\t' '{print $1}')"
MAX_PATH="$(printf "%s" "$MAX_INFO" | awk -F '\t' '{print $2}')"

TOP_FILES="$(find "$OUTPUT_WEBROOT" -type f -exec sh -c '
  for p in "$@"; do
    if stat -f %z "$p" >/dev/null 2>&1; then
      s=$(stat -f %z "$p")
    else
      s=$(stat -c %s "$p")
    fi
    printf "%s\t%s\n" "$s" "$p"
  done
' sh {} + | sort -nr | head -n 20)"

BY_EXT="$(find "$OUTPUT_WEBROOT" -type f | awk -F. '
  {
    ext = tolower($NF);
    if (index($0, ".") == 0) ext = "(noext)";
    print ext;
  }' | sort | uniq -c | awk '{printf "%s\t%s\n",$2,$1}')"

{
  echo "Reddit Build Report"
  echo "run_id=$RUN_ID"
  echo "root_dir=$ROOT_DIR"
  echo "source_build_dir=$SOURCE_BUILD_DIR"
  echo "output_webroot=$OUTPUT_WEBROOT"
  echo "total_bytes=$TOTAL_BYTES"
  echo "total_human=$TOTAL_HUMAN"
  echo "largest_file_bytes=$MAX_SIZE"
  echo "largest_file_path=$MAX_PATH"
  echo "largest_file_limit_mb=$MAX_FILE_MB"
  echo "largest_file_limit_bytes=$MAX_FILE_BYTES"
  echo
  echo "=== Source Asset Optimization ==="
  echo "enabled=$OPTIMIZE_SOURCE_ASSETS"
  if [ "$OPTIMIZE_SOURCE_ASSETS" -eq 1 ]; then
    echo "backup_dir=$BACKUP_DIR"
    echo "asset_report_tsv=$ASSET_REPORT_TSV"
    echo "assets_before_bytes=$ASSETS_BEFORE"
    echo "assets_after_bytes=$ASSETS_AFTER"
    echo "assets_saved_bytes=$ASSETS_SAVED"
    echo "assets_saved_human=$(human_bytes "$ASSETS_SAVED")"
  fi
  echo
  echo "=== Compliance ==="
  echo "compliance_report=$COMPLIANCE_REPORT"
  echo "html_inline_check=PASS"
  echo
  echo "=== Top Files (bytes<TAB>path) ==="
  echo "$TOP_FILES"
  echo
  echo "=== File Counts by Extension (ext<TAB>count) ==="
  echo "$BY_EXT"
} > "$REPORT_FILE"

if [ "$MAX_SIZE" -gt "$MAX_FILE_BYTES" ]; then
  warn "Largest file exceeds limit: $MAX_PATH ($(human_bytes "$MAX_SIZE")) > ${MAX_FILE_MB} MB"
  warn "Report written: $REPORT_FILE"
  exit 2
fi

PATCH_SCRIPT="${ROOT_DIR}/devvit/scripts/patch-csp.cjs"
if [ -f "$PATCH_SCRIPT" ] && has_cmd node; then
  log "Applying CSP patches to $OUTPUT_WEBROOT ..."
  WEBROOT="$OUTPUT_WEBROOT" node "$PATCH_SCRIPT" || warn "CSP patching returned non-zero exit (see above)"
else
  warn "patch-csp.cjs not found or node unavailable – skipping CSP patches"
fi

log "Done."
log "Output webroot: $OUTPUT_WEBROOT"
log "Output size: $TOTAL_HUMAN"
log "Largest file: $(human_bytes "$MAX_SIZE") - $MAX_PATH"
log "Report: $REPORT_FILE"
log "Compliance report: $COMPLIANCE_REPORT"
if [ "$OPTIMIZE_SOURCE_ASSETS" -eq 1 ]; then
  log "Assets backup: $BACKUP_DIR"
  log "Asset optimization report: $ASSET_REPORT_TSV"
fi
