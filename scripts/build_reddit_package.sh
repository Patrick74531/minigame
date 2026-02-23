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

latest_file_mtime_under() {
  local root="$1"
  local latest_file=""
  local latest_time=0

  [ -d "$root" ] || {
    echo "0|"
    return
  }

  while IFS= read -r -d '' f; do
    local mt
    mt="$(file_mtime "$f")"
    if [ "$mt" -gt "$latest_time" ]; then
      latest_time="$mt"
      latest_file="$f"
    fi
  done < <(find "$root" -type f -print0 2>/dev/null || true)

  echo "${latest_time}|${latest_file}"
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

validate_source_build_freshness() {
  local source_build_dir="$1"
  local allow_stale="$2"
  local latest_src_time=0
  local latest_src_file=""
  local latest_build_time=0
  local latest_build_file=""

  local source_inputs=(
    "$ROOT_DIR/assets"
    "$ROOT_DIR/settings"
    "$ROOT_DIR/extensions"
    "$ROOT_DIR/profiles"
    "$ROOT_DIR/package.json"
  )

  for input in "${source_inputs[@]}"; do
    if [ -f "$input" ]; then
      local mt
      mt="$(file_mtime "$input")"
      if [ "$mt" -gt "$latest_src_time" ]; then
        latest_src_time="$mt"
        latest_src_file="$input"
      fi
      continue
    fi
    if [ -d "$input" ]; then
      local info
      info="$(latest_file_mtime_under "$input")"
      local mt="${info%%|*}"
      local file="${info#*|}"
      if [ "${mt:-0}" -gt "$latest_src_time" ]; then
        latest_src_time="$mt"
        latest_src_file="$file"
      fi
    fi
  done

  local build_info
  build_info="$(latest_file_mtime_under "$source_build_dir")"
  latest_build_time="${build_info%%|*}"
  latest_build_file="${build_info#*|}"

  if [ "${latest_src_time:-0}" -le "${latest_build_time:-0}" ]; then
    return 0
  fi

  local msg="Source files are newer than source build output. latest_source=${latest_src_file} (${latest_src_time}), latest_build=${latest_build_file} (${latest_build_time}). Rebuild Cocos output first, or remove --skip-cocos-build."
  if [ "$allow_stale" -eq 1 ]; then
    warn "$msg"
    warn "Proceeding because --allow-stale-source-build is set."
    return 0
  fi

  die "$msg"
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
  local boot_css_file="${webroot}/boot.css"

  [ -f "$index_file" ] || die "index.html not found for compliance rewrite: $index_file"
  log "Rewriting index.html for Reddit web constraints (no inline JS/CSS)..."

  # Move startup + contextmenu handler into an external JS file.
  cat > "$boot_file" <<'EOF'
(function () {
  // ╔══════════════════════════════════════════════════════════════════════════════╗
  // ║  DO NOT MODIFY — Portrait→Landscape fix for iOS portrait-locked WebViews   ║
  // ║  This IIFE is the result of many iterations of debugging. Changes here      ║
  // ║  will break full-screen display or touch input on iOS Reddit WebView.       ║
  // ║                                                                              ║
  // ║  Key facts:                                                                  ║
  // ║  • W/H captured BEFORE any overrides (real portrait dimensions).            ║
  // ║  • window.innerWidth/Height overridden → Cocos creates landscape canvas.    ║
  // ║  • #GameDiv rotated via !important CSS (immune to Cocos inline resets).     ║
  // ║  • canvas.getBoundingClientRect() overridden → prevents Cocos scale ×2 bug. ║
  // ║  • Touch events proxied: portrait (tx,ty) → landscape (H-ty, tx).           ║
  // ╚══════════════════════════════════════════════════════════════════════════════╝
  (function () {
    var W = window.innerWidth, H = window.innerHeight;
    var shouldForceLandscape = W < H;
    window.__BOOT_FORCE_LANDSCAPE__ = shouldForceLandscape;
    if (!shouldForceLandscape) return;
    document.documentElement.classList.add('boot-force-landscape');
    if (document.body) {
      document.body.classList.add('boot-force-landscape');
    }
    var LAND_W = H, LAND_H = W;
    Object.defineProperty(window, 'innerWidth',  { get: function () { return LAND_W; }, configurable: true });
    Object.defineProperty(window, 'innerHeight', { get: function () { return LAND_H; }, configurable: true });
    if (window.visualViewport) {
      try {
        Object.defineProperty(window.visualViewport, 'width',  { get: function () { return LAND_W; }, configurable: true });
        Object.defineProperty(window.visualViewport, 'height', { get: function () { return LAND_H; }, configurable: true });
      } catch (_) {}
    }
    var style = document.createElement('style');
    style.textContent =
      'html, body {' +
      '  margin: 0 !important; padding: 0 !important;' +
      '  width: 100% !important; height: 100% !important;' +
      '  overflow: hidden !important; background: #000 !important;' +
      '}' +
      '#GameDiv {' +
      '  position: fixed !important; top: 0 !important; left: 0 !important;' +
      '  width: 100vh !important; height: 100vw !important;' +
      '  transform-origin: 0 0 !important;' +
      '  transform: rotate(-90deg) translateX(-100vh) !important;' +
      '  overflow: hidden !important;' +
      '}' +
      '#Cocos3dGameContainer, #GameCanvas {' +
      '  width: 100% !important; height: 100% !important;' +
      '}';
    document.head.appendChild(style);
    var REMAP = { touchstart:1, touchmove:1, touchend:1, touchcancel:1,
      pointerdown:1, pointermove:1, pointerup:1, pointercancel:1,
      mousedown:1, mousemove:1, mouseup:1, click:1 };
    function patchCanvas(c) {
      c.getBoundingClientRect = function () {
        return { left: 0, top: 0, right: LAND_W, bottom: LAND_H,
                 width: LAND_W, height: LAND_H, x: 0, y: 0,
                 toJSON: function () { return this; } };
      };
      function rxy(tx, ty) {
        return { x: H - ty, y: tx };
      }
      function pTouch(t) {
        var p = rxy(t.clientX, t.clientY);
        return new Proxy(t, { get: function (o, k) {
          if (k === 'clientX' || k === 'x' || k === 'pageX' || k === 'screenX') return p.x;
          if (k === 'clientY' || k === 'y' || k === 'pageY' || k === 'screenY') return p.y;
          var v = o[k]; return typeof v === 'function' ? v.bind(o) : v;
        }});
      }
      function pTouchList(l) {
        var a = [];
        for (var i = 0; i < l.length; i++) a.push(pTouch(l[i]));
        a.item = function (i) { return a[i]; };
        return a;
      }
      function pEvent(e) {
        if (e.changedTouches !== undefined) {
          return new Proxy(e, { get: function (o, k) {
            if (k === 'touches' || k === 'changedTouches' || k === 'targetTouches') return pTouchList(o[k]);
            var v = o[k]; return typeof v === 'function' ? v.bind(o) : v;
          }});
        }
        var p = rxy(e.clientX, e.clientY);
        return new Proxy(e, { get: function (o, k) {
          if (k === 'clientX' || k === 'x' || k === 'pageX' || k === 'screenX') return p.x;
          if (k === 'clientY' || k === 'y' || k === 'pageY' || k === 'screenY') return p.y;
          var v = o[k]; return typeof v === 'function' ? v.bind(o) : v;
        }});
      }
      var _add = c.addEventListener.bind(c);
      c.addEventListener = function (type, fn, opts) {
        if (REMAP[type]) { _add(type, function (e) { fn.call(this, pEvent(e)); }, opts); }
        else { _add(type, fn, opts); }
      };
    }
    var _c = document.getElementById('GameCanvas');
    if (_c) { patchCanvas(_c); }
    else {
      var _mo = new MutationObserver(function () {
        var c = document.getElementById('GameCanvas');
        if (c) { _mo.disconnect(); patchCanvas(c); }
      });
      _mo.observe(document.documentElement, { childList: true, subtree: true });
    }
  })();

  if (screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('landscape-primary').catch(function () {});
  }

  var _splashHidden = false;
  var _hideScheduled = false;
  var _progressTimer = 0;
  var _fallbackHideTimer = 0;

  // ── Re-entry fix ──────────────────────────────────────────────────────────────
  // DevVit keeps the WebView alive between sessions. If the user was away for
  // >3 s after the game fully loaded, force a fresh reload on return so the game
  // starts in a clean state instead of a stale/paused one.
  var _hiddenAt = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      _hiddenAt = Date.now();
    } else if (_hiddenAt > 0 && _splashHidden && (Date.now() - _hiddenAt) > 3000) {
      location.reload();
    } else {
      _hiddenAt = 0;
    }
  });
  // iOS back-forward cache (bfcache) — the page is served from memory without
  // re-running scripts. Always force a real reload in that case.
  window.addEventListener('pageshow', function (e) {
    if (e && e.persisted) location.reload();
  });
  // DevVit "Play Now" sends WEBVIEW_REMOUNTED each time the button is pressed.
  // If the splash was already dismissed (game was running), reload for a clean start.
  // Messages from DevVit arrive either direct or wrapped in a devvit-message envelope.
  window.addEventListener('message', function (e) {
    var d = e && e.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'devvit-message' && d.data && d.data.message) d = d.data.message;
    if (d.type === 'WEBVIEW_REMOUNTED' && _splashHidden) {
      location.reload();
    }
  });

  function byId(id) {
    return document.getElementById(id);
  }

  function mountSplash() {
    if (byId('boot-splash')) return;
    var wrap = document.createElement('div');
    wrap.id = 'boot-splash';
    wrap.innerHTML =
      '<div class="boot-splash__panel">' +
      '  <div class="boot-splash__title">Granny vs Robot</div>' +
      '  <div class="boot-splash__sub">加载游戏资源中，请稍候...</div>' +
      '  <div class="boot-splash__bar"><div id="boot-splash-fill" class="boot-splash__fill"></div></div>' +
      '  <div id="boot-splash-pct" class="boot-splash__pct">0%</div>' +
      '  <div id="boot-splash-notice" class="boot-splash__notice"></div>' +
      '</div>';
    var host = byId('GameDiv') || document.body;
    host.appendChild(wrap);
  }

  function setSplashText(text) {
    var sub = document.querySelector('.boot-splash__sub');
    if (sub) sub.textContent = text;
  }

  function setSplashProgress(pct) {
    var p = Math.max(0, Math.min(100, Math.round(pct)));
    var fill = byId('boot-splash-fill');
    var label = byId('boot-splash-pct');
    if (fill) fill.style.width = p + '%';
    if (label) label.textContent = p + '%';
  }

  function startSplashProgress() {
    var pct = 0;
    setSplashProgress(0);
    _progressTimer = window.setInterval(function () {
      if (_splashHidden) return;
      var step = pct < 35 ? 4.5 : pct < 70 ? 2.2 : pct < 90 ? 0.8 : 0.12;
      pct = Math.min(99, pct + step);
      setSplashProgress(pct);
    }, 220);
  }

  function hideSplash() {
    if (_splashHidden) return;
    _splashHidden = true;
    clearInterval(_progressTimer);
    clearTimeout(_fallbackHideTimer);
    setSplashProgress(100);
    var splash = byId('boot-splash');
    if (!splash) return;
    splash.classList.add('boot-splash--fade');
    setTimeout(function () {
      if (splash.parentNode) splash.parentNode.removeChild(splash);
    }, 420);
  }

  window._hideSplash = function () {
    if (_splashHidden || _hideScheduled) return;
    _hideScheduled = true;
    setTimeout(hideSplash, 800);
  };

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

  mountSplash();
  try {
    var _slg = localStorage.getItem('kingshit.lang');
    var _blg = (navigator.language || '').toLowerCase();
    var _lng = (_slg === 'zh' || _slg === 'en') ? _slg : (_blg.indexOf('zh') === 0 ? 'zh' : 'en');
    var _ntc = _lng === 'zh' ? '\u9996\u6b21\u52a0\u8f7d\u53ef\u80fd\u9700\u8981\u8f83\u957f\u65f6\u95f4\uff0c\u8bf7\u8010\u5fc3\u7b49\u5f85' : 'First load may take a while \u2014 please be patient';
    var _nel = document.getElementById('boot-splash-notice');
    if (_nel) _nel.textContent = _ntc;
  } catch (_e) {}
  startSplashProgress();

  var gameCanvas = document.getElementById('GameCanvas');
  if (gameCanvas) {
    gameCanvas.addEventListener('contextmenu', function (event) {
      event.preventDefault();
    });
  }

  if (typeof System === 'undefined') {
    appendError('SystemJS is unavailable');
    setSplashText('运行环境初始化失败，请重试。');
    return;
  }

  System.import('./index.js')
    .then(function () {
      _fallbackHideTimer = setTimeout(function () {
        if (!_splashHidden) hideSplash();
      }, 25000);
    })
    .catch(function (err) {
      appendError('[System.import] ' + String(err && err.stack ? err.stack : err));
      console.error(err);
      setSplashText('加载失败，请重试。');
    });
})();
EOF

  cat > "$boot_css_file" <<'BOOTCSS'
#boot-splash {
  position: fixed;
  inset: 0;
  z-index: 2147482000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at 30% 20%, #1f2d4f 0%, #0f1423 60%, #0a0f1b 100%);
  opacity: 1;
  transition: opacity 0.36s ease;
}

#boot-splash.boot-splash--fade {
  opacity: 0;
  pointer-events: none;
}

.boot-splash__panel {
  width: min(88vw, 420px);
  padding: 24px 22px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(0, 0, 0, 0.36);
  backdrop-filter: blur(3px);
  text-align: center;
  color: #f4f6ff;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.boot-splash__title {
  font-weight: 800;
  font-size: 22px;
  letter-spacing: 0.02em;
  margin-bottom: 8px;
  color: #ffd47a;
}

.boot-splash__sub {
  font-size: 13px;
  color: rgba(240, 244, 255, 0.85);
  margin-bottom: 14px;
}

.boot-splash__bar {
  width: 100%;
  height: 10px;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.18);
}

.boot-splash__fill {
  width: 0%;
  height: 100%;
  background: linear-gradient(90deg, #f5b840 0%, #ffe49d 100%);
  transition: width 0.2s ease;
}

.boot-splash__pct {
  margin-top: 8px;
  margin-bottom: 14px;
  font-size: 12px;
  color: rgba(240, 244, 255, 0.85);
}

.boot-splash__notice {
  margin-top: 4px;
  font-size: 11px;
  color: rgba(240, 244, 255, 0.65);
  text-align: center;
  min-height: 16px;
}

.boot-splash__retry {
  display: none;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
  height: 36px;
  padding: 0 16px;
  border: 0;
  border-radius: 8px;
  background: #f5b840;
  color: #111722;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
}
BOOTCSS

  # Write orientation-fix.js:
  # - Keep DOM intervention minimal so Cocos can manage orientation/rotation itself.
  # - Request immersive mode in supported Devvit clients.
  local orient_file="${webroot}/orientation-fix.js"
  cat > "$orient_file" <<'ORIENTEOF'
(function () {
  var DEFAULT_VIEWPORT =
    'width=device-width,user-scalable=no,initial-scale=1,minimum-scale=1,maximum-scale=1,viewport-fit=cover';
  var DEVVIT_INTERNAL_MESSAGE = 'devvit-internal';
  var CLIENT_SCOPE = 0;
  var IMMERSIVE_MODE = 2;
  var DESIGN_WIDTH = 1280;
  var DESIGN_HEIGHT = 720;
  var requestedImmersive = false;
  var appliedCocosOverrides = false;

  function lockLandscape() {
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('landscape-primary').catch(function () {});
    }
  }

  function requestImmersiveMode() {
    if (requestedImmersive) return;
    requestedImmersive = true;
    try {
      window.parent.postMessage(
        {
          type: DEVVIT_INTERNAL_MESSAGE,
          scope: CLIENT_SCOPE,
          immersiveMode: { immersiveMode: IMMERSIVE_MODE },
        },
        '*'
      );
    } catch (_err) {
      // Ignore; older clients may not support immersive mode requests.
    }
  }

  function getViewportMeta() {
    return document.querySelector('meta[name="viewport"]');
  }

  function setViewport(content) {
    var meta = getViewportMeta();
    if (meta && meta.getAttribute('content') !== content) {
      meta.setAttribute('content', content);
    }
  }

  function normalizeRootBase() {
    var html = document.documentElement;
    var body = document.body;
    html.style.margin = '0';
    html.style.padding = '0';
    html.style.touchAction = 'none';
    html.style.overflow = 'hidden';
    html.style.background = '#000';
    html.style.width = '100%';
    html.style.height = '100%';
    html.style.position = 'relative';
    if (body) {
      body.style.margin = '0';
      body.style.padding = '0';
      body.style.touchAction = 'none';
      body.style.overflow = 'hidden';
      body.style.background = '#000';
      body.style.width = '100%';
      body.style.height = '100%';
      body.style.position = 'absolute';
      body.style.left = '0';
      body.style.top = '0';
    }
  }

  function maybeApplyCocosOverrides() {
    if (appliedCocosOverrides) return;
    var cc = window.cc;
    if (!cc || !cc.view || !cc.macro || !cc.ResolutionPolicy) return;

    try {
      if (cc.macro.ORIENTATION_LANDSCAPE !== undefined) {
        cc.view.setOrientation(cc.macro.ORIENTATION_LANDSCAPE);
      }
      if (cc.ResolutionPolicy.FIXED_HEIGHT !== undefined) {
        cc.view.setDesignResolutionSize(
          DESIGN_WIDTH,
          DESIGN_HEIGHT,
          cc.ResolutionPolicy.FIXED_HEIGHT
        );
      }
      cc.view.resizeWithBrowserSize(true);
      appliedCocosOverrides = true;
    } catch (_err) {
      // Retry later if engine isn't fully initialized yet.
    }
  }

  function apply() {
    setViewport(DEFAULT_VIEWPORT);
    lockLandscape();
    requestImmersiveMode();
    normalizeRootBase();
    maybeApplyCocosOverrides();
  }

  function setup() {
    var raf = 0;
    var schedule = function () {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () {
        apply();
      });
    };

    schedule();
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('orientationchange', schedule, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', schedule, { passive: true });
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', schedule, { once: true });
    }
    setTimeout(schedule, 80);
    setTimeout(schedule, 260);
    setTimeout(schedule, 800);
    setTimeout(schedule, 1600);
    setTimeout(schedule, 2600);
  }

  setup();
})();
ORIENTEOF

  # Remove inline contextmenu handler attribute on canvas.
  perl -0pi -e 's/\s+oncontextmenu="event\.preventDefault\(\)"//g' "$index_file"
  # Avoid exact-fit non-uniform stretch in Reddit portrait-host WebView.
  perl -0pi -e 's/\bcc_exact_fit_screen="true"/cc_exact_fit_screen="false"/g' "$index_file"

  local settings_file="${webroot}/src/settings.json"
  if [ -f "$settings_file" ]; then
    perl -0pi -e 's/"exactFitScreen":true/"exactFitScreen":false/g' "$settings_file"
    perl -0pi -e 's/"orientation":"auto"/"orientation":"landscape"/g' "$settings_file"
    perl -0pi -e 's/"orientation":"portrait"/"orientation":"landscape"/g' "$settings_file"
    perl -0pi -e 's/"designResolution"\s*:\s*\{([^{}]*?)"policy"\s*:\s*\d+/"designResolution":{$1"policy":0/s' "$settings_file"
    perl -0pi -e 's/"splashScreen"\s*:\s*\{([^{}]*?)"totalTime"\s*:\s*\d+/"splashScreen":{$1"totalTime":0/s' "$settings_file"
  fi

  # Do not duplicate homepage.webp into webroot root.
  # Post card background uses the already bundled Cocos resource:
  # assets/resources/native/43/43df4bfb-9353-4896-bd99-3c6cda36e111.webp

  # Inject splash markup inside GameDiv so it follows forced-landscape transform on mobile webviews.
  perl -0pi -e 's#(<div\s+id="GameDiv"[^>]*>)#$1\n  <div id="boot-splash">\n    <div class="boot-splash__panel">\n      <div class="boot-splash__title">Granny vs Robot</div>\n      <div class="boot-splash__sub">Loading game assets...</div>\n      <div class="boot-splash__bar"><div id="boot-splash-fill" class="boot-splash__fill"></div></div>\n      <div id="boot-splash-pct" class="boot-splash__pct">0%</div>\n      <div id="boot-splash-notice" class="boot-splash__notice"></div>\n      <button id="boot-splash-retry" class="boot-splash__retry">Reload</button>\n    </div>\n  </div>#i' "$index_file"

  # Replace the Cocos inline boot script with an external boot.js reference.
  perl -0pi -e 's#<script>\s*System\.import\(\s*["\047]\./index\.js["\047]\s*\).*?</script>#<script src="boot.js" charset="utf-8"></script>#gs' "$index_file"

  # Inject orientation-fix.js and boot.css in head.
  perl -0pi -e 's#(<head[^>]*>)#$1\n  <script src="orientation-fix.js" charset="utf-8"></script>\n  <link rel="stylesheet" type="text/css" href="boot.css" />#i' "$index_file"

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
ALLOW_STALE_SOURCE_BUILD=0
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
  --allow-stale-source-build        Allow packaging stale source-build-dir when newer source files exist.
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
    --allow-stale-source-build) ALLOW_STALE_SOURCE_BUILD=1 ;;
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
  log "Running headless Cocos build..."
  BUILD_STARTED_AT="$(date +%s)"
  set +e
  "$COCOS_CREATOR" --project "$ROOT_DIR" --build "$BUILD_OPT_BASE"
  COCOS_EXIT_CODE=$?
  set -e
  if [ "$COCOS_EXIT_CODE" -ne 0 ]; then
    warn "Cocos build exited non-zero (${COCOS_EXIT_CODE}). Verifying whether fresh output was still produced..."
    CHECK_BUILD_DIR="$SOURCE_BUILD_DIR"
    if [ -z "$CHECK_BUILD_DIR" ]; then
      CHECK_BUILD_DIR="$(latest_index_html_dir)"
    fi
    if [ -n "$CHECK_BUILD_DIR" ] && [ "${CHECK_BUILD_DIR#/}" = "$CHECK_BUILD_DIR" ]; then
      CHECK_BUILD_DIR="${ROOT_DIR}/${CHECK_BUILD_DIR#./}"
    fi
    if [ -n "$CHECK_BUILD_DIR" ] && [ -f "$CHECK_BUILD_DIR/index.html" ]; then
      CHECK_BUILD_MTIME="$(file_mtime "$CHECK_BUILD_DIR/index.html")"
      if [ "$CHECK_BUILD_MTIME" -ge $((BUILD_STARTED_AT - 2)) ]; then
        warn "Detected fresh build output at $CHECK_BUILD_DIR/index.html (mtime=${CHECK_BUILD_MTIME}). Continuing."
      else
        die "Cocos build failed and no fresh output was generated in $CHECK_BUILD_DIR."
      fi
    else
      die "Cocos build failed and source build dir is unavailable. Please check Cocos build logs."
    fi
  fi
fi

if [ -z "$SOURCE_BUILD_DIR" ]; then
  SOURCE_BUILD_DIR="$(latest_index_html_dir)"
fi
[ -n "$SOURCE_BUILD_DIR" ] || die "Could not detect build output. Pass --source-build-dir explicitly."

if [ "${SOURCE_BUILD_DIR#/}" = "$SOURCE_BUILD_DIR" ]; then
  SOURCE_BUILD_DIR="${ROOT_DIR}/${SOURCE_BUILD_DIR#./}"
fi
[ -f "$SOURCE_BUILD_DIR/index.html" ] || die "index.html not found in source build dir: $SOURCE_BUILD_DIR"
if [ "$SKIP_COCOS_BUILD" -eq 1 ]; then
  validate_source_build_freshness "$SOURCE_BUILD_DIR" "$ALLOW_STALE_SOURCE_BUILD"
fi

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
