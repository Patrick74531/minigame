#!/usr/bin/env node
// FBO Rotation V2 — Minimal landscape patch for TikTok mini games.
// Replaces the 1600-line V1 with ~300 lines: only 1 GL hook (bindFramebuffer),
// state save/restore via getParameter, no text guards, no diagnostics.
//
// Usage: node fbo_patch_v2.js <path-to-game.js>

const fs = require('fs');
const gameJsPath = process.argv[2] || process.env.SUBPACKAGE_GAME_JS;
if (!gameJsPath) {
    console.error('Usage: node fbo_patch_v2.js <game.js>');
    process.exit(1);
}

let source = fs.readFileSync(gameJsPath, 'utf8');

// ─────────────────────────────────────────────────────────────────────────────
// [A] Pre-loadCC: systemInfo swap + touch remap + onWindowResize guard
// ─────────────────────────────────────────────────────────────────────────────
const preludeA = `
// [FBO-V2] Pre-patch: systemInfo landscape + touch remap
(function _landscapeFBOPrePatch() {
    console.log('[FBO] === pre-patch START (v2-minimal) ===');
    if (typeof tt === 'undefined' || !tt) return;
    var raw = tt.getSystemInfoSync();
    var sw = raw.screenWidth, sh = raw.screenHeight, dpr = raw.pixelRatio || 1;
    console.log('[FBO] raw screen=' + sw + 'x' + sh + ' dpr=' + dpr);
    if (sw >= sh) { console.log('[FBO] already landscape, skip'); return; }
    var lw = sh, lh = sw;

    if (typeof GameGlobal === 'undefined') GameGlobal = {};
    GameGlobal.__fboRotation = { sw: sw, sh: sh, lw: lw, lh: lh, dpr: dpr };

    // Patch systemInfo to report landscape.
    var _swapInfo = function(info) {
        if (!info) return info;
        if (info.screenWidth < info.screenHeight) {
            var t = info.screenWidth; info.screenWidth = info.screenHeight; info.screenHeight = t;
        }
        if (info.windowWidth < info.windowHeight) {
            var t2 = info.windowWidth; info.windowWidth = info.windowHeight; info.windowHeight = t2;
        }
        if (info.safeArea) {
            var sa = info.safeArea;
            if (sa.width < sa.height) {
                var pTopInset = sa.top || 0;
                var pBotInset = sh - (sa.bottom || sh);
                var pLeftInset = sa.left || 0;
                var pRightInset = sw - (sa.right || sw);
                info.safeArea = {
                    left: pTopInset, top: pRightInset,
                    right: sh - pBotInset, bottom: sw - pLeftInset,
                    width: sh - pTopInset - pBotInset,
                    height: sw - pLeftInset - pRightInset
                };
            }
        }
        return info;
    };
    var _origSync = tt.getSystemInfoSync.bind(tt);
    tt.getSystemInfoSync = function() { return _swapInfo(_origSync()); };
    if (typeof tt.getSystemInfo === 'function') {
        var _origAsync = tt.getSystemInfo.bind(tt);
        tt.getSystemInfo = function(opts) {
            var origOK = opts && opts.success;
            return _origAsync(Object.assign({}, opts, {
                success: function(res) { _swapInfo(res); origOK && origOK(res); }
            }));
        };
    }
    console.log('[FBO] systemInfo patched to landscape');

    // Touch remap: portrait (px,py) -> landscape (gx,gy).
    var _touchDbgCount = 0;
    var _remapTouch = function(t) {
        var ox = t.clientX !== undefined ? t.clientX : (t.x || 0);
        var oy = t.clientY !== undefined ? t.clientY : (t.y || 0);
        var nx = oy;
        var ny = lh - ox;
        if (_touchDbgCount < 5) {
            console.log('[FBO] touch remap (' + ox.toFixed(1) + ',' + oy.toFixed(1) + ')->(' + nx.toFixed(1) + ',' + ny.toFixed(1) + ')');
        }
        return {
            identifier: t.identifier,
            clientX: nx, clientY: ny, pageX: nx, pageY: ny,
            screenX: nx, screenY: ny, x: nx, y: ny, force: t.force || 0
        };
    };
    var _remapList = function(list) {
        if (!list) return [];
        var out = [];
        for (var k = 0; k < list.length; k++) out.push(_remapTouch(list[k]));
        return out;
    };
    var _wrapTouch = function(origFn) {
        if (typeof origFn !== 'function') return origFn;
        var bound = origFn.bind(tt);
        return function(handler) {
            return bound(function(event) {
                _touchDbgCount++;
                var ne = {};
                for (var key in event) { try { ne[key] = event[key]; } catch(e) {} }
                ne.touches = _remapList(event.touches);
                ne.changedTouches = _remapList(event.changedTouches);
                handler(ne);
            });
        };
    };
    tt.onTouchStart  = _wrapTouch(tt.onTouchStart);
    tt.onTouchMove   = _wrapTouch(tt.onTouchMove);
    tt.onTouchEnd    = _wrapTouch(tt.onTouchEnd);
    tt.onTouchCancel = _wrapTouch(tt.onTouchCancel);
    console.log('[FBO] touch remap installed');

    // Guard onWindowResize against portrait revert.
    if (typeof tt.onWindowResize === 'function') {
        var _origOnWR = tt.onWindowResize.bind(tt);
        tt.onWindowResize = function(handler) {
            return _origOnWR(function(res) {
                if (res) {
                    if (res.windowWidth < res.windowHeight) {
                        var _t = res.windowWidth; res.windowWidth = res.windowHeight; res.windowHeight = _t;
                    }
                    if (res.screenWidth < res.screenHeight) {
                        var _t2 = res.screenWidth; res.screenWidth = res.screenHeight; res.screenHeight = _t2;
                    }
                }
                handler(res);
            });
        };
    }
    console.log('[FBO] === pre-patch END ===');
})();
`;

// ─────────────────────────────────────────────────────────────────────────────
// [B] Post-web-adapter: Minimal FBO rotation (only 1 GL hook: bindFramebuffer)
// ─────────────────────────────────────────────────────────────────────────────
const preludeB = `
// [FBO-V2] Minimal FBO rotation setup
(function _landscapeFBOSetup() {
    console.log('[FBO] === setup START (v2-minimal) ===');
    if (typeof GameGlobal === 'undefined' || !GameGlobal.__fboRotation) {
        console.log('[FBO] no config, skip'); return;
    }
    var cfg = GameGlobal.__fboRotation;
    var portraitW = Math.round(cfg.sw * cfg.dpr);
    var portraitH = Math.round(cfg.sh * cfg.dpr);
    var landscapeW = Math.round(cfg.lw * cfg.dpr);
    var landscapeH = Math.round(cfg.lh * cfg.dpr);
    console.log('[FBO] portrait=' + portraitW + 'x' + portraitH + ' landscape=' + landscapeW + 'x' + landscapeH);

    var theCanvas = GameGlobal.screencanvas || canvas;
    if (!theCanvas) { console.log('[FBO] no canvas'); return; }

    // Real canvas stays portrait (matches physical screen).
    theCanvas.width = portraitW;
    theCanvas.height = portraitH;

    var _fakeW = landscapeW, _fakeH = landscapeH;
    var _glCtx = null, _fbo = null, _fboTex = null, _fboDepth = null;
    var _blitProg = null, _blitVBO = null, _blitLoc = -1, _blitULoc = null;

    // Intercept getContext to set up FBO when WebGL is created.
    var _origGetCtx = theCanvas.getContext.bind(theCanvas);
    theCanvas.getContext = function(type, attrs) {
        if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
            if (_glCtx) return _glCtx;
            // Try requested type first, fallback to webgl
            var gl = _origGetCtx(type, attrs);
            if (!gl && type !== 'webgl') gl = _origGetCtx('webgl', attrs);
            if (!gl) { console.log('[FBO] getContext null'); return null; }
            console.log('[FBO] GL context type=' + type + ' actual=' + (gl.getParameter ? 'ok' : '?'));
            _glCtx = gl;
            _setupFBO(gl);
            return gl;
        }
        return _origGetCtx(type, attrs);
    };

    function _setupFBO(gl) {
        // Create landscape FBO.
        _fbo = gl.createFramebuffer();
        _fboTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, _fboTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, landscapeW, landscapeH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        _fboDepth = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, _fboDepth);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_STENCIL, landscapeW, landscapeH);

        gl.bindFramebuffer(gl.FRAMEBUFFER, _fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, _fboTex, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, _fboDepth);

        var status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        console.log('[FBO] FB status: ' + (status === gl.FRAMEBUFFER_COMPLETE ? 'OK' : status));

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindRenderbuffer(gl.RENDERBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);

        // Blit shader: 90-deg CCW rotation.
        var vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, 'attribute vec2 a_pos; varying vec2 v_uv; void main(){ v_uv=a_pos*0.5+0.5; gl_Position=vec4(a_pos,0.0,1.0); }');
        gl.compileShader(vs);
        var fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, 'precision mediump float; varying vec2 v_uv; uniform sampler2D u_tex; void main(){ gl_FragColor=texture2D(u_tex,vec2(1.0-v_uv.y,v_uv.x)); }');
        gl.compileShader(fs);
        _blitProg = gl.createProgram();
        gl.attachShader(_blitProg, vs);
        gl.attachShader(_blitProg, fs);
        gl.linkProgram(_blitProg);
        console.log('[FBO] blit shader: ' + gl.getProgramParameter(_blitProg, gl.LINK_STATUS));

        _blitVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, _blitVBO);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        _blitLoc = gl.getAttribLocation(_blitProg, 'a_pos');
        _blitULoc = gl.getUniformLocation(_blitProg, 'u_tex');

        // Hook: redirect bindFramebuffer(null) -> FBO.
        var _origBindFB = gl.bindFramebuffer.bind(gl);
        gl.__origBindFB = _origBindFB;
        gl.bindFramebuffer = function(target, fb) {
            if (target === gl.FRAMEBUFFER && fb === null) {
                return _origBindFB(gl.FRAMEBUFFER, _fbo);
            }
            return _origBindFB(target, fb);
        };

        // Dedicated blit VAO to avoid corrupting engine vertex state.
        // Try WebGL2 native VAO first, then OES_vertex_array_object for WebGL1.
        var _blitVAO = null;
        var _bindVAO = null;   // function(vao)
        var _vaoBindConst = 0; // getParameter constant for current VAO

        if (typeof gl.createVertexArray === 'function') {
            // WebGL2
            _blitVAO = gl.createVertexArray();
            _bindVAO = gl.bindVertexArray.bind(gl);
            _vaoBindConst = gl.VERTEX_ARRAY_BINDING;
            console.log('[FBO] using WebGL2 VAO');
        } else {
            var _vaoExt = gl.getExtension('OES_vertex_array_object');
            if (_vaoExt) {
                _blitVAO = _vaoExt.createVertexArrayOES();
                _bindVAO = _vaoExt.bindVertexArrayOES.bind(_vaoExt);
                _vaoBindConst = _vaoExt.VERTEX_ARRAY_BINDING_OES;
                console.log('[FBO] using OES_vertex_array_object');
            } else {
                console.log('[FBO] WARNING: no VAO support at all');
            }
        }

        if (_blitVAO && _bindVAO) {
            _bindVAO(_blitVAO);
            gl.bindBuffer(gl.ARRAY_BUFFER, _blitVBO);
            gl.enableVertexAttribArray(_blitLoc);
            gl.vertexAttribPointer(_blitLoc, 2, gl.FLOAT, false, 0, 0);
            _bindVAO(null);
            gl.bindBuffer(gl.ARRAY_BUFFER, null);
            console.log('[FBO] blit VAO created');
        }
        GameGlobal.__fboRotation._blitVAO = _blitVAO;
        GameGlobal.__fboRotation._bindVAO = _bindVAO;
        GameGlobal.__fboRotation._vaoBindConst = _vaoBindConst;

        // Hook texImage2D/texSubImage2D: convert ALPHA/LUMINANCE → RGBA.
        // TikTok WebGL runtime may not support legacy single-channel formats
        // used by Cocos text atlas rendering.
        var ALPHA = 0x1906, LUM = 0x1909;
        var _texDbg = 0;

        var _expandToRGBA = function(data, w, h, isAlpha) {
            var rgba = new Uint8Array(w * h * 4);
            for (var i = 0; i < w * h; i++) {
                if (isAlpha) {
                    rgba[i*4] = 255; rgba[i*4+1] = 255; rgba[i*4+2] = 255; rgba[i*4+3] = data[i];
                } else {
                    rgba[i*4] = data[i]; rgba[i*4+1] = data[i]; rgba[i*4+2] = data[i]; rgba[i*4+3] = 255;
                }
            }
            return rgba;
        };

        var _origTexImage2D = gl.texImage2D.bind(gl);
        gl.texImage2D = function() {
            var a = Array.prototype.slice.call(arguments);
            // Log first few uploads for diagnostics
            if (_texDbg < 20) {
                _texDbg++;
                if (a.length === 6) {
                    var _srcName = 'unknown';
                    try { _srcName = a[5] && a[5].constructor ? a[5].constructor.name : typeof a[5]; } catch(e) {}
                    console.log('[FBO][TEX] 6-arg ifmt=' + a[2] + ' fmt=' + a[3] + ' src=' + _srcName);
                } else if (a.length >= 9) {
                    console.log('[FBO][TEX] 9-arg ifmt=' + a[2] + ' fmt=' + a[6] + ' ' + a[3] + 'x' + a[4] + ' data=' + (a[8] ? a[8].constructor.name : 'null'));
                }
            }
            // 9-arg form: (target, level, internalformat, width, height, border, format, type, data)
            if (a.length >= 9) {
                var ifmt = a[2], fmt = a[6];
                if (ifmt === ALPHA || ifmt === LUM || fmt === ALPHA || fmt === LUM) {
                    var isA = (ifmt === ALPHA || fmt === ALPHA);
                    var w = a[3], h = a[4], d = a[8];
                    if (d && d.length && d.length === w * h) {
                        a[8] = _expandToRGBA(d, w, h, isA);
                    }
                    a[2] = gl.RGBA; a[6] = gl.RGBA;
                }
            }
            return _origTexImage2D.apply(gl, a);
        };

        var _origTexSubImage2D = gl.texSubImage2D.bind(gl);
        gl.texSubImage2D = function() {
            var a = Array.prototype.slice.call(arguments);
            // 9-arg form: (target, level, xoff, yoff, width, height, format, type, data)
            if (a.length >= 9) {
                var fmt = a[6];
                if (fmt === ALPHA || fmt === LUM) {
                    var isA = (fmt === ALPHA);
                    var w = a[4], h = a[5], d = a[8];
                    if (d && d.length && d.length === w * h) {
                        a[8] = _expandToRGBA(d, w, h, isA);
                    }
                    a[6] = gl.RGBA;
                }
            }
            return _origTexSubImage2D.apply(gl, a);
        };

        console.log('[FBO] FBO ready, blit shader ready, tex hooks installed');
    }

    // ── Blit: copy FBO to real screen with 90-deg rotation ──
    var _blitCount = 0;

    function _blitToScreen() {
        if (!_glCtx || !_fbo || !_blitProg) return;
        var gl = _glCtx;
        var cfg2 = GameGlobal.__fboRotation;
        var bvao = cfg2._blitVAO;
        var bBindVAO = cfg2._bindVAO;
        var bVaoConst = cfg2._vaoBindConst;

        // Save state via getParameter (wrapped in try/catch for DevTools resilience).
        var prev = {};
        try {
            prev.vp = gl.getParameter(gl.VIEWPORT);
            prev.prog = gl.getParameter(gl.CURRENT_PROGRAM);
            prev.atu = gl.getParameter(gl.ACTIVE_TEXTURE);
            prev.ab = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
            prev.blend = gl.isEnabled(gl.BLEND);
            prev.depth = gl.isEnabled(gl.DEPTH_TEST);
            prev.cull = gl.isEnabled(gl.CULL_FACE);
            prev.scissor = gl.isEnabled(gl.SCISSOR_TEST);
            prev.stencil = gl.isEnabled(gl.STENCIL_TEST);
            prev.cmask = gl.getParameter(gl.COLOR_WRITEMASK);
            gl.activeTexture(gl.TEXTURE0);
            prev.tex0 = gl.getParameter(gl.TEXTURE_BINDING_2D);
            if (prev.atu !== gl.TEXTURE0) gl.activeTexture(prev.atu);
            // Save VAO (WebGL2 or OES extension)
            if (bBindVAO && bVaoConst) {
                prev.vao = gl.getParameter(bVaoConst);
            }
            prev.eab = gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING);
            prev.ok = true;
        } catch(e) { prev.ok = false; }

        // Draw rotated quad to real screen.
        gl.__origBindFB(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, portraitW, portraitH);
        gl.disable(gl.BLEND);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.disable(gl.SCISSOR_TEST);
        gl.disable(gl.STENCIL_TEST);
        gl.colorMask(true, true, true, true);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(_blitProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, _fboTex);
        gl.uniform1i(_blitULoc, 0);

        // Use dedicated VAO (WebGL2 or OES extension) to isolate vertex state.
        if (bvao && bBindVAO) {
            bBindVAO(bvao);
        } else {
            gl.bindBuffer(gl.ARRAY_BUFFER, _blitVBO);
            gl.enableVertexAttribArray(_blitLoc);
            gl.vertexAttribPointer(_blitLoc, 2, gl.FLOAT, false, 0, 0);
        }
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // Restore state: re-bind FBO for next frame, then restore saved state.
        gl.__origBindFB(gl.FRAMEBUFFER, _fbo);

        if (prev.ok) {
            try {
                // Restore VAO first — this restores all vertex attrib state.
                if (prev.vao !== undefined && bBindVAO) {
                    bBindVAO(prev.vao);
                }
                // Note: if no VAO at all, do NOT disableVertexAttribArray — that
                // would corrupt the engine's state cache. Leave attrib enabled.
                gl.viewport(prev.vp[0], prev.vp[1], prev.vp[2], prev.vp[3]);
                if (prev.blend) gl.enable(gl.BLEND);
                if (prev.depth) gl.enable(gl.DEPTH_TEST);
                if (prev.cull) gl.enable(gl.CULL_FACE);
                if (prev.scissor) gl.enable(gl.SCISSOR_TEST);
                if (prev.stencil) gl.enable(gl.STENCIL_TEST);
                if (prev.cmask) gl.colorMask(prev.cmask[0], prev.cmask[1], prev.cmask[2], prev.cmask[3]);
                gl.useProgram(prev.prog);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, prev.tex0);
                if (prev.atu !== gl.TEXTURE0) gl.activeTexture(prev.atu);
                gl.bindBuffer(gl.ARRAY_BUFFER, prev.ab);
                if (prev.eab !== undefined) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, prev.eab);
            } catch(e) {}
        }

        _blitCount++;
        if (_blitCount <= 3) console.log('[FBO] blit #' + _blitCount + ' vao=' + !!bvao + ' bindVAO=' + !!bBindVAO);
    }

    // Wrap requestAnimationFrame: blit after each engine frame.
    var _origRAF = (typeof requestAnimationFrame !== 'undefined') ? requestAnimationFrame : null;
    var _textStabilityApplied = false;
    if (_origRAF) {
        var _wrappedRAF = function(callback) {
            return _origRAF.call(typeof window !== 'undefined' ? window : GameGlobal, function(ts) {
                // Text stability: disable dynamic atlas on early frames.
                if (!_textStabilityApplied && typeof cc !== 'undefined') {
                    try {
                        if (cc.dynamicAtlasManager) {
                            cc.dynamicAtlasManager.enabled = false;
                            console.log('[FBO] dynamicAtlas disabled');
                        }
                        _textStabilityApplied = true;
                    } catch(e) {}
                }
                try { callback(ts); } catch(e) {
                    if (_blitCount < 5) console.log('[FBO] RAF cb err: ' + (e && e.message || e));
                }
                try { _blitToScreen(); } catch(e) {
                    if (_blitCount < 5) console.log('[FBO] blit err: ' + (e && e.message || e));
                }
            });
        };
        if (typeof globalThis !== 'undefined') globalThis.requestAnimationFrame = _wrappedRAF;
        if (typeof window !== 'undefined') window.requestAnimationFrame = _wrappedRAF;
    }

    // Fake canvas dimensions: engine must see landscape.
    try {
        Object.defineProperty(theCanvas, 'width', {
            get: function() { return _fakeW; },
            set: function(v) { /* ignore: keep fake landscape */ },
            configurable: true
        });
        Object.defineProperty(theCanvas, 'height', {
            get: function() { return _fakeH; },
            set: function(v) { /* ignore: keep fake landscape */ },
            configurable: true
        });
    } catch(e) { console.log('[FBO] canvas override err: ' + e.message); }

    theCanvas.getBoundingClientRect = function() {
        return { top: 0, left: 0, width: cfg.lw, height: cfg.lh, right: cfg.lw, bottom: cfg.lh, x: 0, y: 0 };
    };

    if (typeof screen !== 'undefined' && screen.width < screen.height) {
        var _t = screen.width; screen.width = screen.height; screen.height = _t;
    }
    if (typeof window !== 'undefined' && window.innerWidth < window.innerHeight) {
        var _t2 = window.innerWidth; window.innerWidth = window.innerHeight; window.innerHeight = _t2;
    }

    console.log('[FBO] === setup END (v2-minimal) ===');
})();
`;

// ─────────────────────────────────────────────────────────────────────────────
// Inject patches into game.js
// ─────────────────────────────────────────────────────────────────────────────

// [A] before loadCC()
if (!source.includes('_landscapeFBOPrePatch') && source.includes('loadCC();')) {
    source = source.replace('loadCC();', preludeA + '\nloadCC();');
}

// [B] after require('./web-adapter')
if (!source.includes('_landscapeFBOSetup') && source.includes("require('./web-adapter');")) {
    source = source.replace("require('./web-adapter');", "require('./web-adapter');" + preludeB);
}

// Strip stale patches from prior builds.
source = source.replace(/const tryLandscapeAPIs[\s\S]*?tryLandscapeAPIs\(\);/g, '');
source = source.replace(
    /const _patchSystemInfoLandscape[\s\S]*?_patchSystemInfoLandscape\(\);/g,
    ''
);
source = source.replace(/\(function _tryPlatformLandscape[\s\S]*?\}\)\(\);/g, '');
source = source.replace(/\(function _forceLandscapeRotation[\s\S]*?\}\)\(\);/g, '');
source = source.replace(/\(function _landscapePrePatches[\s\S]*?\}\)\(\);/g, '');
source = source.replace(/\(function _landscapeCanvasSwap[\s\S]*?\}\)\(\);/g, '');
source = source.replace(/\(function _landscapeSystemInfoPatch[\s\S]*?\}\)\(\);/g, '');
source = source.replace(/\(function _gvrLandscapeLitePrePatch[\s\S]*?\}\)\(\);/g, '');
source = source.replace(/\(function _gvrLandscapeLiteCanvasPatch[\s\S]*?\}\)\(\);/g, '');

// ── Neutralize template canvas swap / DPR blocks ──
// IOS canvas swap block
const iosSwapPattern = /\/\/ Adapt for IOS.*?canvas\.height = _h;\s*\}/s;
const landscapeForcePattern = /\/\/ Force landscape canvas.*?canvas\.height = _cw;\s*\n\s*\}/s;
const fboGuardedPattern =
    /\/\/ Canvas dims guarded by FBO.*?console\.log\('\[FBO\] skip canvas adaptation'\);\s*\}/s;
const patternToReplace = iosSwapPattern.test(source)
    ? iosSwapPattern
    : landscapeForcePattern.test(source)
      ? landscapeForcePattern
      : fboGuardedPattern.test(source)
        ? null
        : null;
if (patternToReplace) {
    source = source.replace(
        patternToReplace,
        `// Canvas dims guarded by FBO rotation.
    if (typeof GameGlobal !== 'undefined' && GameGlobal.__fboRotation) {
        console.log('[FBO] skip canvas adaptation');
    }`
    );
}

// DPR guard
const dprPattern =
    /if \(canvas && window\.devicePixelRatio >= 2\)\s*\{canvas\.width \*= 2; canvas\.height \*= 2;\}/;
const dprDbgPattern = /console\.log\('\[LS-DBG\] DPR=.*?canvas FINAL after DPR:.*?\);/s;
const dprToReplace = dprPattern.test(source)
    ? dprPattern
    : dprDbgPattern.test(source)
      ? dprDbgPattern
      : null;
if (dprToReplace) {
    source = source.replace(
        dprToReplace,
        'if (!GameGlobal.__fboRotation && canvas && window.devicePixelRatio >= 2) { canvas.width *= 2; canvas.height *= 2; }'
    );
}

fs.writeFileSync(gameJsPath, source);
console.log('[fbo-patch-v2] Applied minimal FBO rotation patch to ' + gameJsPath);
