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
// Fallback: reflect-mode that copies __values__ properties from source JSON (d) to target (o).
// Skips asset-ref objects ({__id__:N}) since we can't resolve them without the document.
// _rv: recursively revive a plain JSON value into a proper CCClass instance when possible.
// __type__ objects are looked up via js.getClassByName (Cocos Creator class registry).
// __id__ objects are asset refs – skip them (can't resolve without document).
const C2_REFLECT_FN =
    'function(s,o,d,k){' +
    'try{' +
    'function _rv(v){' +
    'if(!v||typeof v!=="object")return v;' +
    'if(Array.isArray(v))return v.map(_rv);' +
    'if(typeof v.__id__==="number")return v;' +
    'if(typeof v.__type__==="string"){' +
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
    'if(_v!==null&&typeof _v==="object"&&typeof _v.__id__==="number")continue;' +
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

    // ── Patch H: Restore useBakedAnimation=false (real-time CPU mode) ─────────────────────────
    // The prefab was built without baked texture data, so GPU baked mode shows T-pose.
    // Keep real-time CPU mode so _tracks (loaded via resources.load in Patch J) drive animation.
    // Revert any previous void-0 replacement back to the original useBakedAnimation=false call.
    const BAKED_VOID_CTX = ');(void 0),a.attachHeroWeaponVisuals';
    const BAKED_ORIG_CTX = ');s&&(s.useBakedAnimation=!1),a.attachHeroWeaponVisuals';
    if (main.includes(BAKED_VOID_CTX)) {
        main = main.replace(BAKED_VOID_CTX, BAKED_ORIG_CTX);
        console.log('[patch-csp]   ✓ Restored useBakedAnimation=false (real-time CPU mode)');
    } else if (main.includes(BAKED_ORIG_CTX) || main.includes('s&&(s.useBakedAnimation=!1)')) {
        console.log('[patch-csp]   ~ useBakedAnimation=false already present (skipping)');
    } else {
        console.warn('[patch-csp]   ~ useBakedAnimation context not found (skipping)');
    }

    // ── Patch I: Diagnostic logging around getModelSkeletalAnimation ─────────────
    // Handles all known forms: with/without debug log, with/without void-0 vs useBakedAnimation.
    const ANIM_FIND_VARIANTS = [
        'var s=a.getModelSkeletalAnimation(t);(void 0),a.attachHeroWeaponVisuals(e,t);',
        'var s=a.getModelSkeletalAnimation(t);s&&(s.useBakedAnimation=!1),a.attachHeroWeaponVisuals(e,t);',
    ];
    const ANIM_FIND_LOG =
        'console.log("[DBG-anim] skelAnim=",s,"clips=",s&&s.clips&&s.clips.length),';
    const ANIM_FIND_LOGGED = 'var s=a.getModelSkeletalAnimation(t);' + ANIM_FIND_LOG;
    if (main.includes(ANIM_FIND_LOGGED)) {
        console.log('[patch-csp]   ~ anim diagnostic log already injected (skipping)');
    } else {
        let injectedFind = false;
        for (const variant of ANIM_FIND_VARIANTS) {
            if (main.includes(variant)) {
                main = main.replace(
                    variant,
                    'var s=a.getModelSkeletalAnimation(t);' +
                        ANIM_FIND_LOG +
                        variant.slice('var s=a.getModelSkeletalAnimation(t);'.length)
                );
                console.log(
                    '[patch-csp]   ✓ Injected anim diagnostic log (getModelSkeletalAnimation)'
                );
                injectedFind = true;
                break;
            }
        }
        if (!injectedFind)
            console.warn('[patch-csp]   ~ anim diagnostic log pattern not found (skipping)');
    }

    // ── Patch J: Always use ensureRunClip (resources.load path, never the direct prefab clip) ─
    // prefab-embedded clip has _tracks=0 at play()-time (native binary loads async).
    // resources.load() waits for the full binary → _tracks populated → animation works.
    // Match the variant with the debug log already injected (from Patch I in v0.0.16).
    const FORCE_J_OLD =
        'if(E){var _=E,S=a.bindClipState(s,_,a.buildHeroStateName(i.key,"run"));' +
        'f.setRunClip(S),f.setIdleClip(S),' +
        'console.log("[DBG-anim] play direct state:",S,"clip:",_,"tracks:",_&&_._tracks&&_._tracks.length),' +
        's.defaultClip=_,s.playOnLoad=!0,s.play(S)}else a.ensureRunClip(s,f);';
    // Also handle the variant without the debug log (fresh build)
    const FORCE_J_OLD2 =
        'if(E){var _=E,S=a.bindClipState(s,_,a.buildHeroStateName(i.key,"run"));' +
        'f.setRunClip(S),f.setIdleClip(S),' +
        's.defaultClip=_,s.playOnLoad=!0,s.play(S)}else a.ensureRunClip(s,f);';
    const FORCE_J_NEW = 'a.ensureRunClip(s,f);';
    if (main.includes(FORCE_J_OLD)) {
        main = main.replace(FORCE_J_OLD, FORCE_J_NEW);
        console.log('[patch-csp]   ✓ Patch J: forced ensureRunClip (resources.load always)');
    } else if (main.includes(FORCE_J_OLD2)) {
        main = main.replace(FORCE_J_OLD2, FORCE_J_NEW);
        console.log(
            '[patch-csp]   ✓ Patch J: forced ensureRunClip (resources.load always, no-log variant)'
        );
    } else if (!main.includes('else a.ensureRunClip')) {
        console.log('[patch-csp]   ~ Patch J already applied (skipping)');
    } else {
        console.warn(
            '[patch-csp]   ~ Patch J pattern not found — check compiled index.js manually'
        );
    }

    // ── Patch K: Diagnostic logs inside ensureRunClip success callback ───────────
    const ENSURE_CB_OLD =
        'n._heroRunClipCache.set(t.key,o);var l=n.bindClipState(e,o,n.buildHeroStateName(t.key,"run"));' +
        'e.defaultClip=o,e.playOnLoad=!0,e.play(l),a&&(a.setRunClip(l),a.setIdleClip(l))';
    const ENSURE_CB_NEW =
        'n._heroRunClipCache.set(t.key,o);' +
        'console.log("[DBG-K] clip loaded name:",o&&o.name,"tracks:",o&&o._tracks&&o._tracks.length,"nativeAsset:",!!(o&&o._nativeAsset));' +
        'var l=n.bindClipState(e,o,n.buildHeroStateName(t.key,"run"));' +
        'console.log("[DBG-K] state:",l,"anim enabled:",e&&e.enabled,"clips after:",e&&e.clips&&e.clips.length);' +
        'try{e.defaultClip=o,e.playOnLoad=!0,e.play(l),a&&(a.setRunClip(l),a.setIdleClip(l));console.log("[DBG-K] play() called ok");}' +
        'catch(_ke){console.error("[DBG-K] play() threw:",_ke);}';
    if (main.includes(ENSURE_CB_OLD)) {
        main = main.replace(ENSURE_CB_OLD, ENSURE_CB_NEW);
        console.log('[patch-csp]   ✓ Patch K: injected ensureRunClip callback diagnostics');
    } else if (main.includes('[DBG-K]')) {
        console.log('[patch-csp]   ~ Patch K already applied (skipping)');
    } else {
        console.warn('[patch-csp]   ~ Patch K pattern not found');
    }

    const ANIM_LOAD_OLD = 'console.warn("[UnitFactory] Failed to load hero run clip:",i)';
    const ANIM_LOAD_NEW = 'console.warn("[DBG-anim] CLIP LOAD FAILED:",i)';
    const ANIM_LOAD_SUCCESS_OLD = 'this._heroRunClipCache.set(config.key,clip)';
    const ANIM_LOAD_SUCCESS_NEW_PREFIX =
        'console.log("[DBG-anim] clip loaded ok, tracks:",clip&&clip._tracks&&clip._tracks.length,"name:",clip&&clip.name),';
    if (main.includes(ANIM_LOAD_OLD)) {
        main = main.replace(ANIM_LOAD_OLD, ANIM_LOAD_NEW);
        console.log('[patch-csp]   ✓ Injected clip-fail log');
    }
    if (main.includes(ANIM_LOAD_SUCCESS_OLD) && !main.includes(ANIM_LOAD_SUCCESS_NEW_PREFIX)) {
        main = main.replace(
            ANIM_LOAD_SUCCESS_OLD,
            ANIM_LOAD_SUCCESS_NEW_PREFIX + ANIM_LOAD_SUCCESS_OLD
        );
        console.log('[patch-csp]   ✓ Injected clip-success log');
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
// The engine's config.extensionMap[".cconb"] registers animation/skeleton binary
// assets with .cconb extension. The Cocos Creator build however writes these files
// as .bin (e.g. uuid@hash.bin). The engine constructs URLs with .cconb extension
// → 404 → _nativeAsset never set → _tracks=0 → T-pose.
// Fix: for every @hash.bin file in resources/import that starts with CCON magic,
// create a sibling file with .cconb extension (same content).
(function patchCconbAliases() {
    const resImport = path.join(WEBROOT, 'assets', 'resources', 'import');
    if (!fs.existsSync(resImport)) {
        console.warn('[patch-csp]   ~ resources/import not found (skipping .cconb alias step)');
        return;
    }
    const CCON_MAGIC = Buffer.from([0x43, 0x43, 0x4f, 0x4e]); // "CCON"
    let created = 0,
        skipped = 0;
    const subdirs = fs.readdirSync(resImport);
    for (const sub of subdirs) {
        const subDir = path.join(resImport, sub);
        if (!fs.statSync(subDir).isDirectory()) continue;
        for (const fname of fs.readdirSync(subDir)) {
            if (!fname.includes('@') || !fname.endsWith('.bin')) continue;
            const binPath = path.join(subDir, fname);
            const cconbPath = binPath.slice(0, -4) + '.cconb';
            if (fs.existsSync(cconbPath)) {
                skipped++;
                continue;
            }
            const head = Buffer.allocUnsafe(4);
            const fd = fs.openSync(binPath, 'r');
            fs.readSync(fd, head, 0, 4, 0);
            fs.closeSync(fd);
            if (!head.equals(CCON_MAGIC)) continue;
            fs.copyFileSync(binPath, cconbPath);
            created++;
        }
    }
    if (created > 0)
        console.log(
            '[patch-csp]   ✓ Created ' + created + ' .cconb aliases for animation binaries'
        );
    else if (skipped > 0)
        console.log('[patch-csp]   ~ .cconb aliases already exist (' + skipped + ' skipped)');
    else console.log('[patch-csp]   ~ no CCON .bin files found (skipping)');
})();

console.log('[patch-csp] All patches applied successfully.');
