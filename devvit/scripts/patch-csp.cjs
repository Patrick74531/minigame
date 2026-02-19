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
    const J_NEW = 'n.ensureRunClip(s,f)';
    if (main.includes(J_NEW) && !main.includes(J_OLD)) {
        console.log('[patch-csp]   ~ Patch J already applied (skipping)');
    } else if (main.includes(J_OLD)) {
        main = main.replace(J_OLD, J_NEW);
        console.log('[patch-csp]   ✓ Patch J: forced ensureRunClip (resources.load always)');
    } else {
        console.warn('[patch-csp]   ~ Patch J pattern not found');
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
        'e.defaultClip=o,e.playOnLoad=!0,e.play(l),n&&(n.setRunClip(l),n.setIdleClip(l));' +
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
        console.warn('[patch-csp]   ~ Patch K pattern not found');
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
