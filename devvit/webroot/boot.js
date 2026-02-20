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
    if (W >= H) return; // Already landscape.
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
    // ── DO NOT MODIFY: canvas.getBoundingClientRect override ─────────────────────
    //    Returns landscape dims so Cocos sees scale=1 (prevents ×2 scale distortion
    //    caused by the canvas being CSS-rotated into portrait physical rect).
    function patchCanvas(c) {
      c.getBoundingClientRect = function () {
        return { left: 0, top: 0, right: LAND_W, bottom: LAND_H,
                 width: LAND_W, height: LAND_H, x: 0, y: 0,
                 toJSON: function () { return this; } };
      };
      // ── DO NOT MODIFY: Touch coordinate remapping ─────────────────────────────
      //    portrait (tx,ty) → landscape game (gx,gy): gx = H-ty, gy = tx
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
  // >5 s after the game fully loaded, force a fresh reload on return so the game
  // starts in a clean state instead of a stale/paused one.
  var _hiddenAt = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      _hiddenAt = Date.now();
    } else if (_hiddenAt > 0 && _splashHidden && (Date.now() - _hiddenAt) > 5000) {
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

  function byId(id) { return document.getElementById(id); }

  function mountSplash() {
    if (byId('boot-splash')) return;
    var wrap = document.createElement('div');
    wrap.id = 'boot-splash';
    wrap.innerHTML =
      '<div class="boot-splash__panel">' +
      '  <div class="boot-splash__title">Tower Defense</div>' +
      '  <div class="boot-splash__sub">加载游戏资源中，请稍候...</div>' +
      '  <div class="boot-splash__bar"><div id="boot-splash-fill" class="boot-splash__fill"></div></div>' +
      '  <div id="boot-splash-pct" class="boot-splash__pct">0%</div>' +
      '</div>';
    document.body.appendChild(wrap);
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
    // Progress advances quickly at first, slows near 90%, then creeps to 99%
    // so the bar never freezes. _hideSplash() jumps it to 100% and fades out.
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

  // Called by Cocos once the homepage background texture is loaded and set on
  // the sprite. We wait 800 ms before fading so the GPU has time to upload the
  // texture and render at least one full frame — eliminating the flash of gray
  // that appeared when the splash faded to an unrendered canvas.
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
      panel.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;max-height:40%;' +
        'overflow:auto;margin:0;padding:10px;background:rgba(0,0,0,0.75);color:#ffb4b4;' +
        'font:12px/1.4 Menlo,Monaco,monospace;border:1px solid rgba(255,180,180,0.5);' +
        'border-radius:8px;z-index:2147483647';
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
    if (originalConsoleError) originalConsoleError.apply(console, arguments);
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
  startSplashProgress();

  var gameCanvas = document.getElementById('GameCanvas');
  if (gameCanvas) {
    gameCanvas.addEventListener('contextmenu', function (event) { event.preventDefault(); });
  }

  if (typeof System === 'undefined') {
    appendError('SystemJS is unavailable');
    setSplashText('运行环境初始化失败，请重试。');
    return;
  }

  System.import('./index.js')
    .then(function () {
      // Fallback: hide splash automatically if Cocos never calls window._hideSplash().
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
