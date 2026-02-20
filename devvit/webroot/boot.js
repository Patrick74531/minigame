(function () {
    // ── Landscape orientation enforcement ──────────────────────────────────────
    // Reddit iOS WebView is portrait-locked; screen.orientation.lock() is ignored.
    // Solution: swap the viewport meta so JS (and Cocos) sees landscape dimensions,
    // then CSS-rotate <html> -90° to make the content visually correct.
    // This must run BEFORE SystemJS/Cocos reads window.innerWidth.
    (function enforcePortraitToLandscape() {
        var W = window.innerWidth,
            H = window.innerHeight;
        if (W >= H) return; // Already landscape – nothing to do

        // 1. Compute landscape height matching game's 16:9 aspect ratio (1280×720).
        //    This prevents SHOW_ALL letterboxing — Cocos sees exactly 16:9 and fills the canvas.
        //    The element will overflow the portrait width by (gameH - W); we center-shift to crop equally.
        var gameH = Math.round((H * 720) / 1280); // e.g. 812*0.5625 = 456
        var leftShift = gameH > W ? -Math.round((gameH - W) / 2) : 0;

        // 2. Update viewport so window.innerWidth/innerHeight = H×gameH before Cocos reads them
        var vp = document.querySelector('meta[name="viewport"]');
        if (vp) {
            vp.setAttribute(
                'content',
                'width=' +
                    H +
                    ',height=' +
                    gameH +
                    ',user-scalable=no,initial-scale=1,minimum-scale=1,maximum-scale=1,viewport-fit=cover'
            );
        }
        // Force synchronous reflow so viewport change takes effect
        void document.documentElement.clientWidth;

        // 3. CSS-rotate <html> -90°: landscape H×gameH element fills the portrait screen.
        //    left=leftShift centres the element so equal game-safe-zone is cropped each side.
        var s = document.documentElement.style;
        s.width = H + 'px';
        s.height = gameH + 'px';
        s.position = 'absolute';
        s.top = H + 'px'; // 100% of original portrait viewport height
        s.left = leftShift + 'px';
        s.transformOrigin = 'left top';
        s.transform = 'rotate(-90deg)';
        s.overflow = 'hidden';

        // 3. Hide rotate-prompt if it exists (not needed since we handled it in JS)
        var rp = document.getElementById('rotate-prompt');
        if (rp) rp.style.display = 'none';
    })();

    // Try OS-level lock as a bonus (works on Android Chrome/WebView)
    if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape-primary').catch(function () {});
    }

    // Animated fake progress bar: ramps quickly to ~85%, stalls, then jumps to 100% on hide
    var _progressPct = 0;
    var _progressInterval = setInterval(function () {
        var step = _progressPct < 40 ? 3 : _progressPct < 70 ? 1.5 : _progressPct < 85 ? 0.5 : 0;
        _progressPct = Math.min(85, _progressPct + step);
        var fill = document.getElementById('splash-progress-fill');
        var pct = document.getElementById('splash-pct');
        if (fill) fill.style.width = _progressPct + '%';
        if (pct) pct.textContent = Math.round(_progressPct) + '%';
    }, 250);

    // Show "Tap to Retry" button after 60 s (extended from 25 s)
    var _splashTimer = setTimeout(function () {
        var btn = document.getElementById('splash-retry');
        if (btn) btn.style.display = 'block';
    }, 60000);

    // Called by the Cocos game (HomePage._revealContent) once the first screen is ready
    window._hideSplash = function () {
        clearTimeout(_splashTimer);
        clearInterval(_progressInterval);
        // Snap to 100% before fading
        var fill = document.getElementById('splash-progress-fill');
        var pct = document.getElementById('splash-pct');
        if (fill) fill.style.width = '100%';
        if (pct) pct.textContent = '100%';
        var s = document.getElementById('splash');
        if (!s) return;
        setTimeout(function () {
            s.classList.add('fade');
            setTimeout(function () {
                if (s.parentNode) s.parentNode.removeChild(s);
            }, 600);
        }, 200);
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
        appendError(
            '[unhandledrejection] ' + String(reason && reason.stack ? reason.stack : reason)
        );
    });

    var gameCanvas = document.getElementById('GameCanvas');
    if (gameCanvas) {
        gameCanvas.addEventListener('contextmenu', function (event) {
            event.preventDefault();
        });
    }

    // WebGL availability check – show friendly error instead of hanging black screen
    (function () {
        var tc = document.createElement('canvas');
        var gl =
            tc.getContext('webgl2') ||
            tc.getContext('webgl') ||
            tc.getContext('experimental-webgl');
        if (!gl) {
            clearTimeout(_splashTimer);
            var s = document.getElementById('splash');
            if (s) {
                s.innerHTML =
                    '<div style="text-align:center;padding:24px;max-width:320px;">' +
                    '<div style="font-size:1.4rem;color:#e94560;margin-bottom:12px;">⚠️ WebGL Not Available</div>' +
                    '<div style="font-size:.95rem;color:#aaa;line-height:1.5">Please open this in Chrome or Safari for the best experience.</div>' +
                    '</div>';
            }
            appendError('WebGL not supported on this device');
        }
    })();

    if (typeof System === 'undefined') {
        appendError('SystemJS is unavailable');
        return;
    }

    System.import('./index.js').catch(function (err) {
        appendError('[System.import] ' + String(err && err.stack ? err.stack : err));
        console.error(err);
    });
})();
