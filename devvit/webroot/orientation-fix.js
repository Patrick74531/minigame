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
        // NOTE: Do NOT touch html width/height/position/overflow here.
        // boot.js sets those properties to specific values required for the
        // portrait→landscape rotation (position:absolute, top:H, left:leftShift,
        // width:LAND_W, height:LAND_H). Overwriting them breaks the geometry.
        html.style.margin = '0';
        html.style.padding = '0';
        html.style.touchAction = 'none';
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
        // NOTE: intentionally NOT resetting viewport here – boot.js owns the viewport swap.
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

        // Fire immediately and on layout events
        schedule();
        window.addEventListener('resize', schedule, { passive: true });
        window.addEventListener('orientationchange', schedule, { passive: true });
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', schedule, { passive: true });
        }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', schedule, { once: true });
        }

        // Persistent polling for Cocos init – mobile can take 5-15s to fully load.
        // Sparse early probes, then every 500ms until success or 30s timeout.
        setTimeout(schedule, 200);
        setTimeout(schedule, 600);
        setTimeout(schedule, 1500);
        var _pollInterval = setInterval(function () {
            if (appliedCocosOverrides) {
                clearInterval(_pollInterval);
                return;
            }
            maybeApplyCocosOverrides();
        }, 500);
        setTimeout(function () {
            clearInterval(_pollInterval);
        }, 30000);
    }

    setup();
})();
