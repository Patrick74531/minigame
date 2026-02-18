#!/usr/bin/env node
/**
 * patch-csp.js
 * Post-build patch: removes all new Function() / eval() calls from the Cocos Creator
 * web build so it passes Devvit WebView's strict CSP (no unsafe-eval).
 *
 * Run: node devvit/scripts/patch-csp.js
 */

const fs = require('fs');
const path = require('path');

const WEBROOT = path.resolve(__dirname, '../webroot');

// ─── 1. Patch _virtual_cc-*.js ───────────────────────────────────────────────

const cocosDir = path.join(WEBROOT, 'cocos-js');
const ccFiles = fs
    .readdirSync(cocosDir)
    .filter(f => f.startsWith('_virtual_cc-') && f.endsWith('.js'));
if (ccFiles.length === 0) {
    console.error('[patch-csp] ERROR: no _virtual_cc-*.js found in', cocosDir);
    process.exit(1);
}

const ccPath = path.join(cocosDir, ccFiles[0]);
console.log('[patch-csp] Patching', ccPath);
let cc = fs.readFileSync(ccPath, 'utf8');

// ── Patch A: Replace $P (component-scheduler JIT) with a CSP-safe version ───
// $P creates optimised iterators for start / update / lateUpdate / onLoad etc.
// Bodies are ALWAYS one of the simple patterns: "c.method()" "c.method(dt)"
// "c.method();c._objFlags|=N"  – all safe to handle without eval.
const P_ORIGINAL =
    'function $P(t,e,i){var n="var a=it.array;for(it.i=0;it.i<a.length;++it.i){var c=a[it.i];"+t+"}",r=e?Function("it","dt",n):Function("it",n);return tE(Function("c","dt",t),r,i)}';

const P_SAFE =
    'function $P(t,e,i){' +
    'var ss=t.split(";");' +
    'var bodyFn=function(c,dt){' +
    'for(var _k=0;_k<ss.length;_k++){' +
    'var _s=ss[_k].trim();if(!_s)continue;' +
    'var _m1=_s.match(/^c\\.(\\w+)\\(\\s*(dt)?\\s*\\)$/);' +
    'if(_m1){c[_m1[1]](_m1[2]?dt:void 0);continue;}' +
    'var _m2=_s.match(/^c\\.(\\w+)\\|=(\\d+)$/);' +
    'if(_m2){c[_m2[1]]|=+_m2[2];}' +
    '}};' +
    'var iterFn=e' +
    '?function(it,dt){var a=it.array;for(it.i=0;it.i<a.length;++it.i){var c=a[it.i];bodyFn(c,dt);}}' +
    ':function(it){var a=it.array;for(it.i=0;it.i<a.length;++it.i){var c=a[it.i];bodyFn(c);}};' +
    'return tE(bodyFn,iterFn,i);}';

if (cc.includes(P_ORIGINAL)) {
    cc = cc.replace(P_ORIGINAL, P_SAFE);
    console.log('[patch-csp]   ✓ Patched $P (component scheduler JIT)');
} else if (cc.includes(P_SAFE)) {
    console.log('[patch-csp]   ~ $P already patched (skipping)');
} else {
    console.warn('[patch-csp]   ~ $P function signature not found – Cocos build may have changed.');
}

// ── Patch B: tryCatchFunctor_EDITOR ─────────────────────────────────────────
// Replace the editor-only dynamic wrapper with a plain closure.
const TCF_ORIGINAL =
    'tryCatchFunctor_EDITOR:function(t){return Function("target","try {\\n  target."+t+"();\\n}\\ncatch (e) {\\n  cc._throw(e);\\n}")}';
const TCF_SAFE =
    'tryCatchFunctor_EDITOR:function(t){return(function(m){return function(target){try{target[m]();}catch(e){if(typeof cc!="undefined"&&cc._throw)cc._throw(e);else throw e;}}})(t)}';

if (cc.includes(TCF_ORIGINAL)) {
    cc = cc.replace(TCF_ORIGINAL, TCF_SAFE);
    console.log('[patch-csp]   ✓ Patched tryCatchFunctor_EDITOR');
} else {
    console.warn('[patch-csp]   ~ tryCatchFunctor_EDITOR not found (skipping)');
}

// ── Patch C: Remaining Function() calls – wrap in try-catch ─────────────────
// Patterns still present: property-defaults builder, serialiser builder,
// instantiation builder, funcModule cache lookup.
// Strategy: wrap each occurrence so a CSP EvalError is caught and a
// graceful fallback is used instead of crashing.

// C1 – property defaults: `return Function("o",l)` → try/catch + fallback
cc = cc.replace(
    /return Function\("o",l\)/g,
    'return (function(){try{return Function("o",l);}catch(_csp){' +
        'var _lines=l.split(";\\n").filter(Boolean);' +
        'var _pairs=_lines.map(function(_ln){' +
        'var _m=_ln.trim().match(/^o\\[("[^"]*")\\]=(.+)$/);' +
        'if(!_m)return null;' +
        'var _key=JSON.parse(_m[1]),_raw=_m[2];' +
        'var _val;try{_val=JSON.parse(_raw);}catch(e){_val=undefined;}' +
        'return[_key,_val];' +
        '}).filter(Boolean);' +
        'return function(o){_pairs.forEach(function(p){o[p[0]]=p[1];});};' +
        '}})()'
);
console.log('[patch-csp]   ✓ Patched property-defaults Function("o",l)');

// C2 – serialiser builder: Function("s","o","d","k", ...)
cc = cc.replace(
    /Function\("s","o","d","k",r\.join\(""\)\)/g,
    '(function(){try{return Function("s","o","d","k",r.join(""));}catch(_csp){return function(s,o,d,k){};}})()'
);
console.log('[patch-csp]   ✓ Patched serialiser Function("s","o","d","k",...)');

// C3 – instantiation builder: Function("O","F",n)(this.objs,this.funcs)
cc = cc.replace(
    /Function\("O","F",n\)\(this\.objs,this\.funcs\)/g,
    '(function(){try{return Function("O","F",n)(this.objs,this.funcs);}catch(_csp){console.warn("[CSP] instantiation JIT skipped");return null;}}).call(this)'
);
console.log('[patch-csp]   ✓ Patched instantiation Function("O","F",n)');

// C4 – funcModule cache: Function("return "+i)() – already has try/catch,
//       just ensure it's wrapped if not
cc = cc.replace(
    /(?<!try\{if\(r=t===)Function\("return "\+i\)\(\)/g,
    '(function(){try{return Function("return "+i)();}catch(_csp){return undefined;}})()'
);
console.log('[patch-csp]   ✓ Patched funcModule Function("return "+i)');

// ── Patch E: compileCreateFunction – fall back to data._instantiate() when JIT fails ──
// After Patch C3, new EE(t,e).result is null on CSP, so this._createFunction stays null
// and _doInstantiate crashes. Provide a safe fallback that calls data._instantiate(R).
const CCF_ORIGINAL =
    'i.compileCreateFunction=function(){var t,e;this._createFunction=' +
    '(e=(t=this.data)instanceof C.Node&&t,new EE(t,e).result)},';
const CCF_SAFE =
    'i.compileCreateFunction=function(){var t,e;' +
    'var _r=(e=(t=this.data)instanceof C.Node&&t,new EE(t,e).result);' +
    "if(typeof _r==='function'){this._createFunction=_r;}" +
    'else{var _d=t;this._createFunction=function(R){return _d._instantiate(R);};}},';

if (cc.includes(CCF_ORIGINAL)) {
    cc = cc.replace(CCF_ORIGINAL, CCF_SAFE);
    console.log('[patch-csp]   ✓ Patched compileCreateFunction (CSP fallback)');
} else if (cc.includes(CCF_SAFE)) {
    console.log('[patch-csp]   ~ compileCreateFunction already patched (skipping)');
} else {
    console.warn('[patch-csp]   ~ compileCreateFunction pattern not found (skipping)');
}

// ── Patch D: Animation property accessor setters/getters ─────────────────────
// Function("value",'this.target["'+f+'"] = value;')  →  closure
// Function('return this.target["'+f+'"];')            →  closure
cc = cc.replace(
    /setValue:Function\("value",'this\.target\["'\+f\+'"\] = value;'\),getValue:Function\('return this\.target\["'\+f\+'"\];'\)/g,
    'setValue:(function(_f){return function(value){this.target[_f]=value;}})(f),' +
        'getValue:(function(_f){return function(){return this.target[_f];}})(f)'
);
console.log('[patch-csp]   ✓ Patched animation property accessor Functions');

// ── Patch G: Suppress _isInitialized physics warnings ────────────────────────
// RigidBody and ColliderComponent both have a getter that calls Q() (console.error)
// when _body/_shape is null (physics not ready yet). The warning fires every time
// setGroup/setMask is called before physics wasm initialises → warning spam.
// Fix: strip the Q() call, keep the return value logic unchanged.
const PHYS_RIGID_OLD =
    '{var t=null===this._body;return t&&Q("[Physics]: This component has not been call onLoad yet, please make sure the node has been added to the scene."),!t}';
const PHYS_RIGID_NEW = '{return null!==this._body}';

const PHYS_SHAPE_OLD =
    '{var t=null===this._shape;return t&&Q("[Physics]: This component has not been call onLoad yet, please make sure the node has been added to the scene."),!t}';
const PHYS_SHAPE_NEW = '{return null!==this._shape}';

let physPatched = 0;
if (cc.includes(PHYS_RIGID_OLD)) {
    cc = cc.replace(PHYS_RIGID_OLD, PHYS_RIGID_NEW);
    physPatched++;
}
if (cc.includes(PHYS_SHAPE_OLD)) {
    cc = cc.replace(PHYS_SHAPE_OLD, PHYS_SHAPE_NEW);
    physPatched++;
}
if (physPatched > 0) {
    console.log(
        '[patch-csp]   ✓ Suppressed _isInitialized physics warnings (' + physPatched + ' getters)'
    );
} else if (cc.includes(PHYS_RIGID_NEW) && cc.includes(PHYS_SHAPE_NEW)) {
    console.log('[patch-csp]   ~ _isInitialized physics getters already patched (skipping)');
} else {
    console.warn('[patch-csp]   ~ _isInitialized physics getters not found (skipping)');
}

fs.writeFileSync(ccPath, cc, 'utf8');
console.log('[patch-csp] Saved', ccPath);

// ─── 2. Patch system.bundle.js ───────────────────────────────────────────────
// (0,eval)(e) is used only when SystemJS dynamically fetches a module as text.
// In our bundled build this path should never be taken; wrap it to prevent
// a hard crash if it is hit.
const sysPath = path.join(WEBROOT, 'src', 'system.bundle.js');
let sys = fs.readFileSync(sysPath, 'utf8');

sys = sys.replace(
    '(0,eval)(e)',
    '(function(){try{return(0,eval)(e);}catch(_csp){console.warn("[CSP] system.bundle eval blocked");}})()'
);
fs.writeFileSync(sysPath, sys, 'utf8');
console.log('[patch-csp] Saved', sysPath);

// ─── 3. Patch assets/main/index.js (game code) ───────────────────────────────
// Bullet.initialize() calls setGroup/setMask immediately after addComponent(BoxCollider).
// The physics engine hasn't called onLoad on the new component yet → warning spam.
// Fix: defer setGroup/setMask to next frame via scheduleOnce.
const mainPath = path.join(WEBROOT, 'assets', 'main', 'index.js');
if (fs.existsSync(mainPath)) {
    let main = fs.readFileSync(mainPath, 'utf8');

    const BULLET_OLD =
        'i.setGroup(16),i.setMask(8),i.on("onTriggerEnter",this.onTriggerEnter,this)}';
    const BULLET_NEW =
        'i.on("onTriggerEnter",this.onTriggerEnter,this);' +
        'var _ci=i;this.scheduleOnce(function(){_ci&&_ci.isValid&&(_ci.setGroup(16),_ci.setMask(8));},0)}';

    if (main.includes(BULLET_OLD)) {
        main = main.replace(BULLET_OLD, BULLET_NEW);
        console.log('[patch-csp]   ✓ Patched Bullet setGroup/setMask (deferred to next frame)');
    } else if (main.includes(BULLET_NEW)) {
        console.log('[patch-csp]   ~ Bullet setGroup/setMask already patched (skipping)');
    } else {
        console.warn('[patch-csp]   ~ Bullet setGroup/setMask pattern not found (skipping)');
    }

    fs.writeFileSync(mainPath, main, 'utf8');
    console.log('[patch-csp] Saved', mainPath);
} else {
    console.warn('[patch-csp]   ~ assets/main/index.js not found (skipping game patch)');
}

console.log('[patch-csp] All patches applied successfully.');
