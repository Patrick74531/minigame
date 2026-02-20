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
