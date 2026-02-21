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

const WEBROOT = process.env.WEBROOT
    ? path.resolve(process.env.WEBROOT)
    : path.resolve(__dirname, '../webroot');

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
// Call signature: n(this=deserializer, targetObj, srcData, classSchema)
//   s = deserializer (Fg instance, has _deserializeAndAssignField / _deserializeObjectField)
//   o = target object to populate
//   d = raw CCONB source data
//   k = class schema (has __values__)
// _rv: recursively revive a value; resolves {__id__:N} cross-refs via s._deserializeObjectField
//      so nested object references (e.g. _exoticAnimation) are properly resolved.
// Top-level __id__ props: delegate to s._deserializeAndAssignField which handles
//   deserializedList lookup / lazy _deserializeObject – this is what sets _exoticAnimation.
const C2_REFLECT_FN_OLD_ID_LINE = 'if(typeof v.__id__==="number")return v;';
const C2_REFLECT_FN =
    'function(s,o,d,k){' +
    'try{' +
    'function _rv(v){' +
    'if(!v||typeof v!=="object")return v;' +
    'if(Array.isArray(v))return v.map(_rv);' +
    'if(typeof v.__id__==="number"){' +
    'if(s&&s._deserializeObjectField){try{return s._deserializeObjectField(v);}catch(_e4){}}' +
    'return v;}' +
    'if(typeof v.__type__==="string"){' +
    'if(v.__type__==="TypedArrayRef"){' +
    'if(!globalThis._dbgTaLogged){globalThis._dbgTaLogged=1;' +
    'console.warn("[DBG-TA] ctor="+v.ctor+" off="+v.offset+" len="+v.length' +
    '+" hasChunk="+(s&&s._mainBinChunk?s._mainBinChunk.length:"NULL")' +
    '+" sNull="+(s==null));}' +
    'try{if(s&&s._mainBinChunk){' +
    'var _ta=new globalThis[v.ctor](s._mainBinChunk.buffer,s._mainBinChunk.byteOffset+v.offset,v.length);' +
    'if(!globalThis._dbgTaOk){globalThis._dbgTaOk=1;console.warn("[DBG-TA] OK len="+_ta.length);}' +
    'return _ta;}' +
    'if(s&&s._deserializeTypedArrayViewRef)return s._deserializeTypedArrayViewRef(v);}' +
    'catch(_e5){if(!globalThis._dbgTaErr){globalThis._dbgTaErr=1;console.error("[DBG-TA] ERR: "+_e5.message+" off="+v.offset+" chunkLen="+(s&&s._mainBinChunk?s._mainBinChunk.length:0));}}' +
    'return v;}' +
    'if(v.__type__==="TypedArray"){try{return globalThis[v.ctor].from(v.array);}catch(_e6){}return v;}' +
    'var _c;try{_c=js.getClassByName(v.__type__);}catch(_e2){}' +
    'if(_c){' +
    'var _inst=new _c();' +
    'for(var _q in v){if(_q==="__type__")continue;try{_inst[_q]=_rv(v[_q]);}catch(_e3){}}' +
    'return _inst;' +
    '}' +
    '}' +
    'var _r={};for(var _q2 in v)_r[_q2]=_rv(v[_q2]);return _r;' +
    '}' +
    'var _vals=(s&&s.__values__)||(k&&k.__values__)||[];' +
    'for(var _i=0;_i<_vals.length;_i++){' +
    'var _p=_vals[_i];if(_p==="_$erialized")continue;' +
    'var _v=d[_p];if(typeof _v==="undefined")continue;' +
    'if(_v!==null&&typeof _v==="object"){' +
    'if(s&&s._deserializeAndAssignField){var _af=false;try{s._deserializeAndAssignField(o,_v,_p);_af=true;}catch(_e5){}if(_af)continue;}}' +
    'o[_p]=_rv(_v);' +
    '}' +
    'if(d._id!==undefined&&o._id!==undefined)o._id=d._id;' +
    '}catch(_e){}}';

cc = cc.replace(
    /Function\("s","o","d","k",r\.join\(""\)\)/g,
    '(function(){try{return Function("s","o","d","k",r.join(""));}catch(_csp){return ' +
        C2_REFLECT_FN +
        ';}})()'
);
console.log('[patch-csp]   ✓ Patched serialiser Function("s","o","d","k",...)');

// C2-upgrade: if the file already has the OLD reflect fallback (skips __id__ refs),
// replace it with the NEW one that resolves them via s._deserializeAndAssignField.
// This handles re-runs where the original Function() call is already gone.
const C2_OLD_ID_SKIP = 'if(typeof v.__id__==="number")return v;';
const C2_NEW_ID_RESOLVE =
    'if(typeof v.__id__==="number"){' +
    'if(s&&s._deserializeObjectField){try{return s._deserializeObjectField(v);}catch(_e4){}}' +
    'return v;}';
if (cc.includes(C2_OLD_ID_SKIP)) {
    cc = cc.replace(
        new RegExp(C2_OLD_ID_SKIP.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        C2_NEW_ID_RESOLVE
    );
    console.log('[patch-csp]   ✓ C2-upgrade: patched __id__ resolver in reflect fallback (_rv)');
} else if (cc.includes(C2_NEW_ID_RESOLVE.slice(0, 40))) {
    console.log('[patch-csp]   ~ C2-upgrade: __id__ resolver already up to date (skipping)');
} else {
    console.warn('[patch-csp]   ~ C2-upgrade: __id__ pattern not found in reflect fallback');
}

const C2_OLD_ID_CONTINUE =
    'if(_v!==null&&typeof _v==="object"&&typeof _v.__id__==="number")continue;';
const C2_NEW_ID_ASSIGN =
    'if(_v!==null&&typeof _v==="object"&&typeof _v.__id__==="number"){' +
    'if(s&&s._deserializeAndAssignField){try{s._deserializeAndAssignField(o,_v,_p);}catch(_e5){}}' +
    'continue;}';
if (cc.includes(C2_OLD_ID_CONTINUE)) {
    cc = cc.replace(
        new RegExp(C2_OLD_ID_CONTINUE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        C2_NEW_ID_ASSIGN
    );
    console.log(
        '[patch-csp]   ✓ C2-upgrade: patched __id__ assign in reflect fallback (props loop)'
    );
} else if (cc.includes(C2_NEW_ID_ASSIGN.slice(0, 50))) {
    console.log('[patch-csp]   ~ C2-upgrade: __id__ assign already up to date (skipping)');
} else {
    console.warn('[patch-csp]   ~ C2-upgrade: __id__ assign pattern not found in reflect fallback');
}

// C2-upgrade-TypedArray: _rv doesn't resolve TypedArrayRef/TypedArray → stubs remain.
// Root cause of tracks:0 and T-pose even after .cconb is loaded.
// The engine's _deserializeTypedArrayViewRef uses this._mainBinChunk (a Uint8Array from the
// CCON binary) to create typed array views. Without this, values stay as {__type__:"TypedArrayRef"}.
const C2_TA_OLD =
    'if(typeof v.__type__==="string"){var _c;try{_c=js.getClassByName(v.__type__);}catch(_e2){}';
const C2_TA_NEW =
    'if(typeof v.__type__==="string"){' +
    'if(v.__type__==="TypedArrayRef"){' +
    'try{if(s&&s._mainBinChunk){return new globalThis[v.ctor](s._mainBinChunk.buffer,s._mainBinChunk.byteOffset+v.offset,v.length);}' +
    'if(s&&s._deserializeTypedArrayViewRef)return s._deserializeTypedArrayViewRef(v);}catch(_e5){}return v;}' +
    'if(v.__type__==="TypedArray"){try{return globalThis[v.ctor].from(v.array);}catch(_e6){}return v;}' +
    'var _c;try{_c=js.getClassByName(v.__type__);}catch(_e2){}';
if (cc.includes('v.__type__==="TypedArrayRef"')) {
    console.log(
        '[patch-csp]   ~ C2-upgrade-TypedArray: TypedArrayRef handling already present (skipping)'
    );
} else if (cc.includes(C2_TA_OLD)) {
    cc = cc.replace(C2_TA_OLD, C2_TA_NEW);
    console.log(
        '[patch-csp]   ✓ C2-upgrade-TypedArray: _rv now resolves TypedArrayRef/TypedArray via _mainBinChunk'
    );
} else {
    console.warn(
        '[patch-csp]   ~ C2-upgrade-TypedArray: _rv __type__ pattern not found (skipping)'
    );
}

// C2-upgrade-AllObjects: extend __values__ loop to delegate ALL object-type props to
// _deserializeAndAssignField (not just __id__ ones). This lets the engine properly handle
// TypedArrayRef, __uuid__, and nested objects that are direct properties in the schema.
const C2_AO_OLD =
    'if(_v!==null&&typeof _v==="object"&&typeof _v.__id__==="number"){' +
    'if(s&&s._deserializeAndAssignField){try{s._deserializeAndAssignField(o,_v,_p);}catch(_e5){}}' +
    'continue;}';
const C2_AO_NEW =
    'if(_v!==null&&typeof _v==="object"){' +
    'if(s&&s._deserializeAndAssignField){var _af=false;try{s._deserializeAndAssignField(o,_v,_p);_af=true;}catch(_e5){}if(_af)continue;}}';
if (cc.includes('_af=true')) {
    console.log(
        '[patch-csp]   ~ C2-upgrade-AllObjects: all-objects loop already present (skipping)'
    );
} else if (cc.includes(C2_AO_OLD)) {
    cc = cc.replace(C2_AO_OLD, C2_AO_NEW);
    console.log(
        '[patch-csp]   ✓ C2-upgrade-AllObjects: __values__ loop now delegates all objects to _deserializeAndAssignField'
    );
} else {
    console.warn(
        '[patch-csp]   ~ C2-upgrade-AllObjects: __values__ loop pattern not found (skipping)'
    );
}

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
const CCF_SAFE_V1 =
    'i.compileCreateFunction=function(){var t,e;' +
    'var _r=(e=(t=this.data)instanceof C.Node&&t,new EE(t,e).result);' +
    "if(typeof _r==='function'){this._createFunction=_r;}" +
    'else{var _d=t;this._createFunction=function(R){return _d._instantiate(R);};}},';
// v2: wrap EE constructor in try-catch (throws for SkeletalAnimation nodes) AND
//     wrap _d._instantiate(R) in try-catch (throws for complex prefabs) so that
//     cc.instantiate() returns null gracefully instead of propagating the error.
const CCF_SAFE =
    'i.compileCreateFunction=function(){var t,e;' +
    'var _r=null;try{_r=(e=(t=this.data)instanceof C.Node&&t,new EE(t,e).result);}catch(_ce){}' +
    "if(typeof _r==='function'){this._createFunction=_r;}" +
    'else{var _d=this.data;this._createFunction=function(R){' +
    'try{return _d._instantiate(R);}catch(_ie){console.warn("[CSP] _instantiate fallback failed:",_ie&&_ie.message);return null;}' +
    '};}},';

if (cc.includes(CCF_ORIGINAL)) {
    cc = cc.replace(CCF_ORIGINAL, CCF_SAFE);
    console.log('[patch-csp]   ✓ Patched compileCreateFunction (CSP fallback v2)');
} else if (cc.includes(CCF_SAFE)) {
    console.log('[patch-csp]   ~ compileCreateFunction already patched v2 (skipping)');
} else if (cc.includes(CCF_SAFE_V1)) {
    cc = cc.replace(CCF_SAFE_V1, CCF_SAFE);
    console.log(
        '[patch-csp]   ✓ Upgraded compileCreateFunction to v2 (try-catch around EE+instantiate)'
    );
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

// ── Patch E: Guard l.channels() in _createEvalWithBinder ─────────────────────
// When CCONB assets are deserialised via the reflect-based fallback (Patch C2),
// some Track objects become plain JS objects without the channels() prototype
// method. The guard below skips such tracks instead of throwing, so the loop
// completes and _exoticAnimation.createEvaluator() is reached — which is the
// actual driver of GLTF skeletal animation data.
const CHANNELS_OLD =
    'if(!r.includes(l)&&!Array.from(l.channels()).every((function(t){return 0===t.curve.keyFramesCount}))){';
const CHANNELS_NEW =
    'if(!r.includes(l)&&typeof l.channels==="function"&&!Array.from(l.channels()).every((function(t){return 0===t.curve.keyFramesCount}))){';
if (cc.includes(CHANNELS_OLD)) {
    cc = cc.replace(CHANNELS_OLD, CHANNELS_NEW);
    console.log('[patch-csp]   ✓ Patch E: guarded l.channels() in _createEvalWithBinder');
} else if (cc.includes(CHANNELS_NEW)) {
    console.log('[patch-csp]   ~ Patch E already applied (skipping)');
} else {
    console.warn('[patch-csp]   ~ Patch E: _createEvalWithBinder channels pattern not found');
}

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

// ── Patch L: V3 typed-array guard for scale ─────────────────────────────────
// Skip scale evaluator when values is not a real typed array (e.g. {__id__:N} stub).
// Previously used a zero-value scan which incorrectly blocked valid near-zero data.
// BYTES_PER_ELEMENT exists on Float32Array/Float64Array but not on plain objects.
const L_OLD = 'n&&(this._scale=Z3(n.times,n.values,ir,t,"scale",r))';
const L_OLD2 = 'n&&n.values&&(function(_sv){var _nz=false'; // old zero-scan prefix
const L_NEW =
    'n&&n.values&&typeof n.values.BYTES_PER_ELEMENT==="number"&&' +
    '(this._scale=Z3(n.times,n.values,ir,t,"scale",r))';
if (cc.includes(L_NEW.slice(0, 50))) {
    console.log('[patch-csp]   ~ Patch L already at typed-array version (skipping)');
} else if (cc.includes(L_OLD2)) {
    // Upgrade from old zero-scan to typed-array check
    const L_OLD_FULL =
        'n&&n.values&&' +
        '(function(_sv){var _nz=false;for(var _si=0,_sl=Math.min(_sv.length,60);_si<_sl;_si++)' +
        'if(Math.abs(_sv[_si])>1e-4){_nz=true;break;}' +
        'if(!_nz)console.warn("[csp-compat] L: zero-scale curve skipped on",t);return _nz;})(n.values)&&' +
        '(this._scale=Z3(n.times,n.values,ir,t,"scale",r))';
    cc = cc.replace(L_OLD_FULL, L_NEW);
    console.log('[patch-csp]   ✓ Patch L: upgraded to typed-array guard for scale');
} else if (cc.includes(L_OLD)) {
    cc = cc.replace(L_OLD, L_NEW);
    console.log('[patch-csp]   ✓ Patch L: V3 typed-array guard for scale');
} else {
    console.warn('[patch-csp]   ~ Patch L: V3 scale pattern not found (skipping)');
}

// ── Patch N: V3 typed-array guard for position ───────────────────────────────
const N_OLD = 'e&&(this._position=Z3(e.times,e.values,ir,t,"position",r))';
const N_OLD2 = 'e&&e.values&&(function(_pv){var _nz=false';
const N_NEW =
    'e&&e.values&&typeof e.values.BYTES_PER_ELEMENT==="number"&&' +
    '(this._position=Z3(e.times,e.values,ir,t,"position",r))';
if (cc.includes(N_NEW.slice(0, 50))) {
    console.log('[patch-csp]   ~ Patch N already at typed-array version (skipping)');
} else if (cc.includes(N_OLD2)) {
    const N_OLD_FULL =
        'e&&e.values&&' +
        '(function(_pv){var _nz=false;for(var _pi=0,_pl=Math.min(_pv.length,60);_pi<_pl;_pi++)' +
        'if(Math.abs(_pv[_pi])>1e-4){_nz=true;break;}' +
        'if(!_nz)console.warn("[csp-compat] N: zero-pos curve skipped on",t);return _nz;})(e.values)&&' +
        '(this._position=Z3(e.times,e.values,ir,t,"position",r))';
    cc = cc.replace(N_OLD_FULL, N_NEW);
    console.log('[patch-csp]   ✓ Patch N: upgraded to typed-array guard for position');
} else if (cc.includes(N_OLD)) {
    cc = cc.replace(N_OLD, N_NEW);
    console.log('[patch-csp]   ✓ Patch N: V3 typed-array guard for position');
} else {
    console.warn('[patch-csp]   ~ Patch N: V3 position pattern not found (skipping)');
}

// ── Patch O: V3 typed-array guard for rotation ───────────────────────────────
const O_OLD = 'i&&(this._rotation=Z3(i.times,i.values,kr,t,"rotation",r))';
const O_OLD2 = 'i&&i.values&&(function(_rv){var _nz=false';
const O_NEW =
    'i&&i.values&&typeof i.values.BYTES_PER_ELEMENT==="number"&&' +
    '(this._rotation=Z3(i.times,i.values,kr,t,"rotation",r))';
if (cc.includes(O_NEW.slice(0, 50))) {
    console.log('[patch-csp]   ~ Patch O already at typed-array version (skipping)');
} else if (cc.includes(O_OLD2)) {
    const O_OLD_FULL =
        'i&&i.values&&' +
        '(function(_rv){var _nz=false;for(var _ri=0,_rl=Math.min(_rv.length,60);_ri<_rl;_ri++)' +
        'if(Math.abs(_rv[_ri])>1e-4){_nz=true;break;}' +
        'if(!_nz)console.warn("[csp-compat] O: zero-rot curve skipped on",t);return _nz;})(i.values)&&' +
        '(this._rotation=Z3(i.times,i.values,kr,t,"rotation",r))';
    cc = cc.replace(O_OLD_FULL, O_NEW);
    console.log('[patch-csp]   ✓ Patch O: upgraded to typed-array guard for rotation');
} else if (cc.includes(O_OLD)) {
    cc = cc.replace(O_OLD, O_NEW);
    console.log('[patch-csp]   ✓ Patch O: V3 typed-array guard for rotation');
} else {
    console.warn('[patch-csp]   ~ Patch O: V3 rotation pattern not found (skipping)');
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

// ─── 2b. Patch src/polyfills.bundle.js ───────────────────────────────────────
// Regenerator-runtime's fallback for setting regeneratorRuntime as a global uses
//   Function("r", "regeneratorRuntime = r")(r)
// This throws EvalError under CSP 'unsafe-eval'. The error propagates uncaught,
// leaving regeneratorRuntime undefined → any compiled-async code using generators
// fails with ReferenceError.  Replace with a direct property assignment on the
// global object (self / globalThis) which is CSP-safe.
const polyfillsPath = path.join(WEBROOT, 'src', 'polyfills.bundle.js');
if (fs.existsSync(polyfillsPath)) {
    let polyfills = fs.readFileSync(polyfillsPath, 'utf8');
    const Q_OLD = 'Function("r","regeneratorRuntime = r")(r)';
    const Q_NEW = '(self||globalThis).regeneratorRuntime=r';
    if (polyfills.includes(Q_NEW)) {
        console.log(
            '[patch-csp]   ~ Patch Q: polyfills regeneratorRuntime already fixed (skipping)'
        );
    } else if (polyfills.includes(Q_OLD)) {
        polyfills = polyfills.replace(Q_OLD, Q_NEW);
        console.log('[patch-csp]   ✓ Patch Q: polyfills regeneratorRuntime CSP fix applied');
        fs.writeFileSync(polyfillsPath, polyfills, 'utf8');
        console.log('[patch-csp] Saved', polyfillsPath);
    } else {
        console.warn(
            '[patch-csp]   ~ Patch Q: polyfills regeneratorRuntime pattern not found (skipping)'
        );
    }
} else {
    console.warn('[patch-csp]   ~ polyfills.bundle.js not found (skipping)');
}

// ─── 3. Patch assets/main/index.js (game code) ───────────────────────────────
// Bullet.initialize() calls setGroup/setMask immediately after addComponent(BoxCollider).
// The physics engine hasn't called onLoad on the new component yet → warning spam.
// Fix: defer setGroup/setMask to next frame via scheduleOnce.
const mainPath = path.join(WEBROOT, 'assets', 'main', 'index.js');
if (fs.existsSync(mainPath)) {
    let main = fs.readFileSync(mainPath, 'utf8');

    // ── Patch H: Switch to CPU skeletal animation mode (useBakedAnimation=false) ──────────────
    // The prefab was built without a pre-baked animation texture, so GPU baked mode (default)
    // shows T-pose. Real-time CPU mode evaluates _exoticAnimation each frame → correct pose.
    // Insert s&&(s.useBakedAnimation=!1) right after getModelSkeletalAnimation() is called.
    const H_OLD = 'var s=n.getModelSkeletalAnimation(t);n.attachHeroWeaponVisuals(e,t),';
    const H_NEW =
        'var s=n.getModelSkeletalAnimation(t);s&&(s.useBakedAnimation=!1),n.attachHeroWeaponVisuals(e,t),';
    if (main.includes(H_OLD)) {
        main = main.replace(H_OLD, H_NEW);
        console.log('[patch-csp]   ✓ Patch H: inserted useBakedAnimation=false (CPU anim mode)');
    } else if (main.includes(H_NEW) || main.includes('s.useBakedAnimation=!1')) {
        console.log('[patch-csp]   ~ Patch H: useBakedAnimation=false already present (skipping)');
    } else {
        console.warn(
            '[patch-csp]   ~ Patch H: getModelSkeletalAnimation context not found (skipping)'
        );
    }

    // ── Patch I: Diagnostic log after getModelSkeletalAnimation ─────────────────
    // Runs AFTER Patch H so we can log the CPU-mode anim state.
    const I_DBG =
        'console.log("[DBG-anim] skelAnim found:",!!s,"clips:",s&&s.clips&&s.clips.length),';
    const I_OLD = H_NEW; // target the Patch-H patched string
    const I_NEW =
        'var s=n.getModelSkeletalAnimation(t);' +
        I_DBG +
        's&&(s.useBakedAnimation=!1),n.attachHeroWeaponVisuals(e,t),';
    if (main.includes(I_DBG)) {
        console.log('[patch-csp]   ~ Patch I: anim diagnostic log already injected (skipping)');
    } else if (main.includes(I_OLD)) {
        main = main.replace(I_OLD, I_NEW);
        console.log('[patch-csp]   ✓ Patch I: injected anim diagnostic log');
    } else {
        console.warn('[patch-csp]   ~ Patch I: diagnostic target not found (skipping)');
    }

    // ── Patch J: Force ensureRunClip path (always load clip via resources.load) ──
    // Prefab-embedded clips may have empty _tracks/_exoticAnimation at play()-time
    // because the CCONB native binary loads asynchronously. resources.load() waits
    // for the full binary → _exoticAnimation populated → animation works.
    const J_OLD =
        'var _=s.clips&&s.clips.length>0?s.clips[0]:null;' +
        'if(_){var E=_,S=n.bindClipState(s,E,n.buildHeroStateName(i.key,"run"));' +
        'f.setRunClip(S),f.setIdleClip(S),s.defaultClip=E,s.playOnLoad=!0,s.play(S)}' +
        'else n.ensureRunClip(s,f)';
    const J_NEW_F = 'n.ensureRunClip(s,f)';
    // Current build variant: minifier uses y/M/w/S variables (without XEMBED patch)
    const J_OLD2 =
        'var y=s.clips&&s.clips.length>0?s.clips[0]:null;' +
        'if(y){var M=y,w=n.bindClipState(s,M,n.buildHeroStateName(i.key,"run"));' +
        'S.setRunClip(w),S.setIdleClip(w),s.defaultClip=M,s.playOnLoad=!0,s.play(w)}' +
        'else n.ensureRunClip(s,S)';
    // Current build variant: same as J_OLD2 but with XEMBED already injected before s.play(w)
    const J_OLD2X =
        'var y=s.clips&&s.clips.length>0?s.clips[0]:null;' +
        'if(y){var M=y,w=n.bindClipState(s,M,n.buildHeroStateName(i.key,"run"));' +
        'S.setRunClip(w),S.setIdleClip(w),s.defaultClip=M,s.playOnLoad=!0,' +
        '(function(){try{var _xea=M&&M._exoticAnimation,_xna=_xea&&_xea._nodeAnimations;' +
        'if(_xna){var _xpc=0;for(var _xni=0;_xni<_xna.length;_xni++){' +
        'var _xbn=_xna[_xni];for(var _xtki=0;_xtki<3;_xtki++){' +
        'var _xtk=["_position","_rotation","_scale"][_xtki];' +
        'var _xtr=_xbn&&_xbn[_xtk];' +
        'if(_xtr&&_xtr.values&&_xtr.values._values&&typeof _xtr.values.BYTES_PER_ELEMENT==="undefined"){' +
        '_xtr.values.BYTES_PER_ELEMENT=_xtr.values._values.BYTES_PER_ELEMENT;_xpc++;}}}' +
        'console.log("[DBG-X] embedded BPELEM:",_xpc,"tracks");}}catch(_xe){console.warn("[DBG-X] err",_xe);}})(),' +
        's.play(w)}else n.ensureRunClip(s,S)';
    const J_NEW_S = 'n.ensureRunClip(s,S)';
    if (main.includes(J_OLD2X)) {
        main = main.replace(J_OLD2X, J_NEW_S);
        console.log(
            '[patch-csp]   ✓ Patch J: forced ensureRunClip (removed embedded-clip+XEMBED path)'
        );
    } else if (main.includes(J_OLD2)) {
        main = main.replace(J_OLD2, J_NEW_S);
        console.log('[patch-csp]   ✓ Patch J: forced ensureRunClip (removed embedded-clip path)');
    } else if (main.includes(J_OLD)) {
        main = main.replace(J_OLD, J_NEW_F);
        console.log('[patch-csp]   ✓ Patch J: forced ensureRunClip (resources.load always)');
    } else if (!main.includes('var y=s.clips') && !main.includes('var _=s.clips')) {
        console.log('[patch-csp]   ~ Patch J already applied (skipping)');
    } else {
        // Regex fallback for minifier variable changes (i/o/f/S etc).
        var J_RE =
            /var (\w+)=s\.clips&&s\.clips\.length>0\?s\.clips\[0\]:null;if\(\1\)\{[\s\S]*?n\.buildHeroStateName\(\w+\.key,"run"\)[\s\S]*?\}else n\.ensureRunClip\(s,(\w+)\)/;
        var jMatch = main.match(J_RE);
        if (jMatch) {
            var jControllerVar = jMatch[2];
            main = main.replace(jMatch[0], 'n.ensureRunClip(s,' + jControllerVar + ')');
            console.log(
                '[patch-csp]   ✓ Patch J-regex: forced ensureRunClip (controller=' +
                    jControllerVar +
                    ')'
            );
        } else {
            console.warn('[patch-csp]   ~ Patch J pattern not found');
        }
    }

    // ── Patch K: Diagnostics + try-catch in ensureRunClip success callback ────────
    const K_OLD =
        'a._heroRunClipCache.set(t.key,o);var l=a.bindClipState(e,o,a.buildHeroStateName(t.key,"run"));' +
        'e.defaultClip=o,e.playOnLoad=!0,e.play(l),n&&(n.setRunClip(l),n.setIdleClip(l))';
    const K_NEW =
        'a._heroRunClipCache.set(t.key,o);' +
        'try{var _stName=a.buildHeroStateName(t.key,"run");if(e._nameToState&&e._nameToState[_stName]){e.removeState(_stName);console.log("[DBG-K] cleared stale state:",_stName);}}catch(_stE){}' +
        'var l=a.bindClipState(e,o,a.buildHeroStateName(t.key,"run"));' +
        'var _na=o&&o._exoticAnimation&&o._exoticAnimation._nodeAnimations;' +
        'console.log("[DBG-K] clip:",o&&o.name,"exotic:",!!(o&&o._exoticAnimation),"tracks:",o&&o._tracks&&o._tracks.length,"nodeAnims:",_na?_na.length:"n/a");' +
        'if(_na&&_na.length){console.log("[DBG-K] bone[0]:",_na[0]&&_na[0]._path,"hasPos:",!!(_na[0]&&_na[0]._position),"hasRot:",!!(_na[0]&&_na[0]._rotation),"hasScale:",!!(_na[0]&&_na[0]._scale));}' +
        'try{' +
        'e.defaultClip=o,e.playOnLoad=!0,e.play(l),n&&(n.setRunClip(l),a._heroIdleClipCache.has(t.key)||n.setIdleClip(l));' +
        'console.log("[DBG-K] play() ok");' +
        'var _sn=e&&e.node;' +
        'if(_sn&&_sn.isValid){' +
        'try{var _wp=_sn.worldPosition;console.log("[DBG-K] skelWP:",_wp.x.toFixed(1),_wp.y.toFixed(1),_wp.z.toFixed(1));}catch(_pe){}' +
        'e.scheduleOnce(function(){' +
        'if(!_sn||!_sn.isValid)return;' +
        'try{var _wp2=_sn.worldPosition;console.log("[DBG-K] skelWP+1f:",_wp2.x.toFixed(1),_wp2.y.toFixed(1),_wp2.z.toFixed(1));}catch(_pe2){}' +
        'var _ch=_sn.children;for(var _ci=0;_ci<Math.min(_ch.length,4);_ci++){try{var _csc=_ch[_ci].scale;console.log("[DBG-K] bone["+_ci+"]",_ch[_ci].name,"sc:",_csc.x.toFixed(3),_csc.y.toFixed(3),_csc.z.toFixed(3));}catch(_se){}}' +
        '},0);' +
        '}' +
        '}catch(_ke){console.error("[DBG-K] play() threw:",_ke);}';
    // K-upgrade: if already patched with old K, upgrade the play() ok line
    const K_OLD_OK =
        'console.log("[DBG-K] play() ok");}catch(_ke){console.error("[DBG-K] play() threw:",_ke);}';
    const K_NEW_OK =
        'console.log("[DBG-K] play() ok");' +
        'var _sn=e&&e.node;' +
        'if(_sn&&_sn.isValid){' +
        'try{var _wp=_sn.worldPosition;console.log("[DBG-K] skelWP:",_wp.x.toFixed(1),_wp.y.toFixed(1),_wp.z.toFixed(1));}catch(_pe){}' +
        'e.scheduleOnce(function(){' +
        'if(!_sn||!_sn.isValid)return;' +
        'try{var _wp2=_sn.worldPosition;console.log("[DBG-K] skelWP+1f:",_wp2.x.toFixed(1),_wp2.y.toFixed(1),_wp2.z.toFixed(1));}catch(_pe2){}' +
        'var _ch=_sn.children;for(var _ci=0;_ci<Math.min(_ch.length,4);_ci++){try{var _csc=_ch[_ci].scale;console.log("[DBG-K] bone["+_ci+"]",_ch[_ci].name,"sc:",_csc.x.toFixed(3),_csc.y.toFixed(3),_csc.z.toFixed(3));}catch(_se){}}' +
        '},0);}' +
        '}catch(_ke){console.error("[DBG-K] play() threw:",_ke);}';
    // K-upgrade: also add nodeAnims log before the try block if old version missing it
    const K_OLD_PRE =
        'console.log("[DBG-K] clip:",o&&o.name,"exotic:",!!(o&&o._exoticAnimation),"tracks:",o&&o._tracks&&o._tracks.length);';
    const K_NEW_PRE =
        'var _na=o&&o._exoticAnimation&&o._exoticAnimation._nodeAnimations;' +
        'console.log("[DBG-K] clip:",o&&o.name,"exotic:",!!(o&&o._exoticAnimation),"tracks:",o&&o._tracks&&o._tracks.length,"nodeAnims:",_na?_na.length:"n/a");' +
        'if(_na&&_na.length){console.log("[DBG-K] bone[0]:",_na[0]&&_na[0]._path,"hasPos:",!!(_na[0]&&_na[0]._position),"hasRot:",!!(_na[0]&&_na[0]._rotation),"hasScale:",!!(_na[0]&&_na[0]._scale));}';
    // Patch M: per-frame scale+position fix (injected inside K's _sn block, after scheduleOnce)
    const PATCH_M =
        'var _mOrigPos=null;try{_mOrigPos=_sn.getPosition().clone();}catch(_me1){}' +
        'var _mFixFn=function(){' +
        'if(!_sn||!_sn.isValid||!e.isValid){try{e.unschedule(_mFixFn);}catch(_me2){}return;}' +
        'function _mFz(nd){try{var _ms=nd.scale;if(_ms&&_ms.x<1e-3&&_ms.y<1e-3&&_ms.z<1e-3)nd.setScale(1,1,1);}catch(_){}' +
        'for(var _mj=0;_mj<nd.children.length;_mj++)_mFz(nd.children[_mj]);}' +
        '_mFz(_sn);' +
        'if(_mOrigPos){try{var _mCp=_sn.getPosition();if(Math.abs(_mCp.y-_mOrigPos.y)>0.5)_sn.setPosition(_mOrigPos);}catch(_me3){}}' +
        '};e.schedule(_mFixFn,0);' +
        'console.log("[DBG-K] PatchM: per-frame scale+pos fix scheduled");';
    // The close of the _sn.isValid block + end of outer try-catch
    const K_SN_CLOSE = '},0);}' + '}catch(_ke){console.error("[DBG-K] play() threw:",_ke);}';
    const K_SN_CLOSE_M =
        '},0);' + PATCH_M + '}' + '}catch(_ke){console.error("[DBG-K] play() threw:",_ke);}';

    // Patch V: fix ExoticTrack.values – engine V3 evaluator checks values.BYTES_PER_ELEMENT
    // but values is ExoticVec3/QuatTrackValues (wrapper class, no BYTES_PER_ELEMENT).
    // V3 sets _position/_rotation/_scale=null → evaluate() is a no-op → T-pose forever.
    // Fix: replace track.values (ExoticTrackValues) with track.values._values (Float32Array).
    // N3.evaluate() uses values.get(index,out) and values.lerp(...) - ExoticTrackValues API.
    // So values must STAY as ExoticTrackValues. We only need to ADD BYTES_PER_ELEMENT
    // to the instance so V3's typeof check passes, then N3's get/lerp still work.
    const PATCH_V =
        'try{var _ea0=o&&o._exoticAnimation,_na0=_ea0&&_ea0._nodeAnimations;' +
        'if(_na0){var _pvc=0;' +
        'for(var _ni0=0;_ni0<_na0.length;_ni0++){var _bn0=_na0[_ni0];' +
        'for(var _tki=0;_tki<3;_tki++){var _tk=["_position","_rotation","_scale"][_tki];' +
        'var _tr=_bn0&&_bn0[_tk];' +
        'if(_tr&&_tr.values&&_tr.values._values&&typeof _tr.values.BYTES_PER_ELEMENT==="undefined"){' +
        '_tr.values.BYTES_PER_ELEMENT=_tr.values._values.BYTES_PER_ELEMENT;_pvc++;}}' +
        '}console.log("[DBG-K] patchedV: added BPELEM to",_pvc,"tracks");}}catch(_pve){console.error("[DBG-K] pV:",_pve);}';

    const K_STALE_OLD =
        'a._heroRunClipCache.set(t.key,o);var l=a.bindClipState(e,o,a.buildHeroStateName(t.key,"run"));';
    const K_STALE_NEW =
        'a._heroRunClipCache.set(t.key,o);' +
        PATCH_V +
        'try{var _stName=a.buildHeroStateName(t.key,"run");if(e._nameToState&&e._nameToState[_stName]){e.removeState(_stName);console.log("[DBG-K] cleared stale state:",_stName);}}catch(_stE){}' +
        'var l=a.bindClipState(e,o,a.buildHeroStateName(t.key,"run"));';
    const K_STALE_WRONG =
        'a._heroRunClipCache.set(t.key,o);' +
        'try{var _stName=a.buildHeroStateName(t.key,"run");if(e._states&&e._states[_stName]){delete e._states[_stName];console.log("[DBG-K] cleared stale state:",_stName);}}catch(_stE){}' +
        'var l=a.bindClipState(e,o,a.buildHeroStateName(t.key,"run"));';
    const K_ROT_OLD =
        'var _ch=_sn.children;for(var _ci=0;_ci<Math.min(_ch.length,4);_ci++){try{var _csc=_ch[_ci].scale;console.log("[DBG-K] bone["+_ci+"]",_ch[_ci].name,"sc:",_csc.x.toFixed(3),_csc.y.toFixed(3),_csc.z.toFixed(3));}catch(_se){}}';
    const K_ROT_NEW =
        K_ROT_OLD +
        'try{var _hb=_sn.children[1];if(_hb&&_hb.isValid){var _hr0=_hb.worldRotation;' +
        'console.log("[DBG-K] hips rot0:",_hr0.x.toFixed(4),_hr0.y.toFixed(4),_hr0.z.toFixed(4),_hr0.w.toFixed(4));' +
        'e.scheduleOnce(function(){if(!_hb||!_hb.isValid)return;' +
        'var _hr1=_hb.worldRotation;' +
        'var _rd=Math.abs(_hr1.x-_hr0.x)+Math.abs(_hr1.y-_hr0.y)+Math.abs(_hr1.z-_hr0.z);' +
        'console.log("[DBG-K] hips rot+0.5s:",_hr1.x.toFixed(4),_hr1.y.toFixed(4),_hr1.z.toFixed(4),"delta:",_rd.toFixed(5));' +
        '},0.5);}}catch(_rte){}';
    // Upgrade path: v0.0.50 has _nameToState + hips rot0 but no patchedV
    const K_PV_OLD =
        'a._heroRunClipCache.set(t.key,o);' +
        'try{var _stName=a.buildHeroStateName(t.key,"run");if(e._nameToState&&e._nameToState[_stName]){e.removeState(_stName);console.log("[DBG-K] cleared stale state:",_stName);}}catch(_stE){}' +
        'var l=a.bindClipState(e,o,a.buildHeroStateName(t.key,"run"));';
    const K_PV_NEW =
        'a._heroRunClipCache.set(t.key,o);' +
        PATCH_V +
        'try{var _stName=a.buildHeroStateName(t.key,"run");if(e._nameToState&&e._nameToState[_stName]){e.removeState(_stName);console.log("[DBG-K] cleared stale state:",_stName);}}catch(_stE){}' +
        'var l=a.bindClipState(e,o,a.buildHeroStateName(t.key,"run"));';
    // Wrong Patch V (v0.0.51): replaced values with _values Float32Array
    // Correct Patch V: adds BYTES_PER_ELEMENT to ExoticTrackValues instance
    const K_PV_WRONG =
        'if(_tr&&_tr.values&&_tr.values._values){_tr.values=_tr.values._values;_pvc++;}}}' +
        'console.log("[DBG-K] patchedV: fixed",_pvc,"tracks");';
    const K_PV_CORRECT =
        'if(_tr&&_tr.values&&_tr.values._values&&typeof _tr.values.BYTES_PER_ELEMENT==="undefined"){' +
        '_tr.values.BYTES_PER_ELEMENT=_tr.values._values.BYTES_PER_ELEMENT;_pvc++;}}' +
        '}console.log("[DBG-K] patchedV: added BPELEM to",_pvc,"tracks");';
    if (main.includes('patchedV') && main.includes('added BPELEM')) {
        console.log('[patch-csp]   ~ Patch K+V already up to date (skipping)');
    } else if (main.includes('patchedV') && main.includes(K_PV_WRONG)) {
        main = main.replace(K_PV_WRONG, K_PV_CORRECT);
        console.log(
            '[patch-csp]   ✓ Patch V-fix: corrected BPELEM approach (was replacing values)'
        );
    } else if (
        main.includes('PatchM:') &&
        main.includes('_nameToState') &&
        main.includes(K_PV_OLD)
    ) {
        main = main.replace(K_PV_OLD, K_PV_NEW);
        console.log('[patch-csp]   ✓ Patch V: add BYTES_PER_ELEMENT to ExoticTrackValues');
    } else if (
        main.includes('PatchM:') &&
        main.includes('_nameToState') &&
        main.includes(K_ROT_OLD)
    ) {
        main = main.replace(K_ROT_OLD, K_ROT_NEW);
        console.log('[patch-csp]   ✓ Patch K-rot: bone rotation delta diagnostic added');
    } else if (main.includes('PatchM:') && main.includes(K_STALE_WRONG)) {
        main = main.replace(K_STALE_WRONG, K_STALE_NEW);
        console.log('[patch-csp]   ✓ Patch K-stale-fix: corrected _states→_nameToState');
    } else if (main.includes('PatchM:') && main.includes(K_STALE_OLD)) {
        main = main.replace(K_STALE_OLD, K_STALE_NEW);
        console.log('[patch-csp]   ✓ Patch K-stale: cleared stale AnimationState fix injected');
    } else if (main.includes('[DBG-K]') && main.includes(K_SN_CLOSE)) {
        // Upgrade: inject Patch M into the existing K _sn block
        main = main.replace(K_SN_CLOSE, K_SN_CLOSE_M);
        if (main.includes(K_OLD_OK)) {
            main = main.replace(K_OLD_OK, K_NEW_OK);
        }
        if (main.includes(K_OLD_PRE)) {
            main = main.replace(K_OLD_PRE, K_NEW_PRE);
        }
        console.log('[patch-csp]   ✓ Patch K+M: upgraded with per-frame scale+pos fix');
    } else if (main.includes(K_OLD_OK)) {
        // Fresh K upgrade (no M yet)
        main = main.replace(K_OLD_OK, K_NEW_OK);
        if (main.includes(K_OLD_PRE)) main.replace(K_OLD_PRE, K_NEW_PRE);
        console.log('[patch-csp]   ✓ Patch K upgraded: worldPos + bone-scale diagnostics');
    } else if (main.includes(K_OLD)) {
        main = main.replace(K_OLD, K_NEW);
        console.log('[patch-csp]   ✓ Patch K: injected ensureRunClip diagnostics + try-catch');
    } else {
        // Regex fallback for minifier variable changes (e.g. clip var o→i).
        var K_RE =
            /a\._heroRunClipCache\.set\(t\.key,(\w+)\);var l=a\.bindClipState\(e,\1,a\.buildHeroStateName\(t\.key,"run"\)\);e\.defaultClip=\1,e\.playOnLoad=!0,e\.play\(l\),n&&\(n\.setRunClip\(l\),n\.setIdleClip\(l\)\)/;
        var kMatch = main.match(K_RE);
        if (kMatch) {
            var kv = kMatch[1];
            var K_PATCHV_DYN =
                'try{var _ea0=' +
                kv +
                '&&' +
                kv +
                '._exoticAnimation,_na0=_ea0&&_ea0._nodeAnimations;' +
                'if(_na0){var _pvc=0;' +
                'for(var _ni0=0;_ni0<_na0.length;_ni0++){var _bn0=_na0[_ni0];' +
                'for(var _tki=0;_tki<3;_tki++){var _tk=["_position","_rotation","_scale"][_tki];' +
                'var _tr=_bn0&&_bn0[_tk];' +
                'if(_tr&&_tr.values&&_tr.values._values&&typeof _tr.values.BYTES_PER_ELEMENT==="undefined"){' +
                '_tr.values.BYTES_PER_ELEMENT=_tr.values._values.BYTES_PER_ELEMENT;_pvc++;}}' +
                '}console.log("[DBG-K] patchedV: added BPELEM to",_pvc,"tracks");}}catch(_pve){console.error("[DBG-K] pV:",_pve);}';
            var K_NEW_DYN =
                'a._heroRunClipCache.set(t.key,' +
                kv +
                ');' +
                K_PATCHV_DYN +
                'try{var _stName=a.buildHeroStateName(t.key,"run");if(e._nameToState&&e._nameToState[_stName]){e.removeState(_stName);console.log("[DBG-K] cleared stale state:",_stName);}}catch(_stE){}' +
                'var l=a.bindClipState(e,' +
                kv +
                ',a.buildHeroStateName(t.key,"run"));' +
                'try{e.defaultClip=' +
                kv +
                ',e.playOnLoad=!0,e.play(l),n&&(n.setRunClip(l),a._heroIdleClipCache.has(t.key)||n.setIdleClip(l));console.log("[DBG-K] play() ok");}catch(_ke){console.error("[DBG-K] play() threw:",_ke);}';
            main = main.replace(kMatch[0], K_NEW_DYN);
            console.log('[patch-csp]   ✓ Patch K-regex: ensureRunClip fix (var=' + kv + ')');
        } else {
            console.warn('[patch-csp]   ~ Patch K pattern not found');
        }
    }

    // ── Patch V-standalone: ensure BPELEM fix always runs in the same pass as K ──
    // The K if/else chain fires only ONE branch per run. For a fresh build, K_OLD→K_NEW
    // runs but Patch V is skipped (K_PV_OLD check requires 'PatchM:' which is absent).
    // K_PV_OLD IS a substring of K_NEW's output, so this standalone block injects
    // Patch V in the same run regardless of PatchM or prior K level.
    if (!main.includes('patchedV')) {
        if (main.includes(K_PV_OLD)) {
            main = main.replace(K_PV_OLD, K_PV_NEW);
            console.log('[patch-csp]   ✓ Patch V-standalone: BPELEM fix for run clip injected');
        } else {
            // Regex fallback: minifier may rename the clip variable (e.g. o→i).
            // Match a._heroRunClipCache.set(t.key,X); ... var l=a.bindClipState(e,X,...)
            var V_RE =
                /a\._heroRunClipCache\.set\(t\.key,(\w+)\);(var l=a\.bindClipState\(e,\1,a\.buildHeroStateName\(t\.key,"run"\)\))/;
            var vMatch = main.match(V_RE);
            if (vMatch) {
                var cv = vMatch[1];
                var BPELEM_RUN =
                    'try{var _ea0=' +
                    cv +
                    '&&' +
                    cv +
                    '._exoticAnimation,_na0=_ea0&&_ea0._nodeAnimations;' +
                    'if(_na0){var _pvc=0;' +
                    'for(var _ni0=0;_ni0<_na0.length;_ni0++){var _bn0=_na0[_ni0];' +
                    'for(var _tki=0;_tki<3;_tki++){var _tk=["_position","_rotation","_scale"][_tki];' +
                    'var _tr=_bn0&&_bn0[_tk];' +
                    'if(_tr&&_tr.values&&_tr.values._values&&typeof _tr.values.BYTES_PER_ELEMENT==="undefined"){' +
                    '_tr.values.BYTES_PER_ELEMENT=_tr.values._values.BYTES_PER_ELEMENT;_pvc++;}}' +
                    '}console.log("[DBG-K] patchedV: added BPELEM to",_pvc,"tracks");}}catch(_pve){console.error("[DBG-K] pV:",_pve);}';
                main = main.replace(
                    vMatch[0],
                    'a._heroRunClipCache.set(t.key,' + cv + ');' + BPELEM_RUN + vMatch[2]
                );
                console.log(
                    '[patch-csp]   ✓ Patch V-regex: BPELEM fix for run clip (var=' + cv + ')'
                );
            } else {
                console.warn(
                    '[patch-csp]   ~ Patch V-standalone: K_PV_OLD not found (Patch V missing!)'
                );
            }
        }
    }

    // ── Patch P: Force reloadAsset in loadClipWithFallbacks ───────────────────────
    // Root cause of T-pose: animation clips are deserialized inline from the prefab
    // WITHOUT their .cconb binary companion → typed arrays remain as {__id__:N} stubs.
    // CC caches this broken clip by UUID. When resources.load() is called later, it
    // returns the cached broken version immediately (skipping the .cconb download).
    // Fix: replace bundle.load() with cc.assetManager.loadAny()+reloadAsset:true so
    // the .cconb binary is always downloaded fresh → correct typed arrays → animation.
    const P_OLD = 'var o=i[a];_.load(o,E,(function(i,l){';
    const P_NEW =
        'var o=i[a];' +
        'v.loadAny({path:o,type:E,bundle:_.name||"resources"},{reloadAsset:true},null,' +
        '(function(i,l){';
    if (main.includes('reloadAsset:true')) {
        console.log('[patch-csp]   ~ Patch P already applied (skipping)');
    } else if (main.includes(P_OLD)) {
        main = main.replace(P_OLD, P_NEW);
        console.log('[patch-csp]   ✓ Patch P: loadClipWithFallbacks now uses reloadAsset:true');
    } else {
        console.warn('[patch-csp]   ~ Patch P: loadClipWithFallbacks pattern not found (skipping)');
    }

    // ── Patch R: Validate clip typed arrays; UUID-retry if stubs detected ─────────
    // Even after reloadAsset:true, the .cconb binary companion may not resolve its
    // {__id__:N} typed-array references correctly. Result: _nodeAnimations[i]._rotation
    // .values is a plain object (no BYTES_PER_ELEMENT) → guards skip all evaluators
    // → T-pose. Fix: after loadAny returns the clip, check the first rotation track.
    // If values is NOT a real typed array, release the cached asset and reload by
    // UUID (which forces the engine to re-download the native binary companion too).
    const R_OLD = '}else n(null,l)}))}}(0,null)}';
    const R_IIFE =
        '(function(_clip,_cb){' +
        'var _ea=_clip&&_clip._exoticAnimation,' +
        '_na=_ea&&_ea._nodeAnimations,_ok=false;' +
        'if(_na&&_na.length){' +
        'for(var _ri=0;_ri<Math.min(_na.length,5)&&!_ok;_ri++){' +
        'var _b=_na[_ri],_rt=_b&&_b._rotation;' +
        'if(_rt&&_rt.times&&typeof _rt.times.BYTES_PER_ELEMENT==="number"&&_rt.times.length>0){_ok=true;}' +
        'var _rp=_b&&_b._position;' +
        'if(!_ok&&_rp&&_rp.times&&typeof _rp.times.BYTES_PER_ELEMENT==="number"&&_rp.times.length>0){_ok=true;}' +
        '}}' +
        'if(_ok){console.log("[DBG-R] clip OK, typed arrays present");_cb(_clip);}' +
        'else{console.warn("[DBG-R] clip has stubs, UUID-retry:",_clip&&_clip._uuid);' +
        'if(_clip&&_clip._uuid){' +
        'v.loadAny({uuid:_clip._uuid},{reloadAsset:true},null,function(_re,_rl){' +
        'var _ea2=_rl&&_rl._exoticAnimation,_na2=_ea2&&_ea2._nodeAnimations,_ok2=false;' +
        'if(_na2&&_na2.length){var _rt2=_na2[0]&&_na2[0]._rotation;' +
        'try{var _rtKeys=_rt2?Object.keys(_rt2).slice(0,10):[];' +
        'var _rtVals=_rt2&&_rt2.values;var _rtTimes=_rt2&&_rt2.times;' +
        'console.warn("[DBG-S] rot keys:",JSON.stringify(_rtKeys),' +
        '"vals type:",typeof _rtVals,' +
        '"BPELEM:",_rtVals&&_rtVals.BYTES_PER_ELEMENT,' +
        '"vals.len:",_rtVals&&_rtVals.length,' +
        '"times BPELEM:",_rtTimes&&_rtTimes.BYTES_PER_ELEMENT,' +
        '"na0 keys:",JSON.stringify(_na2[0]?Object.keys(_na2[0]).slice(0,10):[]));' +
        '}catch(_se){}' +
        'if(_rt2&&_rt2.times&&typeof _rt2.times.BYTES_PER_ELEMENT==="number"&&_rt2.times.length>0)_ok2=true;}' +
        'console.log("[DBG-R] UUID-retry result: ok=",_ok2);' +
        '_cb((!_re&&_rl)?_rl:_clip);});' +
        '}else _cb(_clip);}' +
        '})';
    const R_NEW = '}else{' + R_IIFE + '(l,function(_rc){n(null,_rc);});' + '}}))}}(0,null)}';
    const R_UPGRADE_OLD =
        'var _ea2=_rl&&_rl._exoticAnimation,_na2=_ea2&&_ea2._nodeAnimations,_ok2=false;' +
        'if(_na2&&_na2.length){var _rt2=_na2[0]&&_na2[0]._rotation;' +
        'if(_rt2&&_rt2.values&&typeof _rt2.values.BYTES_PER_ELEMENT==="number")_ok2=true;}' +
        'console.log("[DBG-R] UUID-retry result: ok=",_ok2);';
    const R_UPGRADE_NEW =
        'var _ea2=_rl&&_rl._exoticAnimation,_na2=_ea2&&_ea2._nodeAnimations,_ok2=false;' +
        'if(_na2&&_na2.length){var _rt2=_na2[0]&&_na2[0]._rotation;' +
        'try{var _rtKeys=_rt2?Object.keys(_rt2).slice(0,10):[];' +
        'var _rtVals=_rt2&&_rt2.values;var _rtTimes=_rt2&&_rt2.times;' +
        'console.warn("[DBG-S] rot keys:",JSON.stringify(_rtKeys),' +
        '"BPELEM:",_rtVals&&_rtVals.BYTES_PER_ELEMENT,' +
        '"vals.len:",_rtVals&&_rtVals.length,' +
        '"na0 keys:",JSON.stringify(_na2[0]?Object.keys(_na2[0]).slice(0,8):[]));' +
        '}catch(_se){}' +
        'if(_rt2&&_rt2.times&&typeof _rt2.times.BYTES_PER_ELEMENT==="number"&&_rt2.times.length>0)_ok2=true;}' +
        'console.log("[DBG-R] UUID-retry result: ok=",_ok2);';
    const R_DBG_S_WRONG =
        'if(_rt2&&_rt2.values&&typeof _rt2.values.BYTES_PER_ELEMENT==="number")_ok2=true';
    const R_DBG_S_FIXED =
        'if(_rt2&&_rt2.times&&typeof _rt2.times.BYTES_PER_ELEMENT==="number"&&_rt2.times.length>0)_ok2=true';
    const R_OK_WRONG =
        'if(_rt&&_rt.values&&typeof _rt.values.BYTES_PER_ELEMENT==="number"&&_rt.values.length>0){_ok=true;}' +
        'var _rp=_b&&_b._position;if(!_ok&&_rp&&_rp.values&&typeof _rp.values.BYTES_PER_ELEMENT==="number"&&_rp.values.length>0){_ok=true;}';
    const R_OK_FIXED =
        'if(_rt&&_rt.times&&typeof _rt.times.BYTES_PER_ELEMENT==="number"&&_rt.times.length>0){_ok=true;}' +
        'var _rp=_b&&_b._position;if(!_ok&&_rp&&_rp.times&&typeof _rp.times.BYTES_PER_ELEMENT==="number"&&_rp.times.length>0){_ok=true;}';
    if (main.includes('[DBG-S]') && main.includes(R_DBG_S_FIXED) && main.includes(R_OK_FIXED)) {
        console.log('[patch-csp]   ~ Patch R+S already applied (skipping)');
    } else if (main.includes('[DBG-S]') && main.includes(R_OK_WRONG)) {
        main = main.replace(R_OK_WRONG, R_OK_FIXED);
        console.log('[patch-csp]   ✓ Patch R-ok: fixed initial _ok check to use .times');
    } else if (main.includes('[DBG-S]') && main.includes(R_DBG_S_WRONG)) {
        main = main.replace(R_DBG_S_WRONG, R_DBG_S_FIXED);
        console.log('[patch-csp]   ✓ Patch R-times: fixed _ok2 check to use .times');
    } else if (main.includes(R_UPGRADE_OLD)) {
        main = main.replace(R_UPGRADE_OLD, R_UPGRADE_NEW);
        console.log('[patch-csp]   ✓ Patch R-upgrade: added [DBG-S] structural diagnostic');
    } else if (main.includes(R_OLD)) {
        main = main.replace(R_OLD, R_NEW);
        console.log('[patch-csp]   ✓ Patch R: clip validation + UUID-retry on stale data');
    } else {
        console.warn('[patch-csp]   ~ Patch R: pattern not found (skipping)');
    }

    // ── Patch X: EnemyFlyingAnimator.onModelLoaded null-guard ────────────────────
    // instantiate(prefab) can return null (or throw) when the prefab contains a
    // SkeletalAnimation component, because CCF_SAFE's _d._instantiate(R) fallback
    // fails for complex nodes. Without a null check, applyShadowSettingsRecursive(null)
    // throws, the whole onModelLoaded callback crashes, and the boss model is never
    // added to the scene.
    const X_OLD =
        'if(t&&t.isValid){this._model=m(e),this.applyShadowSettingsRecursive(this._model),t.addChild(this._model)';
    const X_NEW =
        'if(t&&t.isValid){' +
        'try{this._model=m(e);}catch(_ife){console.warn("[EFA] instantiate threw:",_ife&&_ife.message);this._model=null;}' +
        'if(!this._model){return void this.createFallback();}' +
        'this.applyShadowSettingsRecursive(this._model),t.addChild(this._model)';
    if (main.includes('[EFA] instantiate threw')) {
        console.log('[patch-csp]   ~ Patch X: EFA null-guard already applied (skipping)');
    } else if (main.includes(X_OLD)) {
        main = main.replace(X_OLD, X_NEW);
        console.log(
            '[patch-csp]   ✓ Patch X: EnemyFlyingAnimator.onModelLoaded null-guard injected'
        );
    } else {
        console.warn('[patch-csp]   ~ Patch X: EFA onModelLoaded pattern not found (skipping)');
    }

    // ── Patch Y: EnemyFlyingAnimator – set useBakedAnimation=false on enemy skel ──
    // Hero gets useBakedAnimation=false via Patch H. Enemy SkeletalAnimations are
    // handled by EnemyFlyingAnimator which never sets this flag, so the engine defaults
    // to GPU baked mode. Without a pre-baked texture the mesh renders invisible.
    // Fix: inject useBakedAnimation=false right before detectClips() is called.
    const Y_OLD = 'this._anim?(this.detectClips(),this.updateAnimation(!0))';
    const Y_NEW =
        'this._anim?(this._anim.useBakedAnimation=!1,this.detectClips(),this.updateAnimation(!0))';
    if (main.includes(Y_NEW.slice(0, 50))) {
        console.log(
            '[patch-csp]   ~ Patch Y: EFA useBakedAnimation=false already applied (skipping)'
        );
    } else if (main.includes(Y_OLD)) {
        main = main.replace(Y_OLD, Y_NEW);
        console.log(
            '[patch-csp]   ✓ Patch Y: EnemyFlyingAnimator useBakedAnimation=false injected'
        );
    } else {
        console.warn('[patch-csp]   ~ Patch Y: EFA detectClips pattern not found (skipping)');
    }

    // ── Patch Z: BPELEM fix for embedded enemy/boss clips ────────────────────────
    // Enemy animation clips are embedded in the prefab (unlike hero clips which are
    // loaded separately). They have the same ExoticTrackValues wrapper issue: the
    // wrapper class has no BYTES_PER_ELEMENT property, so V3 evaluator sets all track
    // references to null → evaluate() does nothing → T-pose.
    // Fix: after detectClips() runs, walk all _anim.clips and inject BYTES_PER_ELEMENT
    // onto any ExoticTrackValues wrapper that is missing it.
    // Z_OLD targets the Y_NEW output so it fires after Patch Y in the same run or on
    // subsequent runs (both fresh and already-patched builds).
    const Z_OLD = 'this._anim.useBakedAnimation=!1,this.detectClips(),this.updateAnimation(!0)';
    // IIFE wrapping is required: the code is injected inside a ternary (expression
    // context), so a bare try-statement would be a SyntaxError. The IIFE receives
    // this._anim as _za so 'this' is not needed inside the function body.
    // IIFE receives this._anim (not clips) so we can call removeState after BPELEM fix.
    // removeState is critical: animation states are created by SkeletalAnimation.onLoad
    // when addChild fires, which is BEFORE this code runs. V3 evaluators already have
    // null position/rotation/scale refs at that point. Removing the state forces
    // crossFade() to create a fresh state with BPELEM now set → V3 gets valid refs.
    const Z_BPELEM =
        '(function(_zaAnim){' +
        'try{var _zaClips=_zaAnim&&_zaAnim.clips;if(_zaClips){' +
        'for(var _zi=0;_zi<_zaClips.length;_zi++){' +
        'var _zc=_zaClips[_zi];var _zea=_zc&&_zc._exoticAnimation;' +
        'var _zna=_zea&&_zea._nodeAnimations;' +
        'if(_zna){var _zpc=0;' +
        'for(var _zni=0;_zni<_zna.length;_zni++){' +
        'var _zbn=_zna[_zni];' +
        'for(var _ztki=0;_ztki<3;_ztki++){' +
        'var _ztk=["_position","_rotation","_scale"][_ztki];' +
        'var _ztr=_zbn&&_zbn[_ztk];' +
        'if(_ztr&&_ztr.values&&_ztr.values._values&&typeof _ztr.values.BYTES_PER_ELEMENT==="undefined"){' +
        '_ztr.values.BYTES_PER_ELEMENT=_ztr.values._values.BYTES_PER_ELEMENT;_zpc++;}}}' +
        'console.log("[DBG-Z] enemy clip["+_zi+"]: BPELEM to",_zpc,"tracks");}' +
        'if(_zc){try{_zaAnim.removeState(_zc.name);}catch(_zre){}try{_zaAnim.createState(_zc,_zc.name);}catch(_zce){}}' +
        '}}}catch(_zze){}}(this._anim)),';
    const Z_NEW =
        'this._anim.useBakedAnimation=!1,this.detectClips(),' +
        Z_BPELEM +
        'this.updateAnimation(!0)';
    if (main.includes('[DBG-Z]')) {
        console.log('[patch-csp]   ~ Patch Z: enemy BPELEM fix already applied (skipping)');
    } else if (main.includes(Z_OLD)) {
        main = main.replace(Z_OLD, Z_NEW);
        console.log('[patch-csp]   ✓ Patch Z: BPELEM fix injected for embedded enemy/boss clips');
    } else {
        console.warn('[patch-csp]   ~ Patch Z: Z_OLD pattern not found (skipping)');
    }

    // ── Patch W: Idle clip BYTES_PER_ELEMENT fix ─────────────────────────────────
    // Same ExoticTrackValues wrapper issue as hero run clip (Patch V), but for the
    // idle clip loaded asynchronously by ensureIdleClip. Without BYTES_PER_ELEMENT
    // on the values wrapper, Patches L/N/O skip all evaluators → idle = T-pose.
    const W_OLD =
        'a._heroIdleClipCache.set(t.key,o);var l=a.bindClipState(e,o,a.buildHeroStateName(t.key,"idle"));n&&n.setIdleClip(l)';
    const W_PATCHV =
        'try{var _ea1=o&&o._exoticAnimation,_na1=_ea1&&_ea1._nodeAnimations;' +
        'if(_na1){var _pvc1=0;' +
        'for(var _ni1=0;_ni1<_na1.length;_ni1++){var _bn1=_na1[_ni1];' +
        'for(var _tki1=0;_tki1<3;_tki1++){var _tk1=["_position","_rotation","_scale"][_tki1];' +
        'var _tr1=_bn1&&_bn1[_tk1];' +
        'if(_tr1&&_tr1.values&&_tr1.values._values&&typeof _tr1.values.BYTES_PER_ELEMENT==="undefined"){' +
        '_tr1.values.BYTES_PER_ELEMENT=_tr1.values._values.BYTES_PER_ELEMENT;_pvc1++;}}}' +
        'console.log("[DBG-W] idle: added BPELEM to",_pvc1,"tracks");}}catch(_pve1){}';
    const W_NEW =
        'a._heroIdleClipCache.set(t.key,o);' +
        W_PATCHV +
        'var l=a.bindClipState(e,o,a.buildHeroStateName(t.key,"idle"));n&&n.setIdleClip(l)';
    if (main.includes('[DBG-W]')) {
        console.log('[patch-csp]   ~ Patch W: idle BPELEM already applied (skipping)');
    } else if (main.includes(W_OLD)) {
        main = main.replace(W_OLD, W_NEW);
        console.log('[patch-csp]   ✓ Patch W: idle clip BYTES_PER_ELEMENT fix injected');
    } else {
        // Regex fallback: minifier may rename the clip variable (e.g. o→i).
        var W_RE =
            /a\._heroIdleClipCache\.set\(t\.key,(\w+)\);(var l=a\.bindClipState\(e,\1,a\.buildHeroStateName\(t\.key,"idle"\)\);n&&n\.setIdleClip\(l\))/;
        var wMatch = main.match(W_RE);
        if (wMatch) {
            var wv = wMatch[1];
            var BPELEM_IDLE =
                'try{var _ea1=' +
                wv +
                '&&' +
                wv +
                '._exoticAnimation,_na1=_ea1&&_ea1._nodeAnimations;' +
                'if(_na1){var _pvc1=0;' +
                'for(var _ni1=0;_ni1<_na1.length;_ni1++){var _bn1=_na1[_ni1];' +
                'for(var _tki1=0;_tki1<3;_tki1++){var _tk1=["_position","_rotation","_scale"][_tki1];' +
                'var _tr1=_bn1&&_bn1[_tk1];' +
                'if(_tr1&&_tr1.values&&_tr1.values._values&&typeof _tr1.values.BYTES_PER_ELEMENT==="undefined"){' +
                '_tr1.values.BYTES_PER_ELEMENT=_tr1.values._values.BYTES_PER_ELEMENT;_pvc1++;}}}' +
                'console.log("[DBG-W] idle: added BPELEM to",_pvc1,"tracks");}}catch(_pve1){}';
            main = main.replace(
                wMatch[0],
                'a._heroIdleClipCache.set(t.key,' + wv + ');' + BPELEM_IDLE + wMatch[2]
            );
            console.log('[patch-csp]   ✓ Patch W-regex: idle BPELEM fix (var=' + wv + ')');
        } else {
            console.warn('[patch-csp]   ~ Patch W: idle clip cache pattern not found (skipping)');
        }
    }

    // ── Patch W2: Force-remove stale idle state before recreating ─────────────────
    // bindClipState returns the existing state if getState(name) finds one.
    // A stale state (V3 evaluator with null refs) from a prior scene load would
    // silently block createState → idle plays as T-pose. removeState first.
    const W2_REMOVE =
        'try{e.removeState(a.buildHeroStateName(t.key,"idle"));}catch(_wR){}' +
        'console.log("[DBG-W2] idle removeState ok");';
    const W2_OLD =
        'var l=a.bindClipState(e,o,a.buildHeroStateName(t.key,"idle"));n&&n.setIdleClip(l)';
    const W2_NEW = W2_REMOVE + W2_OLD;
    if (main.includes('[DBG-W2]')) {
        console.log('[patch-csp]   ~ Patch W2: idle removeState already applied (skipping)');
    } else if (main.includes('[DBG-W]') && main.includes(W2_OLD)) {
        main = main.replace(W2_OLD, W2_NEW);
        console.log('[patch-csp]   ✓ Patch W2: idle state force-recreated before bind');
    } else if (main.includes('[DBG-W]')) {
        // Regex fallback for variable name changes
        var W2_RE =
            /var l=a\.bindClipState\(e,(\w+),a\.buildHeroStateName\(t\.key,"idle"\)\);n&&n\.setIdleClip\(l\)/;
        var w2Match = main.match(W2_RE);
        if (w2Match) {
            var W2_OLD_DYN = w2Match[0];
            main = main.replace(W2_OLD_DYN, W2_REMOVE + W2_OLD_DYN);
            console.log(
                '[patch-csp]   ✓ Patch W2-regex: idle removeState (var=' + w2Match[1] + ')'
            );
        } else {
            console.warn('[patch-csp]   ~ Patch W2: idle removeState target not found (skipping)');
        }
    } else {
        console.warn('[patch-csp]   ~ Patch W2: idle removeState target not found (skipping)');
    }

    // ── Patch W3: Force direct crossFade to idle state after creation ────────────
    // setIdleClip triggers playClip → anim.play(name), but if the V3 evaluator was
    // created with null refs (exotic-track BPELEM not propagated) crossFade silently
    // outputs the bind pose (T-pose).  Calling e.crossFade(l,0) here is redundant but
    // adds a diagnostic log so we can see in the console whether the state exists.
    const W3_OLD = 'n&&n.setIdleClip(l)}}';
    const W3_NEW =
        'n&&n.setIdleClip(l);' +
        'try{var _gst=e.getState&&e.getState(l);' +
        'console.log("[DBG-W3] idle getState:",l,"found:",!!_gst,"hasEval:",!!(_gst&&_gst._evaluator));' +
        'if(_gst){e.crossFade(l,0);console.log("[DBG-W3] idle crossFade ok");}' +
        'else{console.warn("[DBG-W3] idle state NOT found in _nameToState");}' +
        '}catch(_w3e){console.warn("[DBG-W3] err",_w3e);}' +
        '}}';
    if (main.includes('[DBG-W3]')) {
        console.log('[patch-csp]   ~ Patch W3: idle crossFade diag already applied (skipping)');
    } else if (main.includes(W3_OLD)) {
        main = main.replace(W3_OLD, W3_NEW);
        console.log('[patch-csp]   ✓ Patch W3: idle direct-crossFade + diagnostics injected');
    } else {
        console.warn(
            '[patch-csp]   ~ Patch W3: idle setIdleClip close-brace pattern not found (skipping)'
        );
    }

    // ── Patch W3b: revert idle to run when idle evaluator is null ─────────────────
    // W3 logs "hasEval: false" when the idle clip's V3 evaluator has null refs
    // (ExoticTrackValues BPELEM fix did not propagate in time, or clip has no
    // animation data). In that case crossFade to idle shows T-pose permanently.
    // Fix: if !_gst._evaluator, call n.setIdleClip(n._runClip) so the hero
    // falls back to run-clip-as-idle (frozen at frame 0 by Patch HC).
    const W3B_OLD =
        'if(_gst){e.crossFade(l,0);console.log("[DBG-W3] idle crossFade ok");}' +
        'else{console.warn("[DBG-W3] idle state NOT found in _nameToState");}';
    const W3B_NEW =
        'if(_gst&&_gst._evaluator){e.crossFade(l,0);console.log("[DBG-W3] idle crossFade ok");}' +
        'else if(_gst&&!_gst._evaluator){' +
        'console.warn("[DBG-W3b] idle eval null, reverting idle->run");' +
        'if(n&&n._runClip){n.setIdleClip(n._runClip);console.log("[DBG-W3b] idle->run:",n._runClip);}' +
        '}else{console.warn("[DBG-W3] idle state NOT found in _nameToState");}';
    if (main.includes('[DBG-W3b]')) {
        console.log(
            '[patch-csp]   ~ Patch W3b: idle evaluator fallback already applied (skipping)'
        );
    } else if (main.includes(W3B_OLD)) {
        main = main.replace(W3B_OLD, W3B_NEW);
        console.log('[patch-csp]   ✓ Patch W3b: idle eval-null → revert to run clip');
    } else {
        console.warn('[patch-csp]   ~ Patch W3b: W3 crossFade pattern not found (skipping)');
    }

    // ── Patch XEMBED: BPELEM fix for embedded-clip path in attachHeroModel ─────────
    // When the prefab already contains the run clip (anim.clips[0] exists), the
    // code skips loadClipWithFallbacks and plays the clip directly. K_NEW's
    // PATCH_V never runs → ExoticTrackValues wrappers have no BYTES_PER_ELEMENT →
    // Patches L/N/O guards fail → V3 evaluator skips all channels → T-pose.
    // Fix: inject BPELEM fix inline, right before s.play(w) in the existing branch.
    const XEMBED_OLD = 'S.setRunClip(w),S.setIdleClip(w),s.defaultClip=M,s.playOnLoad=!0,s.play(w)';
    const XEMBED_NEW =
        'S.setRunClip(w),S.setIdleClip(w),s.defaultClip=M,s.playOnLoad=!0,' +
        '(function(){try{var _xea=M&&M._exoticAnimation,_xna=_xea&&_xea._nodeAnimations;' +
        'if(_xna){var _xpc=0;for(var _xni=0;_xni<_xna.length;_xni++){' +
        'var _xbn=_xna[_xni];for(var _xtki=0;_xtki<3;_xtki++){' +
        'var _xtk=["_position","_rotation","_scale"][_xtki];' +
        'var _xtr=_xbn&&_xbn[_xtk];' +
        'if(_xtr&&_xtr.values&&_xtr.values._values&&typeof _xtr.values.BYTES_PER_ELEMENT==="undefined"){' +
        '_xtr.values.BYTES_PER_ELEMENT=_xtr.values._values.BYTES_PER_ELEMENT;_xpc++;}}}' +
        'console.log("[DBG-X] embedded BPELEM:",_xpc,"tracks");}}catch(_xe){console.warn("[DBG-X] err",_xe);}})(),' +
        's.play(w)';
    if (main.includes('[DBG-X]')) {
        console.log(
            '[patch-csp]   ~ Patch XEMBED: embedded-clip BPELEM already applied (skipping)'
        );
    } else if (main.includes(XEMBED_OLD)) {
        main = main.replace(XEMBED_OLD, XEMBED_NEW);
        console.log('[patch-csp]   ✓ Patch XEMBED: embedded-clip BPELEM fix injected');
    } else {
        console.warn(
            '[patch-csp]   ~ Patch XEMBED: embedded-clip play pattern not found (skipping)'
        );
    }

    // ── Patch HC: HeroAnimationController static-idle fallback ───────────────────
    // If the idle AnimationClip's V3 evaluator still outputs T-pose, override
    // playClip so that entering idle freezes the run animation at time=0 (first
    // frame of the run cycle = neutral standing/aiming pose).  This guarantees a
    // usable static idle pose regardless of V3 evaluator state.
    // When returning to run, speed is restored to 1 and play() is called normally.
    const HC_OLD = 'r.playClip=function(i){this._anim&&(this._anim.play(i),this._current=i)}';
    const HC_NEW =
        'r.playClip=function(i){' +
        'if(!this._anim)return;' +
        'this._current=i;' +
        'if(i!==this._runClip&&this._runClip){' +
        '/* idle: freeze run at frame-0 as guaranteed static pose */' +
        'try{var _rSt=this._anim.getState(this._runClip);' +
        'if(_rSt&&typeof _rSt.speed!=="undefined"){_rSt.speed=0;_rSt.time=0;}' +
        '}catch(_hcF){}' +
        '/* also attempt to play idle clip (works if V3 evaluator is valid) */' +
        'try{this._anim.play(i);}catch(_hcI){}' +
        '}else{' +
        '/* run: restore speed */' +
        'try{var _rSt2=this._anim.getState(i);' +
        'if(_rSt2&&typeof _rSt2.speed!=="undefined"&&_rSt2.speed===0)_rSt2.speed=1;' +
        '}catch(_hcR){}' +
        'this._anim.play(i);' +
        '}}';
    if (main.includes('[DBG-W3]') && main.includes('_rSt.speed=0')) {
        console.log('[patch-csp]   ~ Patch HC: static-idle playClip already applied (skipping)');
    } else if (main.includes(HC_OLD)) {
        main = main.replace(HC_OLD, HC_NEW);
        console.log('[patch-csp]   ✓ Patch HC: static-idle fallback in playClip injected');
    } else {
        console.warn('[patch-csp]   ~ Patch HC: playClip pattern not found (skipping)');
    }

    // ── Patch SUB_R: Pass alreadySubscribed through SUBSCRIPTION_RESULT ──────────
    // The Devvit backend (v0.0.65) sends {success,alreadySubscribed} but the
    // compiled RedditBridge only forwards {success}.  Fix: also forward alreadySubscribed.
    const SUBR_OLD =
        'this._isSubscribed=!0,this._emit({type:"subscription_result",success:u.success})';
    const SUBR_NEW =
        'this._isSubscribed=!0,this._emit({type:"subscription_result",success:u.success,alreadySubscribed:!!u.alreadySubscribed})';
    if (main.includes('alreadySubscribed:!!u.alreadySubscribed')) {
        console.log('[patch-csp]   ~ Patch SUB_R: alreadySubscribed already forwarded (skipping)');
    } else if (main.includes(SUBR_OLD)) {
        main = main.replace(SUBR_OLD, SUBR_NEW);
        console.log(
            '[patch-csp]   ✓ Patch SUB_R: alreadySubscribed forwarded in subscription_result'
        );
    } else {
        console.warn(
            '[patch-csp]   ~ Patch SUB_R: SUBSCRIPTION_RESULT emit pattern not found (skipping)'
        );
    }

    // ── Patch SUB_UI: Subscribe button feedback toast ────────────────────────────
    // After _updateSubscribeButton, briefly flash a localised message on the button
    // label: "关注成功！" (first follow) or "你已关注 ✓" (already followed).
    // Reverts to the subscribed/not-subscribed key text after 2 s.
    const SUBUI_OLD = 'case"subscription_result":t.success&&this._updateSubscribeButton(!0)';
    const SUBUI_NEW =
        'case"subscription_result":if(t.success){' +
        'this._updateSubscribeButton(!0);' +
        'try{' +
        'var _sBtnN=this._subscribeBtn&&this._subscribeBtn.getChildByName&&this._subscribeBtn.getChildByName("Label");' +
        'var _sLbl=_sBtnN&&_sBtnN.getComponent&&_sBtnN.getComponent("cc.Label");' +
        'if(_sLbl){' +
        'var _sOrig=_sLbl.string;' +
        '_sLbl.string=t.alreadySubscribed?"\u4f60\u5df2\u5173\u6ce8 \u2713":"\u5173\u6ce8\u6210\u529f\uff01";' +
        'setTimeout(function(){try{if(_sLbl&&_sLbl.isValid)_sLbl.string=_sOrig;}catch(_){}},2000);' +
        '}}catch(_subE){}}';
    if (main.includes('\u5173\u6ce8\u6210\u529f')) {
        console.log('[patch-csp]   ~ Patch SUB_UI: subscribe feedback already applied (skipping)');
    } else if (main.includes(SUBUI_OLD)) {
        main = main.replace(SUBUI_OLD, SUBUI_NEW);
        console.log('[patch-csp]   ✓ Patch SUB_UI: subscribe button feedback injected');
    } else {
        console.warn('[patch-csp]   ~ Patch SUB_UI: subscription_result case not found (skipping)');
    }

    // ── Patch MSG: Unwrap Devvit production message envelope ─────────────────────
    // In devvit playtest (local), wv.postMessage() delivers messages directly:
    //   ev.data = { type: 'INIT_RESPONSE', payload: {...} }
    // In production Reddit, the Devvit client wraps them:
    //   ev.data = { type: 'devvit-message', data: { message: { type: 'INIT_RESPONSE', ... } } }
    // The compiled _handleDevvitMessage only handles the direct format, so ALL messages
    // from Devvit are silently dropped in production.
    // Fix: unwrap the envelope before the switch statement.
    const MSG_OLD =
        '_handleDevvitMessage=function(e){if(e.data&&"object"==typeof e.data){var t=e.data;switch(t.type){';
    const MSG_NEW =
        '_handleDevvitMessage=function(e){if(e.data&&"object"==typeof e.data){var t=e.data;' +
        '/* Unwrap Devvit production message envelope */' +
        'if(t.type==="devvit-message"&&t.data&&"object"==typeof t.data){' +
        't=t.data.message&&"object"==typeof t.data.message?t.data.message:t.data;' +
        '}' +
        'switch(t.type){';
    if (main.includes('Unwrap Devvit production message envelope')) {
        console.log('[patch-csp]   ~ Patch MSG: devvit-message unwrap already applied (skipping)');
    } else if (main.includes(MSG_OLD)) {
        main = main.replace(MSG_OLD, MSG_NEW);
        console.log('[patch-csp]   ✓ Patch MSG: devvit-message envelope unwrap injected');
    } else {
        console.warn(
            '[patch-csp]   ~ Patch MSG: _handleDevvitMessage pattern not found (skipping)'
        );
    }

    // ── Patch LB_LOCAL: Leaderboard fallback in non-Reddit env ───────────────────
    // Source now emits {type:'leaderboard',entries:cachedLeaderboard} instead of
    // {type:'error'} in non-Reddit env, so panel never stays on "loading" forever.
    // This patch is a safety net for builds compiled from the old source.
    const LB_LOCAL_OLD =
        'this._emit({type:"error",message:"GET_LEADERBOARD unavailable outside Devvit"})';
    const LB_LOCAL_NEW = 'this._emit({type:"leaderboard",entries:this._cachedLeaderboard})';
    if (main.includes('type:"leaderboard",entries:this.') || main.includes(LB_LOCAL_NEW)) {
        console.log(
            '[patch-csp]   ~ Patch LB_LOCAL: leaderboard local fallback already in source (skipping)'
        );
    } else if (main.includes(LB_LOCAL_OLD)) {
        main = main.replace(LB_LOCAL_OLD, LB_LOCAL_NEW);
        console.log(
            '[patch-csp]   ✓ Patch LB_LOCAL: leaderboard emits cached entries in non-Reddit env'
        );
    } else {
        console.log(
            '[patch-csp]   ~ Patch LB_LOCAL: pattern not found (source already fixed – OK)'
        );
    }

    // ── Patch RB_MOBILE_SYNC: unify mobile/desktop leaderboard pipeline ─────────
    // Some shipped bundles still gate /api calls on static hostname detection.
    // In mobile WebView, hostname can be localhost/empty and gets misclassified.
    // Fixes:
    //  1) requestInit/requestLeaderboard/submitScore always attempt /api fetch.
    //  2) add no-store + credentials + cache-busting query for leaderboard/init.
    //  3) submit-score uses keepalive and updates cached leaderboard immediately.
    //  4) broaden environment detection for empty host + redd.it.
    const RB_DETECT_OLD =
        'i="localhost"===e||"127.0.0.1"===e||e.endsWith(".local")||""===e;return t&&!i||e.includes("reddit.com")||void 0!==window.__devvit__';
    const RB_DETECT_NEW =
        'i="localhost"===e||"127.0.0.1"===e||e.endsWith(".local");return t&&!i||""===e||e.includes("reddit.com")||e.includes("redd.it")||void 0!==window.__devvit__';
    if (main.includes('e.includes("redd.it")')) {
        console.log('[patch-csp]   ~ Patch RB_MOBILE_SYNC: detectRedditEnvironment already updated');
    } else if (main.includes(RB_DETECT_OLD)) {
        main = main.replace(RB_DETECT_OLD, RB_DETECT_NEW);
        console.log(
            '[patch-csp]   ✓ Patch RB_MOBILE_SYNC: detectRedditEnvironment accepts mobile hosts'
        );
    } else {
        console.warn(
            '[patch-csp]   ~ Patch RB_MOBILE_SYNC: detectRedditEnvironment pattern not found (skipping)'
        );
    }

    const RB_INIT_FETCH_OLD = 'this._isRedditEnvironment?fetch("/api/init")';
    const RB_INIT_FETCH_NEW =
        'fetch("/api/init?_ts="+Date.now(),{cache:"no-store",credentials:"include"})';
    if (main.includes(RB_INIT_FETCH_NEW)) {
        console.log('[patch-csp]   ~ Patch RB_MOBILE_SYNC: requestInit fetch already updated');
    } else if (main.includes(RB_INIT_FETCH_OLD)) {
        main = main.replace(RB_INIT_FETCH_OLD, RB_INIT_FETCH_NEW);
        main = main.replace(
            ')):this._emit({type:"error",message:"Reddit bridge is unavailable outside Devvit"})',
            '))'
        );
        main = main.replace(
            'var i,n,r,s,d=t;e._username=',
            'var i,n,r,s,d=t;e._isRedditEnvironment=!0,e._username='
        );
        console.log('[patch-csp]   ✓ Patch RB_MOBILE_SYNC: requestInit always calls /api/init');
    } else {
        console.warn('[patch-csp]   ~ Patch RB_MOBILE_SYNC: requestInit pattern not found');
    }

    const RB_LB_FETCH_OLD = 'this._isRedditEnvironment?fetch("/api/leaderboard")';
    const RB_LB_FETCH_NEW =
        'fetch("/api/leaderboard?_ts="+Date.now(),{cache:"no-store",credentials:"include"})';
    if (main.includes(RB_LB_FETCH_NEW)) {
        console.log(
            '[patch-csp]   ~ Patch RB_MOBILE_SYNC: requestLeaderboard fetch already updated'
        );
    } else if (main.includes(RB_LB_FETCH_OLD)) {
        main = main.replace(RB_LB_FETCH_OLD, RB_LB_FETCH_NEW);
        main = main.replace(')):this._emit({type:"leaderboard",entries:this._cachedLeaderboard})', '))');
        console.log(
            '[patch-csp]   ✓ Patch RB_MOBILE_SYNC: requestLeaderboard always calls /api/leaderboard'
        );
    } else {
        console.warn('[patch-csp]   ~ Patch RB_MOBILE_SYNC: requestLeaderboard pattern not found');
    }

    const RB_SUBMIT_FETCH_OLD =
        'this._isRedditEnvironment?fetch("/api/submit-score",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({score:e,wave:t})})';
    const RB_SUBMIT_FETCH_NEW =
        'fetch("/api/submit-score",{method:"POST",keepalive:!0,cache:"no-store",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({score:e,wave:t})})';
    if (main.includes('keepalive:!0,cache:"no-store",credentials:"include"')) {
        console.log(
            '[patch-csp]   ~ Patch RB_MOBILE_SYNC: submitScore fetch keepalive/no-store already updated'
        );
    } else if (main.includes(RB_SUBMIT_FETCH_OLD)) {
        main = main.replace(RB_SUBMIT_FETCH_OLD, RB_SUBMIT_FETCH_NEW);
        main = main.replace(
            '):this._emit({type:"error",message:"SUBMIT_SCORE unavailable outside Devvit"})',
            ')'
        );
        console.log('[patch-csp]   ✓ Patch RB_MOBILE_SYNC: submitScore always posts with keepalive');
    } else {
        console.warn('[patch-csp]   ~ Patch RB_MOBILE_SYNC: submitScore pattern not found');
    }

    const RB_SUBMIT_EMIT_OLD =
        'var n,r,s,d=t;i._emit({type:"score_submitted",rank:null!=(n=d.rank)?n:0,score:null!=(r=d.score)?r:e,isNewBest:null!=(s=d.isNewBest)&&s})';
    const RB_SUBMIT_EMIT_NEW =
        'var n,r,s,d=t;Array.isArray(d.leaderboard)?(i._cachedLeaderboard=d.leaderboard,i._emit({type:"leaderboard",entries:d.leaderboard})):i.requestLeaderboard(),i._emit({type:"score_submitted",rank:null!=(n=d.rank)?n:0,score:null!=(r=d.score)?r:e,isNewBest:null!=(s=d.isNewBest)&&s})';
    if (main.includes('Array.isArray(d.leaderboard)')) {
        console.log(
            '[patch-csp]   ~ Patch RB_MOBILE_SYNC: submitScore leaderboard sync already updated'
        );
    } else if (main.includes(RB_SUBMIT_EMIT_OLD)) {
        main = main.replace(RB_SUBMIT_EMIT_OLD, RB_SUBMIT_EMIT_NEW);
        console.log('[patch-csp]   ✓ Patch RB_MOBILE_SYNC: submitScore now refreshes leaderboard cache');
    } else {
        console.warn('[patch-csp]   ~ Patch RB_MOBILE_SYNC: submitScore emit pattern not found');
    }

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

    // ── Patch SPLASH: dismiss HTML loading overlay when Cocos home screen is ready ──
    // _revealContent() is called in HomePage once the background texture loads.
    // Inject window._hideSplash&&window._hideSplash() at the start of its body so the
    // CSS splash (added in index.html) fades out as soon as the first Cocos frame is visible.
    const SPLASH_OLD =
        'i._revealContent=function(){this._contentNode&&this._contentNode.isValid&&' +
        '(this._contentNode.active=!0,this._contentNode.setScale(.96,.96,1),';
    const SPLASH_NEW =
        'i._revealContent=function(){this._contentNode&&this._contentNode.isValid&&' +
        '(window._hideSplash&&window._hideSplash(),' +
        'this._contentNode.active=!0,this._contentNode.setScale(.96,.96,1),';
    if (main.includes(SPLASH_NEW)) {
        console.log('[patch-csp]   ~ Patch SPLASH: _hideSplash already injected (skipping)');
    } else if (main.includes(SPLASH_OLD)) {
        main = main.replace(SPLASH_OLD, SPLASH_NEW);
        console.log('[patch-csp]   ✓ Patch SPLASH: _hideSplash injected into _revealContent');
    } else {
        console.warn('[patch-csp]   ~ Patch SPLASH: _revealContent pattern not found (skipping)');
    }

    fs.writeFileSync(mainPath, main, 'utf8');
    console.log('[patch-csp] Saved', mainPath);
} else {
    console.warn('[patch-csp]   ~ assets/main/index.js not found (skipping game patch)');
}

// ─── 4. Create .cconb aliases for animation binary files ─────────────────────
// CC3 stores native binaries in assets/[bundle]/native/ (and metadata JSON in
// assets/[bundle]/import/). The engine requests .cconb extension but CC build
// writes .bin → 404 → _nativeAsset null → typed arrays stay as stubs → T-pose.
// Fix: scan ALL bundles.
//   import/ dirs: only alias CCON-magic .bin files (descriptor format).
//   native/ dirs: alias ALL .bin files – raw binary animation/mesh data has no
//     CCON magic but the engine still requests .cconb extension for it.
//     Missing alias → 404 → _nativeAsset null → _mainBinChunk null →
//     _deserializeTypedArrayViewRef throws → TypedArrayRef stays as stub → T-pose.
(function patchCconbAliases() {
    const assetsDir = path.join(WEBROOT, 'assets');
    if (!fs.existsSync(assetsDir)) {
        console.warn('[patch-csp]   ~ assets/ not found (skipping .cconb alias step)');
        return;
    }
    const CCON_MAGIC = Buffer.from([0x43, 0x43, 0x4f, 0x4e]); // "CCON"
    let created = 0,
        skipped = 0;
    // requireMagic=true for import/, false for native/
    function scanDir(dir, requireMagic) {
        if (!fs.existsSync(dir)) return;
        var subs;
        try {
            subs = fs.readdirSync(dir);
        } catch (_) {
            return;
        }
        for (var si = 0; si < subs.length; si++) {
            var subDir = path.join(dir, subs[si]);
            try {
                if (!fs.statSync(subDir).isDirectory()) continue;
            } catch (_) {
                continue;
            }
            var files = fs.readdirSync(subDir);
            for (var fi = 0; fi < files.length; fi++) {
                var fname = files[fi];
                if (!fname.endsWith('.bin')) continue;
                var binPath = path.join(subDir, fname);
                var cconbPath = binPath.slice(0, -4) + '.cconb';
                if (fs.existsSync(cconbPath)) {
                    skipped++;
                    continue;
                }
                if (requireMagic) {
                    var head = Buffer.allocUnsafe(4);
                    try {
                        var fd = fs.openSync(binPath, 'r');
                        fs.readSync(fd, head, 0, 4, 0);
                        fs.closeSync(fd);
                    } catch (_) {
                        continue;
                    }
                    if (!head.equals(CCON_MAGIC)) continue;
                }
                fs.copyFileSync(binPath, cconbPath);
                created++;
            }
        }
    }
    var bundles;
    try {
        bundles = fs.readdirSync(assetsDir);
    } catch (_) {
        bundles = [];
    }
    for (var bi = 0; bi < bundles.length; bi++) {
        var bundleDir = path.join(assetsDir, bundles[bi]);
        try {
            if (!fs.statSync(bundleDir).isDirectory()) continue;
        } catch (_) {
            continue;
        }
        scanDir(path.join(bundleDir, 'import'), true); // import: CCON-magic only
        scanDir(path.join(bundleDir, 'native'), false); // native: ALL .bin files
    }
    if (created > 0)
        console.log(
            '[patch-csp]   ✓ Created ' + created + ' .cconb aliases (' + skipped + ' existed)'
        );
    else if (skipped > 0)
        console.log('[patch-csp]   ~ .cconb aliases already exist (' + skipped + ' skipped)');
    else console.log('[patch-csp]   ~ no .bin files found to alias (skipping)');
})();

console.log('[patch-csp] All patches applied successfully.');

// ─── Inject preview launch screen into webroot ────────────────────────────────
(function injectPreview() {
    var DEVVIT_DIR = path.resolve(__dirname, '..');
    var clientDir = path.join(DEVVIT_DIR, 'src', 'client');
    var previewHtmlSrc = path.join(clientDir, 'preview.html');
    var previewCssSrc = path.join(clientDir, 'preview.css');

    if (!fs.existsSync(previewHtmlSrc) || !fs.existsSync(previewCssSrc)) {
        console.warn(
            '[patch-csp] preview source files not found in src/client/ – skipping preview injection.'
        );
        return;
    }

    fs.copyFileSync(previewHtmlSrc, path.join(WEBROOT, 'preview.html'));
    fs.copyFileSync(previewCssSrc, path.join(WEBROOT, 'preview.css'));
    console.log('[patch-csp]   ✓ Copied preview.html + preview.css into webroot');

    var PROJECT_ROOT = path.resolve(DEVVIT_DIR, '..');
    var previewAssets = ['granny.webp', 'robot.webp'];
    previewAssets.forEach(function (fname) {
        var src = path.join(PROJECT_ROOT, 'assets', 'resources', 'preview', fname);
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, path.join(WEBROOT, fname));
        }
    });
    console.log('[patch-csp]   ✓ Copied character preview images into webroot');

    var esbuildBin = path.join(DEVVIT_DIR, 'node_modules', 'esbuild', 'bin', 'esbuild');
    if (!fs.existsSync(esbuildBin)) {
        console.warn(
            '[patch-csp] esbuild not found in devvit/node_modules – run "cd devvit && npm install" first.'
        );
        return;
    }

    var { execSync } = require('child_process');
    var previewEntry = path.join(clientDir, 'preview-entry.ts');
    var previewOut = path.join(WEBROOT, 'preview.js');
    try {
        execSync(
            JSON.stringify(esbuildBin) +
                ' ' +
                JSON.stringify(previewEntry) +
                ' --bundle --format=iife --platform=browser --outfile=' +
                JSON.stringify(previewOut) +
                ' --minify',
            { cwd: DEVVIT_DIR, stdio: 'pipe' }
        );
        console.log('[patch-csp]   ✓ Bundled preview-entry.ts → webroot/preview.js');
    } catch (err) {
        console.error(
            '[patch-csp] esbuild preview bundle failed:',
            err.stderr ? err.stderr.toString() : err.message
        );
    }

    var serverEntry = path.join(DEVVIT_DIR, 'src', 'server', 'index.ts');
    var serverOut = path.join(DEVVIT_DIR, 'dist', 'server', 'index.cjs');
    var serverOutDir = path.dirname(serverOut);
    if (!fs.existsSync(serverOutDir)) fs.mkdirSync(serverOutDir, { recursive: true });
    try {
        execSync(
            JSON.stringify(esbuildBin) +
                ' ' +
                JSON.stringify(serverEntry) +
                ' --bundle --platform=node --format=cjs --outfile=' +
                JSON.stringify(serverOut),
            { cwd: DEVVIT_DIR, stdio: 'pipe' }
        );
        console.log('[patch-csp]   ✓ Bundled server/index.ts → dist/server/index.cjs');
    } catch (err) {
        console.error(
            '[patch-csp] esbuild server bundle failed:',
            err.stderr ? err.stderr.toString() : err.message
        );
    }
})();
