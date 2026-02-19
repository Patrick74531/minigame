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

  function patchSize(canvas) {
    var wp = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
    var hp = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'height');
    if (!wp || !hp) return;
    // When Cocos sets canvas.width = portrait_w * dpr, override to landscape_w * dpr
    Object.defineProperty(canvas, 'width', {
      get: function () { return wp.get.call(this); },
      set: function (v) {
        if (window.innerWidth < window.innerHeight) {
          wp.set.call(this, Math.round(v * (pH / pW)));
        } else { wp.set.call(this, v); }
      }, configurable: true
    });
    Object.defineProperty(canvas, 'height', {
      get: function () { return hp.get.call(this); },
      set: function (v) {
        if (window.innerWidth < window.innerHeight) {
          hp.set.call(this, Math.round(v * (pW / pH)));
        } else { hp.set.call(this, v); }
      }, configurable: true
    });
  }

  function setup(canvas) {
    patchSize(canvas);
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
