#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() {
  printf "[tiktok-native-build] %s\n" "$*"
}

warn() {
  printf "[tiktok-native-build][warn] %s\n" "$*" >&2
}

die() {
  printf "[tiktok-native-build][error] %s\n" "$*" >&2
  exit 1
}

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

ensure_dir() {
  [ -d "$1" ] || mkdir -p "$1"
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

file_mtime() {
  local file="$1"
  if stat -f %m "$file" >/dev/null 2>&1; then
    stat -f %m "$file"
  else
    stat -c %Y "$file"
  fi
}

latest_game_json_dir() {
  local latest_file=""
  local latest_time=0
  while IFS= read -r -d '' f; do
    local mt
    mt="$(file_mtime "$f")"
    if [ "$mt" -gt "$latest_time" ]; then
      latest_time="$mt"
      latest_file="$f"
    fi
  done < <(find "$ROOT_DIR/build" -type f -name "game.json" -print0 2>/dev/null || true)

  if [ -n "$latest_file" ]; then
    dirname "$latest_file"
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

detect_default_start_scene() {
  local preferred="${ROOT_DIR}/assets/scene.scene"
  if [ -f "$preferred" ]; then
    printf "%s" "db://assets/scene.scene"
    return 0
  fi

  local first_scene=""
  first_scene="$(find "${ROOT_DIR}/assets" -type f -name "*.scene" -print 2>/dev/null | head -n 1 || true)"
  if [ -n "$first_scene" ]; then
    local rel="${first_scene#${ROOT_DIR}/}"
    printf "%s" "db://${rel}"
    return 0
  fi

  return 1
}

split_runtime_to_subpackage() {
  local package_dir="$1"
  local subpackage_name="$2"
  local subpackage_root="${package_dir}/subpackages/${subpackage_name}"
  local moved_any=0

  ensure_dir "$subpackage_root"

  local runtime_items=(
    "application.js"
    "engine-adapter.js"
    "web-adapter.js"
    "src"
    "assets"
    "cocos-js"
    "game.js"
  )

  for item in "${runtime_items[@]}"; do
    if [ -e "${package_dir}/${item}" ]; then
      mv "${package_dir}/${item}" "${subpackage_root}/"
      moved_any=1
    fi
  done

  [ "$moved_any" -eq 1 ] || die "No runtime files found to move into subpackage."
  [ -f "${subpackage_root}/game.js" ] || die "Missing runtime entry after split: ${subpackage_root}/game.js"

  # Keep settings path explicit after moving to subpackage.
  if [ -f "${subpackage_root}/application.js" ]; then
    perl -0pi -e "s#this\\.settingsPath = 'src/settings\\.json';#this.settingsPath = 'subpackages/${subpackage_name}/src/settings.json';#g; s#this\\.settingsPath = \\\"src/settings\\.json\\\";#this.settingsPath = \\\"subpackages/${subpackage_name}/src/settings.json\\\";#g" \
      "${subpackage_root}/application.js"
  fi

  # Patch subpackage entry path normalization to prevent duplicated prefixes like:
  # subpackages/gamecore/subpackages/gamecore/src/...
  if [ -f "${subpackage_root}/game.js" ]; then
    perl -0pi -e "s#const v = String\\(urlNoSchema \\|\\| ''\\);#const v0 = String(urlNoSchema || '');\\n        const subPrefix = 'subpackages/${subpackage_name}/';\\n        const v = v0.indexOf(subPrefix) === 0 ? v0.slice(subPrefix.length) : v0;#g" \
      "${subpackage_root}/game.js"
  fi

  # Lightweight landscape patch for TikTok runtime:
  # - no WebGL/FBO hooks
  # - only orientation API + system info/canvas dimension normalization
  # NOTE: when FBO mode is enabled we skip LS-LITE entirely to avoid conflicts.
  if [ "${ENABLE_EXPERIMENTAL_FBO_ROTATION_PATCH}" -eq 0 ] && [ -f "${subpackage_root}/game.js" ]; then
    SUBPACKAGE_GAME_JS="${subpackage_root}/game.js" node <<'NODE'
const fs = require('fs');
const gameJsPath = process.env.SUBPACKAGE_GAME_JS;
let source = fs.readFileSync(gameJsPath, 'utf8');

const litePrePatch = `
// [LS-LITE] lightweight landscape pre-patch (safe mode)
(function _gvrLandscapeLitePrePatch() {
    try {
        var _tt = (typeof tt !== 'undefined' && tt) ? tt : null;
        var _ttMinis = (typeof TTMinis !== 'undefined' && TTMinis && TTMinis.game) ? TTMinis.game : null;
        var _hosts = [];
        if (_tt) _hosts.push({ name: 'tt', api: _tt });
        if (_ttMinis && _ttMinis !== _tt) _hosts.push({ name: 'TTMinis.game', api: _ttMinis });

        var _orientationPayloads = [{ value: 'landscape' }, { orientation: 'landscape' }, { direction: 'landscape' }];
        var _orientationFns = ['setDeviceOrientation', 'setScreenOrientation', 'setGameOrientation'];
        var _orientationRounds = [0, 80, 240, 800];
        var _triedSig = {};
        var _foundOrientationFn = false;
        var _callOrientationOnce = function(roundTag) {
            for (var h = 0; h < _hosts.length; h += 1) {
                var hostName = _hosts[h].name;
                var hostApi = _hosts[h].api;
                for (var i = 0; i < _orientationFns.length; i += 1) {
                    var fnName = _orientationFns[i];
                    var fn = hostApi && hostApi[fnName];
                    if (typeof fn !== 'function') continue;
                    _foundOrientationFn = true;
                    for (var j = 0; j < _orientationPayloads.length; j += 1) {
                        var payloadBase = _orientationPayloads[j];
                        var sig = hostName + ':' + fnName + ':' + j;
                        try {
                            var payload = Object.assign({}, payloadBase, {
                                success: function() {},
                                fail: function() {}
                            });
                            var ret = fn.call(hostApi, payload);
                            if (!_triedSig[sig]) {
                                console.log('[LS-LITE][ORIENT] ' + roundTag + ' ok ' + hostName + '.' + fnName
                                    + ' payload=' + JSON.stringify(payloadBase));
                                _triedSig[sig] = 1;
                            }
                            if (ret && typeof ret.then === 'function') {
                                (function(_sig, _hn, _fn, _pb) {
                                    ret.then(function() {
                                        if (!_triedSig[_sig + ':then']) {
                                            console.log('[LS-LITE][ORIENT] promise ok ' + _hn + '.' + _fn
                                                + ' payload=' + JSON.stringify(_pb));
                                            _triedSig[_sig + ':then'] = 1;
                                        }
                                    }).catch(function(err) {
                                        console.log('[LS-LITE][ORIENT] promise fail ' + _hn + '.' + _fn
                                            + ' payload=' + JSON.stringify(_pb)
                                            + ' err=' + (err && err.message ? err.message : err));
                                    });
                                })(sig, hostName, fnName, payloadBase);
                            }
                            break;
                        } catch (_e5) {
                            if (!_triedSig[sig + ':err']) {
                                console.log('[LS-LITE][ORIENT] ' + roundTag + ' err ' + hostName + '.' + fnName
                                    + ' payload=' + JSON.stringify(payloadBase)
                                    + ' err=' + (_e5 && _e5.message ? _e5.message : _e5));
                                _triedSig[sig + ':err'] = 1;
                            }
                        }
                    }
                }
            }
            try {
                var s = _tt && typeof _tt.getSystemInfoSync === 'function' ? _tt.getSystemInfoSync() : null;
                if (s) {
                    console.log('[LS-LITE][SYS] ' + roundTag + ' sw=' + s.screenWidth + ' sh=' + s.screenHeight
                        + ' ww=' + s.windowWidth + ' wh=' + s.windowHeight
                        + ' ori=' + (s.deviceOrientation || 'n/a'));
                }
            } catch (_e6) {}
        };

        for (var r = 0; r < _orientationRounds.length; r += 1) {
            (function(delayMs) {
                try {
                    if (delayMs === 0) {
                        _callOrientationOnce('t0');
                    } else if (typeof setTimeout === 'function') {
                        setTimeout(function() { _callOrientationOnce('t+' + delayMs); }, delayMs);
                    }
                } catch (_e7) {}
            })(_orientationRounds[r]);
        }

        if (_hosts.length === 0) {
            console.log('[LS-LITE][ORIENT] no host api (tt/TTMinis.game missing)');
        } else if (!_foundOrientationFn) {
            console.log('[LS-LITE][ORIENT] no orientation functions on host');
        }

        try {
            if (_tt && typeof _tt.onWindowResize === 'function' && !_tt.__gvrLsResizeLogPatched) {
                _tt.onWindowResize(function(res) {
                    try {
                        console.log('[LS-LITE][RESIZE] ww=' + res.windowWidth + ' wh=' + res.windowHeight
                            + ' sw=' + res.screenWidth + ' sh=' + res.screenHeight);
                    } catch (_e8) {}
                });
                _tt.__gvrLsResizeLogPatched = true;
            }
        } catch (_e9) {}

        if (typeof GameGlobal !== 'undefined' && GameGlobal) {
            GameGlobal.__gvrLandscapeLite = 1;
            GameGlobal.__gvrTargetLandscape = 1;
            GameGlobal.__gvrOrientationApiAvailable = _foundOrientationFn ? 1 : 0;
        }
        console.log('[LS-LITE] pre-patch enabled');
    } catch (e) {
        console.log('[LS-LITE] pre-patch error: ' + (e && e.message ? e.message : e));
    }
})();
`;

const liteCanvasPatch = `
// [LS-LITE] canvas orientation patch (safe mode)
(function _gvrLandscapeLiteCanvasPatch() {
    try {
        if (typeof canvas === 'undefined' || !canvas) return;
        var w = Number(canvas.width || 0);
        var h = Number(canvas.height || 0);
        var _sys = null;
        try {
            if (typeof tt !== 'undefined' && tt && typeof tt.getSystemInfoSync === 'function') {
                _sys = tt.getSystemInfoSync() || null;
            }
        } catch (_e0) {}
        var shouldLandscape = !!(_sys && Number(_sys.windowWidth || _sys.screenWidth || 0) >= Number(_sys.windowHeight || _sys.screenHeight || 0));
        if (w > 0 && h > 0 && w < h && shouldLandscape) {
            canvas.width = h;
            canvas.height = w;
            console.log('[LS-LITE] canvas swapped to ' + canvas.width + 'x' + canvas.height);
        } else {
            console.log('[LS-LITE] canvas keep ' + w + 'x' + h + ' shouldLandscape=' + (shouldLandscape ? 1 : 0));
        }
    } catch (e) {
        console.log('[LS-LITE] canvas patch error: ' + (e && e.message ? e.message : e));
    }
})();
`;

if (!source.includes('_gvrLandscapeLitePrePatch') && source.includes('loadCC();')) {
    source = source.replace('loadCC();', `${litePrePatch}\nloadCC();`);
}

if (!source.includes('_gvrLandscapeLiteCanvasPatch') && source.includes("require('./web-adapter');")) {
    source = source.replace("require('./web-adapter');", `require('./web-adapter');${liteCanvasPatch}`);
}

// Replace legacy IOS swap block that can revert LS-LITE landscape back to portrait
// when `screen.width/height` is stale in TikTok runtime.
const legacyCanvasAdaptPattern = /\/\/ Adapt for IOS, swap if opposite[\s\S]*?canvas\.height = _h;\s*\n\s*\}/s;
if (legacyCanvasAdaptPattern.test(source)) {
    const safeCanvasAdapt = `// Adapt canvas orientation using runtime system info
    if (canvas){
        var _targetLandscape = (canvas.width >= canvas.height);
        try {
            if (typeof tt !== 'undefined' && tt && typeof tt.getSystemInfoSync === 'function') {
                var _sys = tt.getSystemInfoSync() || {};
                var _sw = Number(_sys.screenWidth || _sys.windowWidth || 0);
                var _sh = Number(_sys.screenHeight || _sys.windowHeight || 0);
                if (_sw > 0 && _sh > 0) _targetLandscape = _sw >= _sh;
            }
        } catch (_e6) {}

        var _isLandscapeCanvas = canvas.width >= canvas.height;
        if (_targetLandscape !== _isLandscapeCanvas) {
            var _tmp = canvas.width;
            canvas.width = canvas.height;
            canvas.height = _tmp;
            console.log('[LS-LITE] canvas adapted to ' + (_targetLandscape ? 'landscape' : 'portrait')
                + ' ' + canvas.width + 'x' + canvas.height);
        }
    }`;
    source = source.replace(legacyCanvasAdaptPattern, safeCanvasAdapt);
}

fs.writeFileSync(gameJsPath, source);
NODE
  fi

  # Experimental FBO rotation patch (landscape fallback for runtimes without
  # orientation APIs). In our TikTok device chain this is the only reliable
  # way to force landscape rendering.
  if [ "${ENABLE_EXPERIMENTAL_FBO_ROTATION_PATCH}" -eq 1 ] && [ -f "${subpackage_root}/game.js" ]; then
    log "Applying FBO V2 minimal rotation patch..."
    node "${ROOT_DIR}/scripts/fbo_patch_v2.js" "${subpackage_root}/game.js"
  elif [ -f "${subpackage_root}/game.js" ]; then
    log "FBO rotation patch disabled (stable mode)"
  fi


  # Some TikTok runtime builds occasionally fail to hydrate assets.subpackages from settings
  # and fall back to root assets/<bundle>/config.json lookups.
  # Force a stable fallback map for deferred resources subpackage in engine adapter.
  if [ "$ENABLE_DEFERRED_RESOURCES_SPLIT" -eq 1 ] && [ -f "${subpackage_root}/engine-adapter.js" ]; then
    ENGINE_ADAPTER_PATH="${subpackage_root}/engine-adapter.js" DEFERRED_SUBPACKAGE_NAME="${DEFERRED_RESOURCES_SUBPACKAGE_NAME}" node <<'NODE'
const fs = require('fs');

const engineAdapterPath = process.env.ENGINE_ADAPTER_PATH;
const deferredSubpackageName = process.env.DEFERRED_SUBPACKAGE_NAME || 'resources';
const source = fs.readFileSync(engineAdapterPath, 'utf8');

const marker = `m.${deferredSubpackageName}||(m.${deferredSubpackageName}="subpackages/${deferredSubpackageName}")`;
if (source.includes(marker)) {
  process.exit(0);
}

const target =
  'e=cc.settings.querySettings("assets","subpackages");e&&e.forEach(function(e){return m[e]="subpackages/".concat(e)}),l.init()';
if (!source.includes(target)) {
  console.warn(`[tiktok-native-build][warn] engine-adapter subpackage fallback patch target not found: ${engineAdapterPath}`);
  process.exit(0);
}

const patched = source.replace(
  target,
  `e=cc.settings.querySettings("assets","subpackages");e&&e.forEach(function(e){return m[e]="subpackages/".concat(e)}),${marker},l.init()`
);
fs.writeFileSync(engineAdapterPath, patched);
NODE
  fi

  # Keep settings internals subpackage-local (do not prepend subpackage root).
  local settings_path="${subpackage_root}/src/settings.json"
  if [ -f "${settings_path}" ]; then
    SETTINGS_PATH="${settings_path}" node <<'NODE'
const fs = require('fs');
const settingsPath = process.env.SETTINGS_PATH;
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

if (settings.rendering && typeof settings.rendering === 'object') {
  const effectPath = settings.rendering.effectSettingsPath;
  if (typeof effectPath === 'string') {
    // Keep as src/* so it resolves relative to subpackage entry context.
    settings.rendering.effectSettingsPath = effectPath.replace(/^subpackages\/[^/]+\/src\//, 'src/');
  }
}

if (settings.scripting && Array.isArray(settings.scripting.scriptPackages)) {
  settings.scripting.scriptPackages = settings.scripting.scriptPackages.map((pkg) => {
    if (typeof pkg !== 'string') return pkg;
    // Keep as project://src/* so loader resolves in subpackage context.
    if (pkg.startsWith('project://subpackages/')) {
      return pkg.replace(/^project:\/\/subpackages\/[^/]+\/src\//, 'project://src/');
    }
    return pkg;
  });
}

if (!settings.screen || typeof settings.screen !== 'object') {
  settings.screen = {};
}
settings.screen.orientation = 'landscape';

// Disable Cocos splash screen for TikTok — FBO rotation makes it display wrong orientation.
// Our own LoadingScreen takes over instead.
if (settings.splashScreen && typeof settings.splashScreen === 'object') {
  settings.splashScreen.totalTime = 0;
  console.log('[tiktok-native-build] Splash screen disabled (totalTime=0)');
}

fs.writeFileSync(settingsPath, `${JSON.stringify(settings)}\n`);
NODE
  fi

  # Some engine code resolves effect.bin from root "src/*" even when runtime is in subpackage.
  # Mirror only effect.bin to keep main package small while avoiding path resolution failures.
  if [ -f "${subpackage_root}/src/effect.bin" ]; then
    ensure_dir "${package_dir}/src"
    cp -f "${subpackage_root}/src/effect.bin" "${package_dir}/src/effect.bin"
  fi

  # Text compatibility fallback:
  # Keep only lightweight font-name normalization. Do not rewrite item icon symbols
  # to ASCII letters, otherwise UI will show W/!/F/U/S instead of intended icons.
  for text_js in \
    "${subpackage_root}/assets/main/index.js" \
    "${subpackage_root}/game.pack.js"; do
    if [ -f "${text_js}" ]; then
      perl -CSDA -Mutf8 -0pi -e "s/Arial Black/Arial/g;" "${text_js}"
    fi
  done

  # Runtime wasm/bin assets are resolved by engine with root-style paths (cocos-js/assets/*).
  # Mirror the tiny assets dir into root to avoid resolution failures after subpackage split.
  if [ -d "${subpackage_root}/cocos-js/assets" ]; then
    ensure_dir "${package_dir}/cocos-js"
    rm -rf "${package_dir}/cocos-js/assets"
    cp -a "${subpackage_root}/cocos-js/assets" "${package_dir}/cocos-js/assets"
  fi

  # Some engine bundle lookups still use root-style paths for builtin/main bundles.
  # Mirror internal/main bundles to root assets to keep startup stable in DevTool.
  if [ -d "${subpackage_root}/assets/internal" ] || [ -d "${subpackage_root}/assets/main" ]; then
    ensure_dir "${package_dir}/assets"
    if [ -d "${subpackage_root}/assets/internal" ]; then
      rm -rf "${package_dir}/assets/internal"
      cp -a "${subpackage_root}/assets/internal" "${package_dir}/assets/internal"
    fi
    if [ -d "${subpackage_root}/assets/main" ]; then
      rm -rf "${package_dir}/assets/main"
      cp -a "${subpackage_root}/assets/main" "${package_dir}/assets/main"
    fi
  fi

  cat > "${package_dir}/game.js" <<EOF_JS
(function () {
  var SUBPACKAGE_NAME = '${subpackage_name}';
  var API_BASE = '${TIKTOK_API_BASE}';
  var ENTRY_CANDIDATES = [
    'subpackages/${subpackage_name}/game.js',
    './subpackages/${subpackage_name}/game.js'
  ];
  var started = false;
  var retryCount = 0;
  var maxRetry = 5;

  function launchEntryOnce() {
    var lastErr = null;
    for (var i = 0; i < ENTRY_CANDIDATES.length; i += 1) {
      var entry = ENTRY_CANDIDATES[i];
      try {
        require(entry);
        return true;
      } catch (e) {
        lastErr = e;
      }
    }

    // DevTool may pack modules into *.pack.js; load it as a fallback and retry.
    try {
      require('subpackages/${subpackage_name}/game.pack.js');
      require('subpackages/${subpackage_name}/game.js');
      return true;
    } catch (e2) {
      if (!lastErr) lastErr = e2;
    }

    if (retryCount < maxRetry) {
      retryCount += 1;
      setTimeout(launch, 400);
      return false;
    }

    console.error('[tiktok-native-build] launch failed after retries:', lastErr);
    return false;
  }

  function exposePlatform() {
    try {
      if (typeof globalThis !== 'undefined') {
        globalThis.__GVR_PLATFORM__ = 'tiktok';
        if (API_BASE) {
          globalThis.__GVR_TIKTOK_API_BASE__ = API_BASE;
        }
      }
      if (typeof window !== 'undefined') {
        window.__GVR_PLATFORM__ = 'tiktok';
        if (API_BASE) {
          window.__GVR_TIKTOK_API_BASE__ = API_BASE;
        }
      }
      if (API_BASE) {
        console.log('[BOOT][API_BASE] ' + API_BASE);
      }
    } catch (_e) {}
  }

  function _gvrBase64EncodeUtf8(input) {
    try {
      if (typeof btoa === 'function') {
        var bytes = encodeURIComponent(String(input || '')).replace(
          /%([0-9A-F]{2})/g,
          function(_m, p1) { return String.fromCharCode(parseInt(p1, 16)); }
        );
        return btoa(bytes);
      }
    } catch (_e0) {}
    try {
      if (typeof Buffer !== 'undefined' && Buffer && typeof Buffer.from === 'function') {
        return Buffer.from(String(input || ''), 'utf8').toString('base64');
      }
    } catch (_e1) {}
    return '';
  }

  function _gvrReadStorage(host, key) {
    try {
      if (host && typeof host.getStorageSync === 'function') {
        var v = host.getStorageSync(key);
        if (typeof v === 'string') return v;
        if (v && typeof v === 'object' && typeof v.data === 'string') return v.data;
        if (v !== undefined && v !== null) return String(v);
      }
    } catch (_e) {}
    try {
      if (typeof localStorage !== 'undefined' && localStorage) {
        var lv = localStorage.getItem(key);
        if (typeof lv === 'string' && lv) return lv;
      }
    } catch (_e2) {}
    return '';
  }

  function _gvrWriteStorage(host, key, value) {
    try {
      if (host && typeof host.setStorageSync === 'function') {
        host.setStorageSync(key, String(value || ''));
      }
    } catch (_e) {}
    try {
      if (typeof localStorage !== 'undefined' && localStorage) {
        localStorage.setItem(key, String(value || ''));
      }
    } catch (_e2) {}
  }

  function _gvrExtractProfile(raw) {
    if (!raw || typeof raw !== 'object') return { userId: '', displayName: '', avatarUrl: '' };
    var root = raw;
    var info = root.userInfo && typeof root.userInfo === 'object' ? root.userInfo : root;

    var userId =
      (typeof info.openId === 'string' && info.openId) ||
      (typeof info.openid === 'string' && info.openid) ||
      (typeof info.unionId === 'string' && info.unionId) ||
      (typeof info.unionid === 'string' && info.unionid) ||
      (typeof info.userId === 'string' && info.userId) ||
      (typeof info.uid === 'string' && info.uid) ||
      '';
    var displayName =
      (typeof info.nickName === 'string' && info.nickName) ||
      (typeof info.nick_name === 'string' && info.nick_name) ||
      (typeof info.nickname === 'string' && info.nickname) ||
      (typeof info.userName === 'string' && info.userName) ||
      (typeof info.user_name === 'string' && info.user_name) ||
      (typeof info.screenName === 'string' && info.screenName) ||
      (typeof info.screen_name === 'string' && info.screen_name) ||
      (typeof info.displayName === 'string' && info.displayName) ||
      (typeof info.display_name === 'string' && info.display_name) ||
      (typeof info.name === 'string' && info.name) ||
      '';
    var avatarUrl =
      (typeof info.avatarUrl === 'string' && info.avatarUrl) ||
      (typeof info.avatar === 'string' && info.avatar) ||
      (typeof info.avatar_url === 'string' && info.avatar_url) ||
      '';
    return {
      userId: String(userId || '').trim(),
      displayName: String(displayName || '').trim(),
      avatarUrl: String(avatarUrl || '').trim()
    };
  }

  function _gvrSafeText(input, maxLen) {
    var text = '';
    try { text = String(input || ''); } catch (_e0) {}
    if (text.length > maxLen) return text.slice(0, maxLen) + '...';
    return text;
  }

  function _gvrProfileDebug(raw) {
    if (!raw || typeof raw !== 'object') return 'raw=' + typeof raw;
    var root = raw;
    var info = root.userInfo && typeof root.userInfo === 'object' ? root.userInfo : root;

    var rootKeys = [];
    var infoKeys = [];
    try { rootKeys = Object.keys(root).slice(0, 16); } catch (_e0) {}
    try { infoKeys = Object.keys(info).slice(0, 16); } catch (_e1) {}

    var pick = function(obj, key) {
      var v = obj && obj[key];
      if (typeof v !== 'string' || !v.trim()) return '';
      return key + '=' + _gvrSafeText(v.trim(), 48);
    };

    var fields = [];
    var candidateKeys = [
      'openId','openid','unionId','unionid','userId','uid',
      'nickName','nick_name','nickname','userName','user_name',
      'screenName','screen_name','displayName','display_name','name'
    ];
    for (var i = 0; i < candidateKeys.length; i += 1) {
      var part = pick(info, candidateKeys[i]);
      if (part) fields.push(part);
    }

    return (
      'rootKeys=[' + rootKeys.join(',') + '] ' +
      'infoKeys=[' + infoKeys.join(',') + '] ' +
      'candidates=[' + fields.join(' | ') + ']'
    );
  }

  function _gvrExposeTikTokIdentity(profile, host) {
    var userId = String((profile && profile.userId) || '').trim();
    var displayName = String((profile && profile.displayName) || '').trim();
    var avatarUrl = String((profile && profile.avatarUrl) || '').trim();

    if (!userId) {
      var cachedUid = _gvrReadStorage(host, '__gvr_tiktok_uid_v1');
      if (cachedUid) {
        userId = cachedUid;
      } else {
        userId = 'tt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
        _gvrWriteStorage(host, '__gvr_tiktok_uid_v1', userId);
      }
    }

    if (!displayName) {
      var suffix = userId ? userId.slice(-6) : '';
      displayName = suffix ? ('TikTokPlayer_' + suffix) : 'TikTokPlayer';
    }

    var payload = {
      userId: userId,
      displayName: displayName,
      avatarUrl: avatarUrl || ''
    };
    var token = _gvrBase64EncodeUtf8(JSON.stringify(payload));

    try {
      if (typeof globalThis !== 'undefined') {
        globalThis.__GVR_TIKTOK_USER_ID__ = userId;
        globalThis.__GVR_TIKTOK_USERNAME__ = displayName;
        if (token) globalThis.__GVR_TIKTOK_TOKEN__ = token;
      }
      if (typeof window !== 'undefined') {
        window.__GVR_TIKTOK_USER_ID__ = userId;
        window.__GVR_TIKTOK_USERNAME__ = displayName;
        if (token) window.__GVR_TIKTOK_TOKEN__ = token;
      }
    } catch (_e0) {}

    _gvrWriteStorage(host, '__gvr_tiktok_identity_v1', JSON.stringify(payload));
    console.log('[BOOT][IDENTITY] user=' + userId + ' name=' + displayName + ' token=' + (token ? 'yes' : 'no'));
  }

  function prepareTikTokIdentity(done) {
    var ttHost = (typeof tt !== 'undefined' && tt) ? tt : null;
    var ttMinisHost = (typeof TTMinis !== 'undefined' && TTMinis && TTMinis.game) ? TTMinis.game : null;
    var host = ttHost || ttMinisHost;
    var completed = false;

    var expose = function(profile) {
      _gvrExposeTikTokIdentity(profile || {}, host);
      try {
        if (typeof globalThis !== 'undefined') {
          globalThis.__GVR_TIKTOK_IDENTITY_READY__ = Date.now();
        }
      } catch (_e0) {}
      try {
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
          window.dispatchEvent(new Event('gvr:tiktok-identity-ready'));
        }
      } catch (_e1) {}
    };

    var finish = function(profile) {
      if (completed) return;
      completed = true;
      expose(profile || {});
      if (typeof done === 'function') done();
    };

    var cachedRaw = _gvrReadStorage(host, '__gvr_tiktok_identity_v1');
    var cachedProfile = {};
    if (cachedRaw) {
      try { cachedProfile = JSON.parse(cachedRaw); } catch (_e0) {}
    }

    var timeoutId = 0;
    if (typeof setTimeout === 'function') {
      timeoutId = setTimeout(function() { finish(cachedProfile); }, 2500);
    }

    var candidates = [];
    if (ttHost) candidates.push({ name: 'tt', api: ttHost });
    if (ttMinisHost && ttMinisHost !== ttHost) candidates.push({ name: 'TTMinis.game', api: ttMinisHost });
    if (candidates.length === 0) {
      if (timeoutId) clearTimeout(timeoutId);
      finish(cachedProfile);
      return;
    }

    var onSuccess = function(profile, source) {
      if (timeoutId) clearTimeout(timeoutId);
      console.log('[BOOT][IDENTITY] profile from ' + source);
      if (!completed) {
        finish(profile);
        return;
      }
      // Timeout may already have launched the game with cached identity.
      // Apply late-arriving real profile so runtime requests can use it.
      expose(profile);
    };

    var tryApi = function(apiName, hostName, api) {
      var fn = api && api[apiName];
      if (typeof fn !== 'function') return false;
      try {
        var req = {
          lang: 'zh_CN',
          withCredentials: true,
          success: function(res) {
            try {
              console.log('[BOOT][IDENTITY] ' + hostName + '.' + apiName + ' success ' + _gvrProfileDebug(res));
            } catch (_e2) {}
            var profile = _gvrExtractProfile(res);
            onSuccess(profile, hostName + '.' + apiName + '.success');
          },
          fail: function(err) {
            try {
              console.log('[BOOT][IDENTITY] ' + hostName + '.' + apiName + ' fail=' + JSON.stringify(err || {}));
            } catch (_e2) {}
          }
        };
        var ret = fn.call(api, req);
        if (ret && typeof ret.then === 'function') {
          ret.then(function(res) {
            try {
              console.log('[BOOT][IDENTITY] ' + hostName + '.' + apiName + ' promise ' + _gvrProfileDebug(res));
            } catch (_e2) {}
            var profile = _gvrExtractProfile(res);
            onSuccess(profile, hostName + '.' + apiName + '.promise');
          }).catch(function(err) {
            try {
              console.log('[BOOT][IDENTITY] ' + hostName + '.' + apiName + ' reject=' + JSON.stringify(err || {}));
            } catch (_e2) {}
          });
        }
        return true;
      } catch (_e) {
        try {
          console.log('[BOOT][IDENTITY] ' + hostName + '.' + apiName + ' throw=' + (_e && _e.message ? _e.message : _e));
        } catch (_e2) {}
        return false;
      }
    };

    for (var h = 0; h < candidates.length; h += 1) {
      var hostName = candidates[h].name;
      var api = candidates[h].api;
      tryApi('getUserInfo', hostName, api);
      tryApi('getUserProfile', hostName, api);
    }
  }

  function installCrashBreadcrumbs() {
    try {
      if (typeof tt === 'undefined' || !tt) return;
      var key = '__gvr_runtime_breadcrumb_v2';
      var push = function(tag, payload) {
        try {
          var msg = '';
          try { msg = String(payload && (payload.stack || payload.message || payload)); } catch (_e0) {}
          var line = '[' + tag + '] ' + msg.slice(0, 280);
          if (!line) return;
          var prev = '';
          try { prev = String(tt.getStorageSync(key) || ''); } catch (_e1) {}
          var next = (prev ? (prev + '\n') : '') + line;
          var trimmed = next.split('\n').slice(-8).join('\n');
          try { tt.setStorageSync(key, trimmed); } catch (_e2) {}
        } catch (_e3) {}
      };

      try {
        var prev = String(tt.getStorageSync(key) || '');
        if (prev) {
          console.log('[GVR][CRASH][prev]\n' + prev);
          if (typeof tt.removeStorageSync === 'function') tt.removeStorageSync(key);
        }
      } catch (_e4) {}

      if (typeof tt.onError === 'function') {
        tt.onError(function(err) { push('tt.onError', err); });
      }
      if (typeof tt.onMemoryWarning === 'function') {
        tt.onMemoryWarning(function(warn) {
          push('tt.onMemoryWarning', warn);
          try {
            console.error('[GVR][MEMORY]', JSON.stringify(warn || {}));
          } catch (_e5) {
            console.error('[GVR][MEMORY]', warn);
          }
        });
      }
      if (typeof GameGlobal !== 'undefined' && GameGlobal) {
        GameGlobal.onerror = function(msg, src, line, col, err) {
          push('GameGlobal.onerror', err || msg);
        };
      }
    } catch (_e) {}
  }

  // Request landscape orientation as early as possible (before subpackage load).
  function requestLandscapeEarly() {
    try {
      var ttHost = (typeof tt !== 'undefined' && tt) ? tt : null;
      var ttMinisHost = (typeof TTMinis !== 'undefined' && TTMinis && TTMinis.game) ? TTMinis.game : null;
      var hosts = [];
      if (ttHost) hosts.push({ name: 'tt', api: ttHost });
      if (ttMinisHost && ttMinisHost !== ttHost) hosts.push({ name: 'TTMinis.game', api: ttMinisHost });
      if (hosts.length === 0) {
        console.log('[BOOT][ORIENT] no host api');
        return;
      }

      var payloads = [{value:'landscape'},{orientation:'landscape'},{direction:'landscape'}];
      var fns = ['setDeviceOrientation','setScreenOrientation','setGameOrientation'];
      var once = {};
      var foundOrientationFn = false;
      var callRound = function(tag) {
        for (var h = 0; h < hosts.length; h++) {
          var hostName = hosts[h].name;
          var hostApi = hosts[h].api;
          for (var i = 0; i < fns.length; i++) {
            var fnName = fns[i];
            var fn = hostApi[fnName];
            if (typeof fn !== 'function') continue;
            foundOrientationFn = true;
            for (var j = 0; j < payloads.length; j++) {
              var basePayload = payloads[j];
              var sig = hostName + ':' + fnName + ':' + j;
              try {
                fn.call(hostApi, Object.assign({}, basePayload, { success: function(){}, fail: function(){} }));
                if (!once[sig]) {
                  console.log('[BOOT][ORIENT] ' + tag + ' ok ' + hostName + '.' + fnName + ' payload=' + JSON.stringify(basePayload));
                  once[sig] = 1;
                }
                break;
              } catch(_e2) {
                if (!once[sig + ':err']) {
                  console.log('[BOOT][ORIENT] ' + tag + ' err ' + hostName + '.' + fnName + ' payload=' + JSON.stringify(basePayload)
                    + ' err=' + (_e2 && _e2.message ? _e2.message : _e2));
                  once[sig + ':err'] = 1;
                }
              }
            }
          }
        }
        try {
          if (ttHost && typeof ttHost.getSystemInfoSync === 'function') {
            var s = ttHost.getSystemInfoSync() || {};
            console.log('[BOOT][SYS] ' + tag + ' sw=' + s.screenWidth + ' sh=' + s.screenHeight
              + ' ww=' + s.windowWidth + ' wh=' + s.windowHeight
              + ' ori=' + (s.deviceOrientation || 'n/a'));
          }
        } catch(_e3) {}
      };

      callRound('t0');
      if (!foundOrientationFn) {
        console.log('[BOOT][ORIENT] no orientation functions on host');
      }
      if (typeof setTimeout === 'function') {
        setTimeout(function(){ callRound('t+120'); }, 120);
        setTimeout(function(){ callRound('t+500'); }, 500);
        setTimeout(function(){ callRound('t+1200'); }, 1200);
      }
      if (ttHost && typeof ttHost.onWindowResize === 'function' && !ttHost.__gvrBootResizeLog) {
        ttHost.onWindowResize(function(res){
          try {
            console.log('[BOOT][RESIZE] ww=' + res.windowWidth + ' wh=' + res.windowHeight
              + ' sw=' + res.screenWidth + ' sh=' + res.screenHeight);
          } catch(_e4) {}
        });
        ttHost.__gvrBootResizeLog = true;
      }
    } catch (_e) {
      try { console.log('[BOOT][ORIENT] exception ' + (_e && _e.message ? _e.message : _e)); } catch(_e2) {}
    }
  }

  function launch() {
    if (started) {
      return;
    }
    started = true;
    var ok = launchEntryOnce();
    if (!ok) {
      started = false;
    }
  }

  exposePlatform();
  installCrashBreadcrumbs();
  requestLandscapeEarly();

  prepareTikTokIdentity(function() {
    if (typeof tt !== 'undefined' && tt && typeof tt.loadSubpackage === 'function') {
      tt.loadSubpackage({
        name: SUBPACKAGE_NAME,
        success: launch,
        fail: function (err) {
          console.error('[tiktok-native-build] loadSubpackage failed:', err);
        }
      });
    } else {
      launch();
    }
  });
})();
EOF_JS

  PACKAGE_DIR="$package_dir" SUBPACKAGE_NAME="$subpackage_name" DEFERRED_ENABLED="${ENABLE_DEFERRED_RESOURCES_SPLIT}" DEFERRED_SUBPACKAGE_NAME="${DEFERRED_RESOURCES_SUBPACKAGE_NAME}" node <<'NODE'
const fs = require('fs');
const path = require('path');
const packageDir = process.env.PACKAGE_DIR;
const subpackageName = process.env.SUBPACKAGE_NAME;
const deferredEnabled = process.env.DEFERRED_ENABLED === '1';
const deferredSubpackageName = process.env.DEFERRED_SUBPACKAGE_NAME || 'resources';
const gameJsonPath = path.join(packageDir, 'game.json');

const gameJson = JSON.parse(fs.readFileSync(gameJsonPath, 'utf8'));
const subpackages = [{
  name: subpackageName,
  root: `subpackages/${subpackageName}`,
}];
if (deferredEnabled) {
  subpackages.push({
    name: deferredSubpackageName,
    root: `subpackages/${deferredSubpackageName}`,
  });
}
gameJson.subpackages = subpackages;
// Official config key in docs uses subPackages; keep both for compatibility.
gameJson.subPackages = subpackages;
// Force landscape for TikTok native runtime to match gameplay layout.
gameJson.deviceOrientation = 'landscape';
gameJson.orientation = 'landscape';
fs.writeFileSync(gameJsonPath, `${JSON.stringify(gameJson, null, 4)}\n`);

// Create CommonJS module wrappers inside the subpackage so that
// require('./game.json') and require('./minigame.config.json') resolve correctly.
// TikTok runtime maps  require('./game.json')  →  subpackages/gamecore/game.json.js
// Without these files the runtime throws an uncaught Promise rejection every boot.
const subpkgRoot = path.join(packageDir, 'subpackages', subpackageName);
fs.writeFileSync(
  path.join(subpkgRoot, 'game.json.js'),
  'module.exports = ' + JSON.stringify(gameJson, null, 4) + ';\n'
);
const miniCfgSrc = path.join(packageDir, 'minigame.config.json');
let miniCfgObj = { orientation: 'landscape' };
if (fs.existsSync(miniCfgSrc)) {
  try {
    const raw = JSON.parse(fs.readFileSync(miniCfgSrc, 'utf8'));
    if (raw.networkTimeout) miniCfgObj.networkTimeout = raw.networkTimeout;
  } catch (_e) {}
}
fs.writeFileSync(
  path.join(subpkgRoot, 'minigame.config.json.js'),
  'module.exports = ' + JSON.stringify(miniCfgObj) + ';\n'
);
console.log('[tiktok-native-build] Created subpackage JSON module wrappers: game.json.js, minigame.config.json.js');
NODE
}

defer_resources_bundle_to_subpackage() {
  local package_dir="$1"
  local core_subpackage_name="$2"
  local resources_subpackage_name="$3"

  local core_root="${package_dir}/subpackages/${core_subpackage_name}"
  local resources_src="${core_root}/assets/resources"
  local resources_dst="${package_dir}/subpackages/${resources_subpackage_name}"

  if [ ! -d "$resources_src" ]; then
    warn "Skip deferred resource split: ${resources_src} not found."
    return 0
  fi

  rm -rf "$resources_dst"
  ensure_dir "$resources_dst"

  for item in "config.json" "index.js" "import" "native"; do
    if [ -e "${resources_src}/${item}" ]; then
      mv "${resources_src}/${item}" "${resources_dst}/"
    fi
  done

  # ttmg uploader treats every subpackage as code package and expects game.js entry.
  # Provide a minimal entry that forwards to bundle index when present.
  if [ ! -f "${resources_dst}/game.js" ]; then
    cat > "${resources_dst}/game.js" <<'EOF_JS'
try {
  require('./index.js');
} catch (_e) {}
EOF_JS
  fi

  rmdir "$resources_src" 2>/dev/null || true

  local settings_path="${core_root}/src/settings.json"
  [ -f "$settings_path" ] || die "Missing settings file for deferred resource split: ${settings_path}"

  SETTINGS_PATH="$settings_path" DEFERRED_SUBPACKAGE_NAME="$resources_subpackage_name" node <<'NODE'
const fs = require('fs');
const settingsPath = process.env.SETTINGS_PATH;
const deferredSubpackageName = process.env.DEFERRED_SUBPACKAGE_NAME || 'resources';
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

if (!settings.assets || typeof settings.assets !== 'object') {
  throw new Error('settings.assets missing');
}

const assets = settings.assets;
const subpackages = Array.isArray(assets.subpackages) ? assets.subpackages.slice() : [];
if (!subpackages.includes(deferredSubpackageName)) subpackages.push(deferredSubpackageName);
assets.subpackages = subpackages;

if (Array.isArray(assets.preloadBundles)) {
  assets.preloadBundles = assets.preloadBundles.filter((item) => {
    const bundle = item && typeof item === 'object' ? item.bundle : null;
    return bundle !== deferredSubpackageName;
  });
}

settings.assets = assets;
fs.writeFileSync(settingsPath, `${JSON.stringify(settings)}\n`);
NODE
}

validate_tiktok_package_integrity() {
  local package_dir="$1"
  local core_subpackage_name="$2"
  local deferred_enabled="$3"
  local deferred_subpackage_name="$4"

  PACKAGE_DIR="$package_dir" CORE_SUBPACKAGE_NAME="$core_subpackage_name" DEFERRED_ENABLED="$deferred_enabled" DEFERRED_SUBPACKAGE_NAME="$deferred_subpackage_name" node <<'NODE'
const fs = require('fs');
const path = require('path');

const packageDir = process.env.PACKAGE_DIR;
const coreSubpackageName = process.env.CORE_SUBPACKAGE_NAME || 'gamecore';
const deferredEnabled = process.env.DEFERRED_ENABLED === '1';
const deferredSubpackageName = process.env.DEFERRED_SUBPACKAGE_NAME || 'resources';

function fail(msg) {
  console.error(`[tiktok-native-build][error] ${msg}`);
  process.exit(1);
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const gameJsonPath = path.join(packageDir, 'game.json');
if (!fs.existsSync(gameJsonPath)) fail(`Missing game.json: ${gameJsonPath}`);

const gameJson = readJson(gameJsonPath);
const gameSubpackages = Array.isArray(gameJson.subPackages)
  ? gameJson.subPackages
  : (Array.isArray(gameJson.subpackages) ? gameJson.subpackages : []);
const gameSubpackageNames = gameSubpackages.map((it) => it && it.name).filter(Boolean);
if (!gameSubpackageNames.includes(coreSubpackageName)) {
  fail(`game.json.subpackages missing core subpackage "${coreSubpackageName}"`);
}
if (deferredEnabled && !gameSubpackageNames.includes(deferredSubpackageName)) {
  fail(`game.json.subpackages missing deferred subpackage "${deferredSubpackageName}"`);
}

const settingsPath = path.join(packageDir, 'subpackages', coreSubpackageName, 'src', 'settings.json');
if (!fs.existsSync(settingsPath)) fail(`Missing settings.json: ${settingsPath}`);

const settings = readJson(settingsPath);
const assets = settings.assets && typeof settings.assets === 'object' ? settings.assets : null;
if (!assets) fail(`settings.assets missing in ${settingsPath}`);

const settingsSubpackages = Array.isArray(assets.subpackages) ? assets.subpackages : [];
if (deferredEnabled && !settingsSubpackages.includes(deferredSubpackageName)) {
  fail(`settings.assets.subpackages missing "${deferredSubpackageName}" in ${settingsPath}`);
}
if (deferredEnabled && Array.isArray(assets.preloadBundles)) {
  const stillPreloaded = assets.preloadBundles.some((item) => item && item.bundle === deferredSubpackageName);
  if (stillPreloaded) {
    fail(`settings.assets.preloadBundles still contains "${deferredSubpackageName}" in ${settingsPath}`);
  }
}

if (deferredEnabled) {
  const deferredRoot = path.join(packageDir, 'subpackages', deferredSubpackageName);
  const deferredConfig = path.join(deferredRoot, 'config.json');
  const deferredEntry = path.join(deferredRoot, 'game.js');
  if (!fs.existsSync(deferredRoot)) fail(`Missing deferred subpackage dir: ${deferredRoot}`);
  if (!fs.existsSync(deferredConfig)) fail(`Missing deferred bundle config: ${deferredConfig}`);
  if (!fs.existsSync(deferredEntry)) fail(`Missing deferred subpackage entry: ${deferredEntry}`);
}

console.log(`[tiktok-native-build] Integrity check passed: core=${coreSubpackageName}, deferred=${deferredEnabled ? deferredSubpackageName : 'disabled'}`);
NODE
}

compute_package_sizes() {
  local package_dir="$1"
  PACKAGE_DIR="$package_dir" node <<'NODE'
const fs = require('fs');
const path = require('path');
const root = process.env.PACKAGE_DIR;

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

let mainBytes = 0;
let subBytes = 0;
for (const f of walk(root)) {
  const size = fs.statSync(f).size;
  if (f.includes(`${path.sep}subpackages${path.sep}`)) subBytes += size;
  else mainBytes += size;
}

const mainMB = (mainBytes / 1024 / 1024).toFixed(3);
const subMB = (subBytes / 1024 / 1024).toFixed(3);
console.log(`main_bytes=${mainBytes}`);
console.log(`main_mb=${mainMB}`);
console.log(`sub_bytes=${subBytes}`);
console.log(`sub_mb=${subMB}`);
NODE
}

write_ttmg_dev_config() {
  local package_dir="$1"
  local config_path="${package_dir}/minigame.config.json"
  cat > "$config_path" <<'EOF_JSON'
{
  "_comment": "ttmg local dev config; set orientation to horizontal for on-device debug sessions.",
  "orientation": "HORIZONTAL",
  "dev": {
    "port": 9527
  }
}
EOF_JSON
}

SKIP_COCOS_BUILD=0
SOURCE_BUILD_DIR=""
OUTPUT_PACKAGE_DIR="dist/tiktok-package/native"
ZIP_DIR="dist/tiktok-package"
ZIP_NAME=""
BUILD_PLATFORM="bytedance-mini-game"
OUTPUT_NAME="tiktok-native"
COCOS_CREATOR="${COCOS_CREATOR:-}"
COCOS_BUILD_OPTS=""
START_SCENE=""
ENABLE_SUBPACKAGE_SPLIT=1
SUBPACKAGE_NAME="gamecore"
ENABLE_DEFERRED_RESOURCES_SPLIT=1
DEFERRED_RESOURCES_SUBPACKAGE_NAME="resources"
ENABLE_EXPERIMENTAL_FBO_ROTATION_PATCH="${ENABLE_EXPERIMENTAL_FBO_ROTATION_PATCH:-1}"
TIKTOK_API_BASE="${TIKTOK_API_BASE:-https://tiktok-leaderboard-prod.mineskystudio.workers.dev/api/tiktok}"

usage() {
  cat <<'EOF_USAGE'
Usage:
  bash scripts/build_tiktok_native_package.sh [options]

Options:
  --skip-cocos-build              Skip headless Cocos build and package existing output.
  --source-build-dir <dir>        Existing native build directory (must contain game.json).
  --output-package-dir <dir>      Final package directory. Default: dist/tiktok-package/native
  --zip-dir <dir>                 Zip output directory. Default: dist/tiktok-package
  --zip-name <name.zip>           Zip file name. Default: tiktok-native-<timestamp>.zip
  --platform <name>               Cocos build platform. Default: bytedance-mini-game
  --output-name <name>            Cocos output name under build/. Default: tiktok-native
  --cocos-creator <path>          Path to CocosCreator executable.
  --cocos-build-opts <string>     Extra raw Cocos --build options (append).
  --start-scene <db://...>        Override start scene for Cocos build.
  --no-subpackage-split           Disable post-build runtime split to subpackage.
  --subpackage-name <name>        Subpackage name for split runtime. Default: gamecore
  --no-deferred-resources-split   Keep resources bundle in startup subpackage.
  --deferred-resources-name <n>   Deferred resources subpackage name. Default: resources
  --tiktok-api-base <url>         Inject window.__GVR_TIKTOK_API_BASE__ into package game.js
  --enable-fbo-rotation-patch     Force-enable FBO landscape patch.
  --disable-fbo-rotation-patch    Disable FBO landscape patch and use native orientation only.
  -h, --help                      Show this help.
EOF_USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-cocos-build) SKIP_COCOS_BUILD=1 ;;
    --source-build-dir) SOURCE_BUILD_DIR="$2"; shift ;;
    --output-package-dir) OUTPUT_PACKAGE_DIR="$2"; shift ;;
    --zip-dir) ZIP_DIR="$2"; shift ;;
    --zip-name) ZIP_NAME="$2"; shift ;;
    --platform) BUILD_PLATFORM="$2"; shift ;;
    --output-name) OUTPUT_NAME="$2"; shift ;;
    --cocos-creator) COCOS_CREATOR="$2"; shift ;;
    --cocos-build-opts) COCOS_BUILD_OPTS="$2"; shift ;;
    --start-scene) START_SCENE="$2"; shift ;;
    --no-subpackage-split) ENABLE_SUBPACKAGE_SPLIT=0 ;;
    --subpackage-name) SUBPACKAGE_NAME="$2"; shift ;;
    --no-deferred-resources-split) ENABLE_DEFERRED_RESOURCES_SPLIT=0 ;;
    --deferred-resources-name) DEFERRED_RESOURCES_SUBPACKAGE_NAME="$2"; shift ;;
    --tiktok-api-base) TIKTOK_API_BASE="$2"; shift ;;
    --enable-fbo-rotation-patch) ENABLE_EXPERIMENTAL_FBO_ROTATION_PATCH=1 ;;
    --disable-fbo-rotation-patch) ENABLE_EXPERIMENTAL_FBO_ROTATION_PATCH=0 ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
  shift
done

OUTPUT_PACKAGE_DIR="${ROOT_DIR}/${OUTPUT_PACKAGE_DIR#./}"
ZIP_DIR="${ROOT_DIR}/${ZIP_DIR#./}"
ensure_dir "$(dirname "$OUTPUT_PACKAGE_DIR")"
ensure_dir "$ZIP_DIR"

if [ "$SKIP_COCOS_BUILD" -eq 0 ]; then
  if [ -z "$COCOS_CREATOR" ]; then
    if COCOS_CREATOR="$(detect_default_cocos_creator)"; then
      log "Auto-detected COCOS_CREATOR: $COCOS_CREATOR"
    else
      die "Missing COCOS_CREATOR path. Pass --cocos-creator or set COCOS_CREATOR env."
    fi
  fi
  [ -x "$COCOS_CREATOR" ] || die "CocosCreator executable not found or not executable: $COCOS_CREATOR"

  if [ -z "$START_SCENE" ]; then
    START_SCENE="$(detect_default_start_scene || true)"
  fi

  BUILD_OPT_BASE="platform=${BUILD_PLATFORM};debug=false;sourceMaps=false;mainBundleCompressionType=merge_dep;stage=build;buildPath=project://build;outputName=${OUTPUT_NAME}"
  if [ -n "$START_SCENE" ]; then
    BUILD_OPT_BASE="${BUILD_OPT_BASE};startScene=${START_SCENE}"
  fi
  if [ -n "$COCOS_BUILD_OPTS" ]; then
    BUILD_OPT_BASE="${BUILD_OPT_BASE};${COCOS_BUILD_OPTS}"
  fi

  log "Running headless Cocos build (TikTok Native)..."
  local_build_started_at="$(date +%s)"
  set +e
  GVR_ENABLE_REDDIT_CSP_PATCH=0 "$COCOS_CREATOR" --project "$ROOT_DIR" --build "$BUILD_OPT_BASE"
  cocos_exit_code=$?
  set -e

  if [ "$cocos_exit_code" -ne 0 ]; then
    warn "Cocos build exited non-zero (${cocos_exit_code}). Checking fresh output..."
    check_dir="${ROOT_DIR}/build/${OUTPUT_NAME}"
    if [ -f "${check_dir}/game.json" ]; then
      check_mtime="$(file_mtime "${check_dir}/game.json")"
      if [ "$check_mtime" -ge $((local_build_started_at - 2)) ]; then
        warn "Detected fresh output at ${check_dir}. Continuing."
      else
        die "Cocos build failed and no fresh output was detected in ${check_dir}."
      fi
    else
      die "Cocos build failed and ${check_dir}/game.json is missing."
    fi
  fi
fi

if [ -z "$SOURCE_BUILD_DIR" ]; then
  SOURCE_BUILD_DIR="${ROOT_DIR}/build/${OUTPUT_NAME}"
  if [ ! -f "${SOURCE_BUILD_DIR}/game.json" ]; then
    SOURCE_BUILD_DIR="$(latest_game_json_dir)"
  fi
fi

[ -n "$SOURCE_BUILD_DIR" ] || die "Could not detect source build dir. Pass --source-build-dir."
if [ "${SOURCE_BUILD_DIR#/}" = "$SOURCE_BUILD_DIR" ]; then
  SOURCE_BUILD_DIR="${ROOT_DIR}/${SOURCE_BUILD_DIR#./}"
fi

[ -f "${SOURCE_BUILD_DIR}/game.json" ] || die "game.json not found in source build dir: $SOURCE_BUILD_DIR"
[ -f "${SOURCE_BUILD_DIR}/game.js" ] || die "game.js not found in source build dir: $SOURCE_BUILD_DIR"

log "Packaging from $SOURCE_BUILD_DIR"
if [ "${ENABLE_EXPERIMENTAL_FBO_ROTATION_PATCH}" -eq 1 ]; then
  warn "Using FBO landscape patch (runtime fallback mode)."
else
  log "Using stable orientation mode (FBO rotation patch disabled)."
fi
copy_dir_clean "$SOURCE_BUILD_DIR" "$OUTPUT_PACKAGE_DIR"
find "$OUTPUT_PACKAGE_DIR" -type f \( -name "*.map" -o -name ".DS_Store" \) -delete

if [ "$ENABLE_SUBPACKAGE_SPLIT" -eq 1 ]; then
  log "Splitting runtime into subpackage: ${SUBPACKAGE_NAME}"
  split_runtime_to_subpackage "$OUTPUT_PACKAGE_DIR" "$SUBPACKAGE_NAME"
  if [ "$ENABLE_DEFERRED_RESOURCES_SPLIT" -eq 1 ]; then
    log "Deferring resources bundle into subpackage: ${DEFERRED_RESOURCES_SUBPACKAGE_NAME}"
    defer_resources_bundle_to_subpackage "$OUTPUT_PACKAGE_DIR" "$SUBPACKAGE_NAME" "$DEFERRED_RESOURCES_SUBPACKAGE_NAME"
  fi
else
  log "Skipping subpackage split."
fi

validate_tiktok_package_integrity "$OUTPUT_PACKAGE_DIR" "$SUBPACKAGE_NAME" "$ENABLE_DEFERRED_RESOURCES_SPLIT" "$DEFERRED_RESOURCES_SUBPACKAGE_NAME"
write_ttmg_dev_config "$OUTPUT_PACKAGE_DIR"

size_report="$(compute_package_sizes "$OUTPUT_PACKAGE_DIR")"
printf "%s\n" "$size_report"

main_mb="$(printf "%s\n" "$size_report" | sed -n 's/^main_mb=//p')"
if [ -n "$main_mb" ]; then
  main_mb_int="${main_mb%.*}"
  if [ "${main_mb_int:-0}" -ge 4 ]; then
    warn "Main package is ${main_mb} MB (>= 4 MB). TikTok validation may fail."
  fi
fi

if [ -z "$ZIP_NAME" ]; then
  ZIP_NAME="tiktok-native-$(date +%Y%m%d_%H%M%S).zip"
fi
ZIP_PATH="${ZIP_DIR}/${ZIP_NAME}"
rm -f "$ZIP_PATH"
(cd "$OUTPUT_PACKAGE_DIR" && zip -q -r "$ZIP_PATH" .)

log "Done."
log "Output package dir: $OUTPUT_PACKAGE_DIR"
log "Zip file: $ZIP_PATH"
