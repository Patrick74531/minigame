(function () {
    // CSS-only portrait→landscape rotation for devices that can't honour orientation lock.
    // We deliberately do NOT override canvas.width/height because that interferes with
    // Cocos Creator's WebGL context initialisation (causes black screen on mobile WebViews).
    if (window.innerWidth >= window.innerHeight) return;
    var pW = window.innerWidth,
        pH = window.innerHeight;

    function applyCSS(canvas) {
        canvas.style.cssText =
            [
                'position:fixed',
                'width:' + pH + 'px',
                'height:' + pW + 'px',
                'top:0',
                'left:0',
                'transform-origin:top left',
                'transform:rotate(90deg) translateX(-' + pH + 'px)',
            ].join(';') + ';';
        var p = canvas.parentElement;
        while (p && p.tagName !== 'BODY') {
            p.style.width = pW + 'px';
            p.style.height = pH + 'px';
            p.style.overflow = 'hidden';
            p.style.position = 'fixed';
            p = p.parentElement;
        }
    }

    function setup(canvas) {
        applyCSS(canvas);
        var mo = new MutationObserver(function () {
            applyCSS(canvas);
        });
        mo.observe(canvas, { attributes: true, attributeFilter: ['style'] });
    }

    var c = document.getElementById('GameCanvas');
    if (c) {
        setup(c);
    } else {
        var mo2 = new MutationObserver(function () {
            var c2 = document.getElementById('GameCanvas');
            if (c2) {
                mo2.disconnect();
                setup(c2);
            }
        });
        mo2.observe(document.documentElement, { childList: true, subtree: true });
    }
})();
