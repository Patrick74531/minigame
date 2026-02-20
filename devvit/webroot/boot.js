(function () {
    // ── Portrait→Landscape fix for iOS portrait-locked WebViews ─────────────────
    // Rotates #GameDiv (Cocos root container) via !important CSS \u2014 immune to JS
    // inline-style resets from Cocos init. LAND_H=W gives exact fill, no gap.
    (function () {
        var W = window.innerWidth,
            H = window.innerHeight;
        if (W >= H) return; // Already landscape.

        // Landscape dimensions: width = portrait height, height = portrait width (exact fill).
        var LAND_W = H;
        var LAND_H = W;

        // 1. Override window dimensions so Cocos initialises a landscape canvas.
        Object.defineProperty(window, 'innerWidth', {
            get: function () {
                return LAND_W;
            },
            configurable: true,
        });
        Object.defineProperty(window, 'innerHeight', {
            get: function () {
                return LAND_H;
            },
            configurable: true,
        });
        if (window.visualViewport) {
            try {
                Object.defineProperty(window.visualViewport, 'width', {
                    get: function () {
                        return LAND_W;
                    },
                    configurable: true,
                });
                Object.defineProperty(window.visualViewport, 'height', {
                    get: function () {
                        return LAND_H;
                    },
                    configurable: true,
                });
            } catch (_) {}
        }

        // 2. Inject !important CSS — rotate #GameDiv (Cocos root container) so the
        //    landscape game fills the portrait viewport exactly.
        //    Transform: rotate(-90deg) translateX(-100vh) with origin (0,0)
        //      #GameDiv-local (x,y) → screen (y, 100vh-x)
        //      width=100vh × height=100vw fills the portrait screen exactly.
        var style = document.createElement('style');
        style.textContent =
            'html, body {' +
            '  margin: 0 !important; padding: 0 !important;' +
            '  width: 100% !important; height: 100% !important;' +
            '  overflow: hidden !important;' +
            '  background: #000 !important;' +
            '}' +
            '#GameDiv {' +
            '  position: fixed !important;' +
            '  top: 0 !important; left: 0 !important;' +
            '  width: 100vh !important; height: 100vw !important;' +
            '  transform-origin: 0 0 !important;' +
            '  transform: rotate(-90deg) translateX(-100vh) !important;' +
            '  overflow: hidden !important;' +
            '}' +
            '#Cocos3dGameContainer, #GameCanvas {' +
            '  width: 100% !important; height: 100% !important;' +
            '}';
        document.head.appendChild(style);

        // 4. Remap touch/pointer/mouse events on the canvas.
        //    portrait (tx,ty) → canvas-local (cx,cy): cx = H-ty, cy = tx
        //    Cocos: game_x = clientX - rect.left, game_y = clientY - rect.top
        //    Proxy: clientX = (H-ty) + rect.left,  clientY = tx + rect.top
        var REMAP = {
            touchstart: 1,
            touchmove: 1,
            touchend: 1,
            touchcancel: 1,
            pointerdown: 1,
            pointermove: 1,
            pointerup: 1,
            pointercancel: 1,
            mousedown: 1,
            mousemove: 1,
            mouseup: 1,
            click: 1,
        };

        function patchCanvas(c) {
            // Override getBoundingClientRect so Cocos sees a landscape rect (no
            // scale distortion). The real rect is portrait-sized because the canvas
            // is CSS-rotated; that causes Cocos to apply a ~2× wrong scale factor.
            var _origGBCR = c.getBoundingClientRect.bind(c);
            c.getBoundingClientRect = function () {
                return {
                    left: 0,
                    top: 0,
                    right: LAND_W,
                    bottom: LAND_H,
                    width: LAND_W,
                    height: LAND_H,
                    x: 0,
                    y: 0,
                    toJSON: function () {
                        return this;
                    },
                };
            };
            // portrait (tx,ty) → landscape game (gx,gy): gx = H-ty, gy = tx
            function rxy(tx, ty) {
                return { x: H - ty, y: tx };
            }
            function pTouch(t) {
                var p = rxy(t.clientX, t.clientY);
                return new Proxy(t, {
                    get: function (o, k) {
                        if (k === 'clientX' || k === 'x' || k === 'pageX' || k === 'screenX')
                            return p.x;
                        if (k === 'clientY' || k === 'y' || k === 'pageY' || k === 'screenY')
                            return p.y;
                        var v = o[k];
                        return typeof v === 'function' ? v.bind(o) : v;
                    },
                });
            }
            function pTouchList(l) {
                var a = [];
                for (var i = 0; i < l.length; i++) a.push(pTouch(l[i]));
                a.item = function (i) {
                    return a[i];
                };
                return a;
            }
            function pEvent(e) {
                if (e.changedTouches !== undefined) {
                    return new Proxy(e, {
                        get: function (o, k) {
                            if (k === 'touches' || k === 'changedTouches' || k === 'targetTouches')
                                return pTouchList(o[k]);
                            var v = o[k];
                            return typeof v === 'function' ? v.bind(o) : v;
                        },
                    });
                }
                var p = rxy(e.clientX, e.clientY);
                return new Proxy(e, {
                    get: function (o, k) {
                        if (k === 'clientX' || k === 'x' || k === 'pageX' || k === 'screenX')
                            return p.x;
                        if (k === 'clientY' || k === 'y' || k === 'pageY' || k === 'screenY')
                            return p.y;
                        var v = o[k];
                        return typeof v === 'function' ? v.bind(o) : v;
                    },
                });
            }
            var _add = c.addEventListener.bind(c);
            c.addEventListener = function (type, fn, opts) {
                if (REMAP[type]) {
                    _add(
                        type,
                        function (e) {
                            fn.call(this, pEvent(e));
                        },
                        opts
                    );
                } else {
                    _add(type, fn, opts);
                }
            };
        }

        var _c = document.getElementById('GameCanvas');
        if (_c) {
            patchCanvas(_c);
        } else {
            var _mo = new MutationObserver(function () {
                var c = document.getElementById('GameCanvas');
                if (c) {
                    _mo.disconnect();
                    patchCanvas(c);
                }
            });
            _mo.observe(document.documentElement, { childList: true, subtree: true });
        }
    })();

    if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape-primary').catch(function () {});
    }

    var _splashHidden = false;
    var _progressTimer = 0;
    var _retryTimer = 0;
    var _fallbackHideTimer = 0;

    function byId(id) {
        return document.getElementById(id);
    }

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
            '  <button id="boot-splash-retry" class="boot-splash__retry">重新加载</button>' +
            '</div>';
        document.body.appendChild(wrap);
        var retry = byId('boot-splash-retry');
        if (retry) {
            retry.addEventListener('click', function () {
                location.reload();
            });
        }
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
            var step = pct < 35 ? 4.5 : pct < 70 ? 2.2 : pct < 90 ? 0.8 : 0;
            pct = Math.min(92, pct + step);
            setSplashProgress(pct);
        }, 220);
    }

    function showRetryButton() {
        var retry = byId('boot-splash-retry');
        if (retry) retry.style.display = 'inline-flex';
    }

    function hideSplash() {
        if (_splashHidden) return;
        _splashHidden = true;
        clearInterval(_progressTimer);
        clearTimeout(_retryTimer);
        clearTimeout(_fallbackHideTimer);
        setSplashProgress(100);
        var splash = byId('boot-splash');
        if (!splash) return;
        splash.classList.add('boot-splash--fade');
        setTimeout(function () {
            if (splash.parentNode) splash.parentNode.removeChild(splash);
        }, 420);
    }

    window._hideSplash = hideSplash;

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
        appendError(
            '[unhandledrejection] ' + String(reason && reason.stack ? reason.stack : reason)
        );
    });

    mountSplash();
    startSplashProgress();
    _retryTimer = setTimeout(showRetryButton, 20000);

    var gameCanvas = document.getElementById('GameCanvas');
    if (gameCanvas) {
        gameCanvas.addEventListener('contextmenu', function (event) {
            event.preventDefault();
        });
    }

    if (typeof System === 'undefined') {
        appendError('SystemJS is unavailable');
        setSplashText('运行环境初始化失败，请重试。');
        showRetryButton();
        return;
    }

    System.import('./index.js')
        .then(function () {
            // Prefer explicit hide from runtime (`window._hideSplash()`).
            // Fallback hides automatically if runtime signal never arrives.
            _fallbackHideTimer = setTimeout(function () {
                if (!_splashHidden) hideSplash();
            }, 8000);
        })
        .catch(function (err) {
            appendError('[System.import] ' + String(err && err.stack ? err.stack : err));
            console.error(err);
            setSplashText('加载失败，请重试。');
            showRetryButton();
        });
})();
