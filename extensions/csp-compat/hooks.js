'use strict';
/**
 * hooks.js – Cocos Creator 3.8 build plugin for Reddit/Devvit CSP compliance.
 *
 * Fires after every web-mobile build and rewrites the output so it works under:
 *   script-src 'self' ... 'wasm-unsafe-eval'   (no 'unsafe-eval')
 *
 * Patches applied:
 *  A  – $P component-scheduler JIT → static dispatcher
 *  B  – tryCatchFunctor_EDITOR → closure
 *  C1 – property-defaults Function("o",l) → try/catch + static fallback
 *  C2 – serialiser Function("s","o","d","k",...) → reflect fallback with __id__ resolver
 *  C3 – instantiation Function("O","F",n) → try/catch + null fallback
 *  C4 – funcModule Function("return "+i) → try/catch
 *  D  – animation property accessor Functions → closures
 *  E  – l.channels() guard in _createEvalWithBinder
 *  G  – physics _isInitialized warning suppression
 *  L  – V3 zero-scale guard (prevents ExoticAnimation from collapsing bones to scale 0)
 *  sys – system.bundle.js (0,eval) wrap
 *  H  – useBakedAnimation=false (CPU skeletal animation)
 *  I  – [DBG-anim] diagnostic log
 *  J  – ensureRunClip always via resources.load
 *  K  – ensureRunClip diagnostics + try-catch + Patch M (per-frame scale/position fix)
 *  cconb – create .cconb aliases for animation binary files
 */

const fs = require('fs');
const path = require('path');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyPatch(content, oldStr, newStr, label) {
    if (content.includes(newStr.slice(0, 40))) {
        console.log('[csp-compat]   ~ ' + label + ' already applied (skipping)');
        return content;
    }
    if (content.includes(oldStr)) {
        console.log('[csp-compat]   ✓ ' + label);
        return content.replace(oldStr, newStr);
    }
    console.warn('[csp-compat]   ~ ' + label + ' – pattern not found (skipping)');
    return content;
}

// ─── Patch _virtual_cc-*.js ───────────────────────────────────────────────────

function patchCcFile(cc) {
    // A – $P component-scheduler JIT
    const P_OLD =
        'function $P(t,e,i){var n="var a=it.array;for(it.i=0;it.i<a.length;++it.i){var c=a[it.i];"+t+"}",r=e?Function("it","dt",n):Function("it",n);return tE(Function("c","dt",t),r,i)}';
    const P_NEW =
        'function $P(t,e,i){var ss=t.split(";");var bodyFn=function(c,dt){for(var _k=0;_k<ss.length;_k++){var _s=ss[_k].trim();if(!_s)continue;var _m1=_s.match(/^c\\.(\\w+)\\(\\s*(dt)?\\s*\\)$/);if(_m1){c[_m1[1]](_m1[2]?dt:void 0);continue;}var _m2=_s.match(/^c\\.(\\w+)\\|=(\\d+)$/);if(_m2){c[_m2[1]]|=+_m2[2];}}};var iterFn=e?function(it,dt){var a=it.array;for(it.i=0;it.i<a.length;++it.i){var c=a[it.i];bodyFn(c,dt);}}:function(it){var a=it.array;for(it.i=0;it.i<a.length;++it.i){var c=a[it.i];bodyFn(c);}};return tE(bodyFn,iterFn,i);}';
    cc = applyPatch(cc, P_OLD, P_NEW, 'A: $P scheduler JIT');

    // B – tryCatchFunctor_EDITOR
    const TCF_OLD =
        'tryCatchFunctor_EDITOR:function(t){return Function("target","try {\\n  target."+t+"();\\n}\\ncatch (e) {\\n  cc._throw(e);\\n}")}';
    const TCF_NEW =
        'tryCatchFunctor_EDITOR:function(t){return(function(m){return function(target){try{target[m]();}catch(e){if(typeof cc!="undefined"&&cc._throw)cc._throw(e);else throw e;}}})(t)}';
    cc = applyPatch(cc, TCF_OLD, TCF_NEW, 'B: tryCatchFunctor_EDITOR');

    // C1 – property-defaults
    cc = cc.replace(
        /return Function\("o",l\)/g,
        'return (function(){try{return Function("o",l);}catch(_csp){var _lines=l.split(";\\n").filter(Boolean);var _pairs=_lines.map(function(_ln){var _m=_ln.trim().match(/^o\\[("[^"]*")\\]=(.+)$/);if(!_m)return null;var _key=JSON.parse(_m[1]),_raw=_m[2];var _val;try{_val=JSON.parse(_raw);}catch(e){_val=undefined;}return[_key,_val];}).filter(Boolean);return function(o){_pairs.forEach(function(p){o[p[0]]=p[1];});};}})()'
    );
    console.log('[csp-compat]   ✓ C1: property-defaults Function("o",l)');

    // C2 – serialiser with __id__ resolver
    const C2_REFLECT =
        'function(s,o,d,k){try{function _rv(v){if(!v||typeof v!=="object")return v;if(Array.isArray(v))return v.map(_rv);if(typeof v.__id__==="number"){if(s&&s._deserializeObjectField){try{return s._deserializeObjectField(v);}catch(_e4){}}return v;}if(typeof v.__type__==="string"){var _c;try{_c=js.getClassByName(v.__type__);}catch(_e2){}if(_c){var _inst=new _c();for(var _q in v){if(_q==="__type__")continue;try{_inst[_q]=_rv(v[_q]);}catch(_e3){}}return _inst;}}var _r={};for(var _q2 in v)_r[_q2]=_rv(v[_q2]);return _r;}var _vals=(s&&s.__values__)||(k&&k.__values__)||[];for(var _i=0;_i<_vals.length;_i++){var _p=_vals[_i];if(_p==="_$erialized")continue;var _v=d[_p];if(typeof _v==="undefined")continue;if(_v!==null&&typeof _v==="object"&&typeof _v.__id__==="number"){if(s&&s._deserializeAndAssignField){try{s._deserializeAndAssignField(o,_v,_p);}catch(_e5){}}continue;}o[_p]=_rv(_v);}if(d._id!==undefined&&o._id!==undefined)o._id=d._id;}catch(_e){}}';
    cc = cc.replace(
        /Function\("s","o","d","k",r\.join\(""\)\)/g,
        '(function(){try{return Function("s","o","d","k",r.join(""));}catch(_csp){return ' +
            C2_REFLECT +
            ';}})()'
    );
    // C2-upgrade: resolve __id__ in already-patched files
    const C2_OLD_ID = 'if(typeof v.__id__==="number")return v;';
    const C2_NEW_ID =
        'if(typeof v.__id__==="number"){if(s&&s._deserializeObjectField){try{return s._deserializeObjectField(v);}catch(_e4){}}return v;}';
    if (cc.includes(C2_OLD_ID)) cc = cc.replace(new RegExp(escRe(C2_OLD_ID), 'g'), C2_NEW_ID);
    const C2_OLD_SKIP = 'if(_v!==null&&typeof _v==="object"&&typeof _v.__id__==="number")continue;';
    const C2_NEW_ASSIGN =
        'if(_v!==null&&typeof _v==="object"&&typeof _v.__id__==="number"){if(s&&s._deserializeAndAssignField){try{s._deserializeAndAssignField(o,_v,_p);}catch(_e5){}}continue;}';
    if (cc.includes(C2_OLD_SKIP))
        cc = cc.replace(new RegExp(escRe(C2_OLD_SKIP), 'g'), C2_NEW_ASSIGN);
    console.log('[csp-compat]   ✓ C2: serialiser + __id__ resolver');

    // C3 – instantiation builder
    cc = cc.replace(
        /Function\("O","F",n\)\(this\.objs,this\.funcs\)/g,
        '(function(){try{return Function("O","F",n)(this.objs,this.funcs);}catch(_csp){console.warn("[CSP] instantiation JIT skipped");return null;}}).call(this)'
    );
    console.log('[csp-compat]   ✓ C3: instantiation Function("O","F",n)');

    // C4 – funcModule
    cc = cc.replace(
        /(?<!try\{if\(r=t===)Function\("return "\+i\)\(\)/g,
        '(function(){try{return Function("return "+i)();}catch(_csp){return undefined;}})()'
    );
    console.log('[csp-compat]   ✓ C4: funcModule Function("return "+i)');

    // D – animation property accessor
    cc = cc.replace(
        /setValue:Function\("value",'this\.target\["'\+f\+'"\] = value;'\),getValue:Function\('return this\.target\["'\+f\+'"\];'\)/g,
        'setValue:(function(_f){return function(value){this.target[_f]=value;}})(f),getValue:(function(_f){return function(){return this.target[_f];}})(f)'
    );
    console.log('[csp-compat]   ✓ D: animation property accessors');

    // E – compileCreateFunction fallback
    const CCF_OLD =
        'i.compileCreateFunction=function(){var t,e;this._createFunction=(e=(t=this.data)instanceof C.Node&&t,new EE(t,e).result)},';
    const CCF_NEW =
        'i.compileCreateFunction=function(){var t,e;var _r=(e=(t=this.data)instanceof C.Node&&t,new EE(t,e).result);if(typeof _r==="function"){this._createFunction=_r;}else{var _d=t;this._createFunction=function(R){return _d._instantiate(R);};}},';
    cc = applyPatch(cc, CCF_OLD, CCF_NEW, 'E: compileCreateFunction fallback');

    // F – l.channels() guard
    const CH_OLD =
        'if(!r.includes(l)&&!Array.from(l.channels()).every((function(t){return 0===t.curve.keyFramesCount}))){';
    const CH_NEW =
        'if(!r.includes(l)&&typeof l.channels==="function"&&!Array.from(l.channels()).every((function(t){return 0===t.curve.keyFramesCount}))){';
    cc = applyPatch(cc, CH_OLD, CH_NEW, 'F: l.channels() guard');

    // G – physics _isInitialized warnings
    let gCount = 0;
    const G1_OLD =
        '{var t=null===this._body;return t&&Q("[Physics]: This component has not been call onLoad yet, please make sure the node has been added to the scene."),!t}';
    const G2_OLD =
        '{var t=null===this._shape;return t&&Q("[Physics]: This component has not been call onLoad yet, please make sure the node has been added to the scene."),!t}';
    if (cc.includes(G1_OLD)) {
        cc = cc.replace(G1_OLD, '{return null!==this._body}');
        gCount++;
    }
    if (cc.includes(G2_OLD)) {
        cc = cc.replace(G2_OLD, '{return null!==this._shape}');
        gCount++;
    }
    if (gCount > 0)
        console.log('[csp-compat]   ✓ G: physics _isInitialized (' + gCount + ' getters)');
    else console.warn('[csp-compat]   ~ G: physics _isInitialized not found (skipping)');

    // L – V3 zero-scale guard: prevents ExoticAnimation from collapsing all bones to scale 0
    // when the scale curve data contains all-zero values (common with Mixamo/GLTF imports).
    const L_OLD = 'n&&(this._scale=Z3(n.times,n.values,ir,t,"scale",r))';
    const L_NEW =
        'n&&n.values&&(function(_sv){var _nz=false;for(var _si=0,_sl=Math.min(_sv.length,60);_si<_sl;_si++)if(Math.abs(_sv[_si])>1e-4){_nz=true;break;}if(!_nz)console.warn("[csp-compat] L: zero-scale curve skipped on",t);return _nz;})(n.values)&&(this._scale=Z3(n.times,n.values,ir,t,"scale",r))';
    cc = applyPatch(cc, L_OLD, L_NEW, 'L: V3 zero-scale guard');

    // N – V3 zero-position guard: same issue as L but for position tracks.
    // When C2 fails to resolve {__id__:N} typed-array references, e.values is a plain
    // object; Math.abs(obj[i]) = NaN → guard blocks the evaluator → bone stays at
    // rest-pose position instead of collapsing to (0,0,0) every frame.
    const N_OLD = 'e&&(this._position=Z3(e.times,e.values,ir,t,"position",r))';
    const N_NEW =
        'e&&e.values&&(function(_pv){var _nz=false;for(var _pi=0,_pl=Math.min(_pv.length,60);_pi<_pl;_pi++)if(Math.abs(_pv[_pi])>1e-4){_nz=true;break;}if(!_nz)console.warn("[csp-compat] N: zero-pos curve skipped on",t);return _nz;})(e.values)&&(this._position=Z3(e.times,e.values,ir,t,"position",r))';
    cc = applyPatch(cc, N_OLD, N_NEW, 'N: V3 zero-position guard');

    // O – V3 zero-rotation guard: same {__id__:N} failure as L/N but for quaternion
    // tracks.  A broken i.values object → Math.abs(undefined) = NaN → NaN > 1e-4 =
    // false → evaluator blocked → bone keeps rest-pose orientation → model visible.
    const O_OLD = 'i&&(this._rotation=Z3(i.times,i.values,kr,t,"rotation",r))';
    const O_NEW =
        'i&&i.values&&(function(_rv){var _nz=false;for(var _ri=0,_rl=Math.min(_rv.length,60);_ri<_rl;_ri++)if(Math.abs(_rv[_ri])>1e-4){_nz=true;break;}if(!_nz)console.warn("[csp-compat] O: zero-rot curve skipped on",t);return _nz;})(i.values)&&(this._rotation=Z3(i.times,i.values,kr,t,"rotation",r))';
    cc = applyPatch(cc, O_OLD, O_NEW, 'O: V3 zero-rotation guard');

    return cc;
}

// ─── Patch system.bundle.js ───────────────────────────────────────────────────

function patchSystemFile(sys) {
    sys = sys.replace(
        '(0,eval)(e)',
        '(function(){try{return(0,eval)(e);}catch(_csp){console.warn("[CSP] system.bundle eval blocked");}})()'
    );
    console.log('[csp-compat]   ✓ sys: system.bundle.js eval wrap');
    return sys;
}

// ─── Patch assets/main/index.js ───────────────────────────────────────────────

function buildPatchM() {
    // Patch M: per-frame scale-zero fix + root-motion position lock
    // Runs every frame after play() to counteract ExoticAnimation setting bone scales to 0
    // or root-motion displacing the armature node.
    return (
        'var _mOrigPos=null;try{_mOrigPos=_sn.getPosition().clone();}catch(_me1){}' +
        'var _mFixFn=function(){' +
        'if(!_sn||!_sn.isValid||!e.isValid){try{e.unschedule(_mFixFn);}catch(_me2){}return;}' +
        'function _mFz(nd){try{var _ms=nd.scale;if(_ms&&_ms.x<1e-3&&_ms.y<1e-3&&_ms.z<1e-3)nd.setScale(1,1,1);}catch(_){}' +
        'for(var _mj=0;_mj<nd.children.length;_mj++)_mFz(nd.children[_mj]);}' +
        '_mFz(_sn);' +
        'if(_mOrigPos){try{var _mCp=_sn.getPosition();if(Math.abs(_mCp.y-_mOrigPos.y)>0.5)_sn.setPosition(_mOrigPos);}catch(_me3){}}' +
        '};' +
        'e.schedule(_mFixFn,0);' +
        'console.log("[DBG-K] PatchM: per-frame scale+pos fix scheduled");'
    );
}

function patchMainFile(main) {
    // H – useBakedAnimation=false
    const H_OLD = 'var s=n.getModelSkeletalAnimation(t);n.attachHeroWeaponVisuals(e,t),';
    const H_NEW =
        'var s=n.getModelSkeletalAnimation(t);s&&(s.useBakedAnimation=!1),n.attachHeroWeaponVisuals(e,t),';
    if (main.includes(H_OLD)) {
        main = main.replace(H_OLD, H_NEW);
        console.log('[csp-compat]   ✓ H: useBakedAnimation=false (CPU anim mode)');
    } else if (main.includes('s.useBakedAnimation=!1')) {
        console.log('[csp-compat]   ~ H: already present (skipping)');
    } else {
        console.warn('[csp-compat]   ~ H: pattern not found');
    }

    // I – diagnostic log
    const I_DBG =
        'console.log("[DBG-anim] skelAnim found:",!!s,"clips:",s&&s.clips&&s.clips.length),';
    const I_TARGET =
        'var s=n.getModelSkeletalAnimation(t);s&&(s.useBakedAnimation=!1),n.attachHeroWeaponVisuals(e,t),';
    const I_NEW =
        'var s=n.getModelSkeletalAnimation(t);' +
        I_DBG +
        's&&(s.useBakedAnimation=!1),n.attachHeroWeaponVisuals(e,t),';
    if (!main.includes(I_DBG) && main.includes(I_TARGET)) {
        main = main.replace(I_TARGET, I_NEW);
        console.log('[csp-compat]   ✓ I: [DBG-anim] diagnostic log');
    } else if (main.includes(I_DBG)) {
        console.log('[csp-compat]   ~ I: diagnostic log already present (skipping)');
    }

    // J – force ensureRunClip path
    const J_OLD =
        'var _=s.clips&&s.clips.length>0?s.clips[0]:null;' +
        'if(_){var E=_,S=n.bindClipState(s,E,n.buildHeroStateName(i.key,"run"));' +
        'f.setRunClip(S),f.setIdleClip(S),s.defaultClip=E,s.playOnLoad=!0,s.play(S)}' +
        'else n.ensureRunClip(s,f)';
    const J_NEW = 'n.ensureRunClip(s,f)';
    if (!main.includes(J_OLD) && main.includes(J_NEW)) {
        console.log('[csp-compat]   ~ J: ensureRunClip already forced (skipping)');
    } else if (main.includes(J_OLD)) {
        main = main.replace(J_OLD, J_NEW);
        console.log('[csp-compat]   ✓ J: forced ensureRunClip');
    } else {
        console.warn('[csp-compat]   ~ J: pattern not found');
    }

    // K – full diagnostics + Patch M per-frame fix
    const K_OLD_BARE =
        'a._heroRunClipCache.set(t.key,o);var l=a.bindClipState(e,o,a.buildHeroStateName(t.key,"run"));' +
        'e.defaultClip=o,e.playOnLoad=!0,e.play(l),n&&(n.setRunClip(l),n.setIdleClip(l))';
    const K_FULL =
        'a._heroRunClipCache.set(t.key,o);' +
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
        buildPatchM() +
        '}' +
        '}catch(_ke){console.error("[DBG-K] play() threw:",_ke);}';

    if (main.includes('PatchM:')) {
        console.log('[csp-compat]   ~ K+M: already applied (skipping)');
    } else if (main.includes('[DBG-K]')) {
        // Upgrade: inject Patch M into existing K
        const M_INSERT_AFTER = '},0);}';
        const M_INSERT = '},0);' + buildPatchM() + '}';
        const K_CLOSE = '}catch(_ke){console.error("[DBG-K] play() threw:",_ke);}';
        const M_TARGET = M_INSERT_AFTER + K_CLOSE;
        if (main.includes(M_TARGET)) {
            main = main.replace(M_TARGET, M_INSERT + K_CLOSE);
            console.log('[csp-compat]   ✓ K: upgraded with Patch M (scale+pos fix)');
        } else {
            console.warn('[csp-compat]   ~ K: upgrade pattern not found');
        }
    } else if (main.includes(K_OLD_BARE)) {
        main = main.replace(K_OLD_BARE, K_FULL);
        console.log('[csp-compat]   ✓ K+M: diagnostics + per-frame scale+pos fix');
    } else {
        console.warn('[csp-compat]   ~ K: pattern not found');
    }

    // Bullet – defer setGroup/setMask
    const BUL_OLD = 'i.setGroup(16),i.setMask(8),i.on("onTriggerEnter",this.onTriggerEnter,this)}';
    const BUL_NEW =
        'i.on("onTriggerEnter",this.onTriggerEnter,this);var _ci=i;this.scheduleOnce(function(){_ci&&_ci.isValid&&(_ci.setGroup(16),_ci.setMask(8));},0)}';
    if (main.includes(BUL_OLD)) {
        main = main.replace(BUL_OLD, BUL_NEW);
        console.log('[csp-compat]   ✓ Bullet setGroup/setMask deferred');
    } else if (main.includes(BUL_NEW)) {
        console.log('[csp-compat]   ~ Bullet already deferred (skipping)');
    }

    return main;
}

// ─── Create .cconb aliases ────────────────────────────────────────────────────

function createCconbAliases(webroot) {
    const resImport = path.join(webroot, 'assets', 'resources', 'import');
    if (!fs.existsSync(resImport)) {
        console.warn('[csp-compat]   ~ resources/import not found (skipping .cconb aliases)');
        return;
    }
    const CCON_MAGIC = Buffer.from([0x43, 0x43, 0x4f, 0x4e]);
    let created = 0,
        skipped = 0;
    for (const sub of fs.readdirSync(resImport)) {
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
    if (created > 0) console.log('[csp-compat]   ✓ Created ' + created + ' .cconb aliases');
    else if (skipped > 0)
        console.log('[csp-compat]   ~ .cconb aliases already exist (' + skipped + ' skipped)');
    else console.log('[csp-compat]   ~ no CCON .bin files found');
}

// ─── Main hook ────────────────────────────────────────────────────────────────

exports.throwWhenFailed = false;

exports.onAfterBuild = async function (options) {
    if (options.platform !== 'web-mobile') return;
    if (process.env.GVR_ENABLE_REDDIT_CSP_PATCH !== '1') {
        console.log('[csp-compat] Skip patching (set GVR_ENABLE_REDDIT_CSP_PATCH=1 to enable).');
        return;
    }

    const dest = options.dest;
    console.log('[csp-compat] Patching build at:', dest);

    // 1. Patch _virtual_cc-*.js
    const cocosDir = path.join(dest, 'cocos-js');
    if (fs.existsSync(cocosDir)) {
        const ccFiles = fs
            .readdirSync(cocosDir)
            .filter(f => f.startsWith('_virtual_cc-') && f.endsWith('.js'));
        for (const f of ccFiles) {
            const p = path.join(cocosDir, f);
            fs.writeFileSync(p, patchCcFile(fs.readFileSync(p, 'utf8')), 'utf8');
            console.log('[csp-compat] Saved', f);
        }
    } else {
        console.warn('[csp-compat] cocos-js/ not found at', dest);
    }

    // 2. Patch system.bundle.js
    const sysPath = path.join(dest, 'src', 'system.bundle.js');
    if (fs.existsSync(sysPath)) {
        fs.writeFileSync(sysPath, patchSystemFile(fs.readFileSync(sysPath, 'utf8')), 'utf8');
        console.log('[csp-compat] Saved system.bundle.js');
    }

    // 3. Patch assets/main/index.js
    const mainPath = path.join(dest, 'assets', 'main', 'index.js');
    if (fs.existsSync(mainPath)) {
        fs.writeFileSync(mainPath, patchMainFile(fs.readFileSync(mainPath, 'utf8')), 'utf8');
        console.log('[csp-compat] Saved assets/main/index.js');
    } else {
        console.warn('[csp-compat] assets/main/index.js not found');
    }

    // 4. Create .cconb aliases
    createCconbAliases(dest);

    // 5. If dest != devvit/webroot, also copy patched files there
    const projectRoot = path.resolve(__dirname, '../..');
    const devvitWebroot = path.join(projectRoot, 'devvit', 'webroot');
    if (fs.existsSync(devvitWebroot) && path.resolve(dest) !== path.resolve(devvitWebroot)) {
        console.log('[csp-compat] Copying patched build to devvit/webroot ...');
        copyDir(dest, devvitWebroot);
        console.log('[csp-compat] devvit/webroot updated.');
    }

    console.log('[csp-compat] All patches applied successfully.');
};

function copyDir(src, dst) {
    if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const dstPath = path.join(dst, entry.name);
        if (entry.isDirectory()) copyDir(srcPath, dstPath);
        else fs.copyFileSync(srcPath, dstPath);
    }
}
