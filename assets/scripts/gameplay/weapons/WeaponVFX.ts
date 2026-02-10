import {
    Node,
    Vec3,
    Color,
    MeshRenderer,
    primitives,
    utils,
    Material,
    tween,
    Tween,
    Mesh,
    Texture2D,
    ImageAsset,
    resources,
    Prefab,
    instantiate,
    ParticleSystem,
    Animation,
} from 'cc';
import { ProjectilePool } from './vfx/ProjectilePool';

/**
 * WeaponVFX — 武器特效工具集 (性能优化版)
 *
 * 核心原则：
 * 1. 材质缓存 — 相同颜色共享材质实例，开启 GPU Instancing
 * 2. 网格缓存 — 所有子弹/VFX 共用少量 Mesh（扁平面片、小方块）
 * 3. 对象池   — VFX 节点用完回收，不 destroy
 * 4. 能造假就不模拟 — billboard 面片代替 3D 模型，拉长 = 拖尾
 */
export class WeaponVFX {
    // ========== 缓存 ==========

    private static _matCache: Map<string, Material> = new Map();
    private static _meshCache: Map<string, Mesh> = new Map();

    // ========== 复用的常量向量（避免热路径 new Vec3） ==========
    private static readonly _SCALE_ZERO = new Vec3(0, 0, 0);
    private static readonly _SCALE_FLASH_PEAK = new Vec3(1.2, 1.2, 1.2);
    private static readonly _SCALE_HALF = new Vec3(0.5, 0.5, 0.5);
    private static readonly _DEFAULT_HIT_COLOR = new Color(255, 220, 150, 255);
    private static _initialized: boolean = false;
    private static _bulletTex: Texture2D | null = null;
    private static _bulletTexLoading: boolean = false;
    private static _deathRayPrefab: Prefab | null = null;
    private static _deathRayPrefabLoading: boolean = false;
    private static _deathRayPrefabPool: Node[] = [];
    private static readonly _DEATH_RAY_PREFAB_POOL_CAP: number = 8;
    private static _flamePrefab: Prefab | null = null;
    private static _flamePrefabLoading: boolean = false;
    private static _flamePrefabPool: Node[] = [];
    private static readonly _FLAME_PREFAB_POOL_CAP: number = 10;

    /** 初始化共享资源 + 预热池（在 GameController.onLoad 调用一次） */
    public static initialize(): void {
        if (this._initialized) return;
        this._initialized = true;

        // 预热 VFX 节点池
        ProjectilePool.register('vfx_flash', () => this._createVfxNode('Flash'), 30);
        ProjectilePool.register('vfx_ring', () => this._createVfxNode('Ring'), 4);
        ProjectilePool.register('vfx_debris', () => this._createVfxNode('Debris'), 15);
        ProjectilePool.register('vfx_ground', () => this._createVfxNode('Ground'), 3);
        ProjectilePool.register('vfx_beam_core', () => this._createVfxNode('BeamCore'), 2);
        ProjectilePool.register('vfx_beam_glow', () => this._createVfxNode('BeamGlow'), 2);
        ProjectilePool.register('vfx_beam_pulse', () => this._createVfxNode('BeamPulse'), 2);
        // 机枪子弹池 + 弹壳池
        ProjectilePool.register('mg_bullet', () => this._createMGBulletNode(), 40);
        ProjectilePool.register('mg_casing', () => this._createCasingNode(), 10);
        this._ensureBulletTexture();
        this._ensureDeathRayPrefab();
        this._ensureFlamePrefab();
    }

    private static _ensureBulletTexture(): void {
        if (this._bulletTex || this._bulletTexLoading) return;
        this._bulletTexLoading = true;

        // 优先尝试加载 Texture2D（编辑器已处理的资源）
        resources.load('textures/bullet/texture', Texture2D, (err, texture) => {
            if (!err && texture) {
                this._bulletTexLoading = false;
                this._bulletTex = texture;
                console.log('[WeaponVFX] Bullet texture loaded (Texture2D)');
                return;
            }
            // 回退：尝试直接加载 Texture2D（不带 /texture 后缀）
            resources.load('textures/bullet', Texture2D, (err2, tex2) => {
                if (!err2 && tex2) {
                    this._bulletTexLoading = false;
                    this._bulletTex = tex2;
                    console.log('[WeaponVFX] Bullet texture loaded (Texture2D direct)');
                    return;
                }
                // 再回退：加载为 ImageAsset，手动创建 Texture2D
                resources.load('textures/bullet', ImageAsset, (err3, imgAsset) => {
                    this._bulletTexLoading = false;
                    if (err3 || !imgAsset) {
                        console.warn(
                            '[WeaponVFX] All bullet texture load attempts failed.',
                            '\n  Please open project in Cocos Creator editor to generate bullet.webp.meta'
                        );
                        return;
                    }
                    const tex = new Texture2D();
                    tex.image = imgAsset;
                    this._bulletTex = tex;
                    console.log('[WeaponVFX] Bullet texture loaded (ImageAsset → Texture2D)');
                });
            });
        });
    }

    private static _ensureDeathRayPrefab(): void {
        if (this._deathRayPrefab || this._deathRayPrefabLoading) return;
        this._deathRayPrefabLoading = true;
        resources.load('effects/deathray_skill/skill8', Prefab, (err, prefab) => {
            this._deathRayPrefabLoading = false;
            if (err || !prefab) {
                console.warn('[WeaponVFX] Failed to load deathray prefab skill8:', err);
                return;
            }
            this._deathRayPrefab = prefab;
        });
    }

    private static _ensureFlamePrefab(): void {
        if (this._flamePrefab || this._flamePrefabLoading) return;
        this._flamePrefabLoading = true;
        resources.load('effects/flamethrower_skill/fire01', Prefab, (err, prefab) => {
            this._flamePrefabLoading = false;
            if (err || !prefab) {
                console.warn('[WeaponVFX] Failed to load flame prefab fire01:', err);
                return;
            }
            this._flamePrefab = prefab;
        });
    }

    private static _borrowDeathRayPrefabNode(): Node | null {
        while (this._deathRayPrefabPool.length > 0) {
            const cached = this._deathRayPrefabPool.pop();
            if (cached && cached.isValid) return cached;
        }
        if (!this._deathRayPrefab) return null;
        return instantiate(this._deathRayPrefab);
    }

    private static _borrowFlamePrefabNode(): Node | null {
        while (this._flamePrefabPool.length > 0) {
            const cached = this._flamePrefabPool.pop();
            if (cached && cached.isValid) return cached;
        }
        if (!this._flamePrefab) return null;
        return instantiate(this._flamePrefab);
    }

    private static _recycleDeathRayPrefabNode(node: Node): void {
        if (!node || !node.isValid) return;
        Tween.stopAllByTarget(node);
        this._setDeathRayPrefabPlayback(node, false);
        node.removeFromParent();
        node.setScale(2, 2, 2);

        if (this._deathRayPrefabPool.length < this._DEATH_RAY_PREFAB_POOL_CAP) {
            this._deathRayPrefabPool.push(node);
        } else {
            node.destroy();
        }
    }

    private static _recycleFlamePrefabNode(node: Node): void {
        if (!node || !node.isValid) return;
        Tween.stopAllByTarget(node);
        this._setFlamePrefabPlayback(node, false);
        node.removeFromParent();
        node.setScale(1, 1, 1);

        if (this._flamePrefabPool.length < this._FLAME_PREFAB_POOL_CAP) {
            this._flamePrefabPool.push(node);
        } else {
            node.destroy();
        }
    }

    private static _playDeathRayPrefab(
        parent: Node,
        start: Vec3,
        end: Vec3,
        opts: { width: number; duration: number }
    ): boolean {
        if (!this._deathRayPrefab) return false;
        const node = this._borrowDeathRayPrefabNode();
        if (!node) return false;

        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len < 0.001) {
            this._recycleDeathRayPrefabNode(node);
            return false;
        }
        const yawDeg = (Math.atan2(dx, dz) * 180) / Math.PI;

        parent.addChild(node);
        node.setPosition(start);
        const widthScale = Math.max(0.48, Math.min(1.65, opts.width / 0.24));
        const lengthScale = Math.max(0.42, len / 12);
        node.setRotationFromEuler(0, yawDeg, 0);
        node.setScale(lengthScale, widthScale, widthScale);
        this._applyDeathRayPrefabNodeScale(node, widthScale);

        this._setDeathRayPrefabPlayback(node, true);

        const life = Math.max(0.95, opts.duration * 9.5);
        tween(node)
            .delay(life)
            .call(() => this._recycleDeathRayPrefabNode(node))
            .start();
        return true;
    }



    // ========== 持续火焰 API（喷火器专用） ==========

    /** 借出一个持续播放的火焰节点（调用方负责 update + stop） */
    public static startContinuousFlame(
        parent: Node,
        start: Vec3,
        end: Vec3,
        width: number,
        levelScale: number = 1.0
    ): Node | null {
        this._ensureFlamePrefab();
        if (!this._flamePrefab) return null;
        const node = this._borrowFlamePrefabNode();
        if (!node) return null;

        parent.addChild(node);
        this._applyFlameTransform(node, start, end, width, levelScale);
        this._setFlamePrefabPlayback(node, true);
        return node;
    }

    /** 更新已存在的持续火焰的位置/方向/大小 */
    public static updateFlameTransform(
        node: Node,
        start: Vec3,
        end: Vec3,
        width: number,
        levelScale: number = 1.0
    ): void {
        if (!node || !node.isValid) return;
        this._applyFlameTransform(node, start, end, width, levelScale);
    }

    /** 停止持续火焰并归池 */
    public static stopContinuousFlame(node: Node): void {
        if (!node || !node.isValid) return;
        this._recycleFlamePrefabNode(node);
    }

    private static _applyFlameTransform(
        node: Node,
        start: Vec3,
        end: Vec3,
        width: number,
        levelScale: number = 1.0
    ): void {
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len < 0.001) return;

        const yawDeg = (Math.atan2(dx, dz) * 180) / Math.PI + 180;

        // 将火焰起点前移，让火焰从角色身前喷出而非烧自己
        const forwardOffset = 1.8;
        const offsetX = (dx / len) * forwardOffset;
        const offsetZ = (dz / len) * forwardOffset;

        node.setPosition(start.x + offsetX, start.y, start.z + offsetZ);
        const widthScale = Math.max(3.0, Math.min(8.0, width / 0.12)) * levelScale;
        const lengthScale = Math.max(3.5, Math.min(14, len / 0.5)) * levelScale;
        node.setRotationFromEuler(0, yawDeg, 0);
        node.setScale(lengthScale, widthScale, widthScale);
    }

    private static _setNodeUniformScale(node: Node | null, value: number): void {
        if (!node || !node.isValid) return;
        node.setScale(value, value, value);
    }

    private static _applyDeathRayPrefabNodeScale(node: Node, widthScale: number): void {
        const root = node.getChildByName('root');
        if (!root) return;

        // 低等级显著收小两端光球；满级保持接近原效果。
        const capScale = Math.max(0.3, Math.min(1, widthScale / 1.65));
        const trailScale = Math.max(0.42, Math.min(1, widthScale / 1.4));

        this._setNodeUniformScale(root.getChildByName('glow'), capScale);
        this._setNodeUniformScale(root.getChildByName('hit'), capScale);
        this._setNodeUniformScale(root.getChildByName('juan'), capScale * 0.9);
        this._setNodeUniformScale(root.getChildByName('fasan'), trailScale);
    }

    private static _getComponentSafe<T>(
        node: Node | null,
        ctor: new (...args: never[]) => T
    ): T | null {
        if (!node || !node.isValid) return null;
        try {
            return node.getComponent(ctor);
        } catch {
            return null;
        }
    }

    private static _setDeathRayPrefabPlayback(node: Node, play: boolean): void {
        const root = node.getChildByName('root');
        if (!root) return;

        const fxNames = ['glow', 'fasan', 'hit'];
        for (const name of fxNames) {
            const fxNode = root.getChildByName(name);
            const ps = this._getComponentSafe(fxNode, ParticleSystem);
            if (!ps) continue;
            if (play) {
                ps.stop();
                ps.clear();
                ps.play();
            } else {
                ps.stop();
                ps.clear();
            }
        }

        const anm = this._getComponentSafe(root, Animation);
        if (anm) {
            if (play) {
                anm.stop();
                anm.play();
            } else {
                anm.stop();
            }
        }

        const bullet = root.getChildByName('liudong')?.getChildByName('bullet');
        if (bullet) bullet.active = false;
        const rune = root.getChildByName('rune');
        if (rune) rune.active = false;
    }

    private static _setFlamePrefabPlayback(node: Node, play: boolean): void {
        const systems = node.getComponentsInChildren(ParticleSystem);
        for (const ps of systems) {
            if (!ps || !ps.isValid) continue;
            if (play) {
                ps.stop();
                ps.clear();
                ps.play();
            } else {
                ps.stop();
                ps.clear();
            }
        }
    }

    /** 获取子弹贴图（可能为 null，异步加载中） */
    public static get bulletTexture(): Texture2D | null {
        return this._bulletTex;
    }

    // ========== 材质工厂（缓存 + GPU Instancing） ==========

    /** 获取/创建 unlit 材质（缓存，开启 Instancing） */
    public static getUnlitMat(color: Color): Material {
        const key = `unlit_${color.toHEX()}`;
        let mat = this._matCache.get(key);
        if (mat) return mat;

        mat = new Material();
        mat.initialize({
            effectName: 'builtin-unlit',
            defines: { USE_INSTANCING: true },
        });
        mat.setProperty('mainColor', color);
        this._matCache.set(key, mat);
        return mat;
    }

    /** 获取/创建发光(透明)材质（缓存，开启 Instancing） */
    public static getGlowMat(color: Color): Material {
        const key = `glow_${color.toHEX()}`;
        let mat = this._matCache.get(key);
        if (mat) return mat;

        mat = new Material();
        mat.initialize({
            effectName: 'builtin-unlit',
            technique: 1, // Transparent (alpha blend)
            defines: { USE_INSTANCING: true },
        });
        mat.setProperty('mainColor', color);
        this._matCache.set(key, mat);
        return mat;
    }

    /** 获取/创建带贴图的透明材质（子弹精灵用，alpha 混合） */
    public static getSpriteMat(color: Color, tex: Texture2D): Material {
        const key = `sprite_${color.toHEX()}_${tex._uuid?.substring(0, 8) ?? 'def'}`;
        let mat = this._matCache.get(key);
        if (mat) return mat;

        mat = new Material();
        mat.initialize({
            effectName: 'builtin-unlit',
            technique: 1, // Transparent (alpha blend)
            defines: { USE_TEXTURE: true, USE_INSTANCING: true },
        });
        mat.setProperty('mainTexture', tex);
        mat.setProperty('mainColor', color);
        this._matCache.set(key, mat);
        return mat;
    }

    // ========== 旧 API 兼容（过渡期） ==========
    public static createUnlitMat(color: Color): Material {
        return this.getUnlitMat(color);
    }
    public static createGlowMat(color: Color): Material {
        return this.getGlowMat(color);
    }

    // ========== 网格工厂（缓存） ==========

    /** 获取缓存的 box mesh */
    public static getBoxMesh(w: number, h: number, l: number): Mesh {
        const key = `box_${w.toFixed(3)}_${h.toFixed(3)}_${l.toFixed(3)}`;
        let mesh = this._meshCache.get(key);
        if (mesh) return mesh;

        mesh = utils.MeshUtils.createMesh(primitives.box({ width: w, height: h, length: l }));
        this._meshCache.set(key, mesh);
        return mesh;
    }

    /** 获取缓存的扁平面片 mesh（billboard 用） */
    public static getFlatQuadMesh(w: number, l: number): Mesh {
        return this.getBoxMesh(w, 0.01, l);
    }

    /** 添加 box mesh 到节点（使用缓存） */
    public static addBoxMesh(
        node: Node,
        w: number,
        h: number,
        l: number,
        mat: Material
    ): MeshRenderer {
        let renderer = node.getComponent(MeshRenderer);
        if (!renderer) {
            renderer = node.addComponent(MeshRenderer);
        }
        renderer.mesh = this.getBoxMesh(w, h, l);
        renderer.setMaterial(mat, 0);
        return renderer;
    }

    // ========== Billboard 子弹 ==========

    /**
     * 创建 Billboard 子弹节点（扁平面片）
     * 面片拉长 = 视觉拖尾，无需 MotionStreak
     * @param w       宽度
     * @param l       长度（越长看起来拖尾越长）
     * @param color   颜色
     */
    public static createBillboardBullet(w: number, l: number, color: Color): Node {
        const node = new Node('BB_Bullet');
        node.layer = 1 << 0;
        const renderer = node.addComponent(MeshRenderer);
        renderer.mesh = this.getFlatQuadMesh(w, l);
        renderer.setMaterial(this.getUnlitMat(color), 0);
        return node;
    }

    // ========== 机枪精灵子弹（池化 + 贴图） ==========

    /**
     * 工厂：创建机枪子弹节点（带贴图的 billboard 面片）
     * 由 ProjectilePool 调用，预热 + 按需扩容
     */
    private static _createMGBulletNode(): Node {
        const node = new Node('MG_Bullet');
        node.layer = 1 << 0;
        const renderer = node.addComponent(MeshRenderer);
        // 默认尺寸，fire() 时通过 setScale 调整
        renderer.mesh = this.getFlatQuadMesh(1, 1);
        // 先用白色 unlit；fire() 时根据等级换材质
        renderer.setMaterial(this.getUnlitMat(Color.WHITE), 0);
        return node;
    }

    /**
     * 配置机枪子弹的视觉：尺寸、材质、贴图
     * @param node    从池中取出的子弹节点
     * @param w       宽度
     * @param l       长度（拖尾感）
     * @param color   色调
     */
    public static configureMGBullet(node: Node, w: number, l: number, color: Color): void {
        const renderer = node.getComponent(MeshRenderer);
        if (!renderer) return;
        if (this._bulletTex) {
            renderer.setMaterial(this.getSpriteMat(color, this._bulletTex), 0);
        } else {
            renderer.setMaterial(this.getUnlitMat(color), 0);
        }
        // X=长度（匹配贴图水平方向），Z=宽度；mesh 保持 1×1 避免缓存碎片
        node.setScale(l, 1, w);
    }

    /**
     * 子弹命中火花（打击感反馈）
     * 小型闪光 + 1-2 个碎片，低开销高反馈
     */
    public static createHitSpark(parent: Node, pos: Vec3, color?: Color): void {
        const c = color ?? this._DEFAULT_HIT_COLOR;
        // 小型闪光
        const flash = ProjectilePool.get('vfx_flash');
        if (flash) {
            parent.addChild(flash);
            flash.setPosition(pos);
            this.configureVfxNode(flash, this.getBoxMesh(0.08, 0.08, 0.08), this.getGlowMat(c));
            flash.setScale(0.3, 0.3, 0.3);
            tween(flash)
                .to(0.03, { scale: this._SCALE_FLASH_PEAK })
                .to(0.05, { scale: this._SCALE_ZERO })
                .call(() => ProjectilePool.put('vfx_flash', flash))
                .start();
        }
        // 1 个碎片飞溅
        const d = ProjectilePool.get('vfx_debris');
        if (!d) return;
        parent.addChild(d);
        d.setPosition(pos);
        const s = 0.02 + Math.random() * 0.02;
        this.configureVfxNode(d, this.getBoxMesh(s, s, s), this.getUnlitMat(c));
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 2;
        const endP = new Vec3(
            pos.x + Math.cos(angle) * speed * 0.08,
            pos.y + 0.05 + Math.random() * 0.1,
            pos.z + Math.sin(angle) * speed * 0.08
        );
        d.setScale(1, 1, 1);
        tween(d)
            .to(0.1, { position: endP, scale: this._SCALE_HALF }, { easing: 'quartOut' })
            .to(0.08, { scale: this._SCALE_ZERO })
            .call(() => ProjectilePool.put('vfx_debris', d))
            .start();
    }

    // ========== 弹壳粒子（池化） ==========

    private static _createCasingNode(): Node {
        const node = new Node('Casing');
        node.layer = 1 << 0;
        const renderer = node.addComponent(MeshRenderer);
        renderer.mesh = this.getBoxMesh(0.03, 0.015, 0.06);
        renderer.setMaterial(this.getUnlitMat(new Color(200, 170, 60, 255)), 0);
        return node;
    }

    /**
     * 弹壳抛射（元气骑士风格：机枪射击时抛出小弹壳）
     */
    public static ejectCasing(parent: Node, pos: Vec3, dirX: number, dirZ: number): void {
        const node = ProjectilePool.get('mg_casing');
        if (!node) return;

        parent.addChild(node);
        node.setPosition(pos);
        node.setScale(1, 1, 1);

        // 弹壳向射击方向的右侧抛出
        const rightX = -dirZ;
        const rightZ = dirX;
        const side = Math.random() > 0.5 ? 1 : -1;
        const ejectSpeed = 0.3 + Math.random() * 0.4;
        const upSpeed = 0.15 + Math.random() * 0.15;

        const endPos = new Vec3(
            pos.x + rightX * side * ejectSpeed,
            pos.y + upSpeed,
            pos.z + rightZ * side * ejectSpeed
        );
        const fallPos = new Vec3(endPos.x, pos.y - 0.05, endPos.z);

        tween(node)
            .to(0.12, { position: endPos, scale: new Vec3(0.8, 0.8, 0.8) }, { easing: 'quartOut' })
            .to(0.2, { position: fallPos, scale: new Vec3(0.3, 0.3, 0.3) }, { easing: 'quartIn' })
            .call(() => ProjectilePool.put('mg_casing', node))
            .start();
    }

    // ========== VFX 节点工厂（池友好） ==========

    private static _createVfxNode(name: string): Node {
        const node = new Node(name);
        node.layer = 1 << 0;
        node.addComponent(MeshRenderer);
        return node;
    }

    /** 配置 VFX 节点的 mesh + material（复用节点，只换皮） */
    public static configureVfxNode(node: Node, mesh: Mesh, mat: Material): void {
        const renderer = node.getComponent(MeshRenderer);
        if (renderer) {
            renderer.mesh = mesh;
            renderer.setMaterial(mat, 0);
        }
    }

    /**
     * 代码模拟光束（无 shader 时序依赖）
     * - Core: 主光束
     * - Glow: 外层晕光
     * - Pulse: 沿束前进的高亮脉冲
     */
    public static createCodeBeam(
        parent: Node,
        start: Vec3,
        end: Vec3,
        opts: {
            width: number;
            duration: number;
            beamColor: Color;
            coreColor: Color;
            intensity: number;
        }
    ): void {
        const s = start.clone();
        const e = end.clone();
        e.y = s.y;

        const dx = e.x - s.x;
        const dz = e.z - s.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len < 0.001) return;

        const core = ProjectilePool.get('vfx_beam_core');
        const glow = ProjectilePool.get('vfx_beam_glow');
        const pulse = ProjectilePool.get('vfx_beam_pulse');
        if (!core || !glow || !pulse) {
            if (core) ProjectilePool.put('vfx_beam_core', core);
            if (glow) ProjectilePool.put('vfx_beam_glow', glow);
            if (pulse) ProjectilePool.put('vfx_beam_pulse', pulse);
            return;
        }

        parent.addChild(core);
        parent.addChild(glow);
        parent.addChild(pulse);

        const yawDeg = (Math.atan2(dx, dz) * 180) / Math.PI;
        const midX = (s.x + e.x) * 0.5;
        const midZ = (s.z + e.z) * 0.5;

        const intensityScale = Math.max(0.8, Math.min(2.2, opts.intensity / 2.2 + 0.9));
        const coreW = Math.max(0.04, opts.width * 0.34 * intensityScale);
        const glowW = Math.max(0.08, opts.width * 0.9 * intensityScale);
        const pulseLen = Math.max(0.18, len * 0.12);

        const coreMesh = this.getBoxMesh(1, 1, 1);
        const glowMesh = coreMesh;
        const pulseMesh = coreMesh;
        this.configureVfxNode(core, coreMesh, this.getUnlitMat(opts.coreColor));
        this.configureVfxNode(glow, glowMesh, this.getUnlitMat(opts.beamColor));
        this.configureVfxNode(
            pulse,
            pulseMesh,
            this.getUnlitMat(this.lerpColor(opts.coreColor, opts.beamColor, 0.35))
        );

        core.setPosition(midX, s.y, midZ);
        glow.setPosition(midX, s.y, midZ);
        pulse.setPosition(s.x, s.y, s.z);
        core.setRotationFromEuler(0, yawDeg, 0);
        glow.setRotationFromEuler(0, yawDeg, 0);
        pulse.setRotationFromEuler(0, yawDeg, 0);

        const coreH = 0.018;
        const glowH = 0.012;
        const pulseH = 0.022;
        core.setScale(coreW, coreH, len);
        glow.setScale(glowW, glowH, len * 1.02);
        pulse.setScale(coreW * 1.25, pulseH, pulseLen);

        const dirX = dx / len;
        const dirZ = dz / len;
        const rightX = -dirZ;
        const rightZ = dirX;
        const duration = Math.max(0.05, opts.duration);

        Tween.stopAllByTarget(core);
        Tween.stopAllByTarget(glow);
        Tween.stopAllByTarget(pulse);

        const state = { t: 0 };
        tween(state)
            .to(
                duration,
                { t: 1 },
                {
                    onUpdate: () => {
                        const t = state.t;
                        const flare = 1 + Math.sin(t * Math.PI * 6) * 0.1;
                        const taper = Math.max(0.08, 1 - t * 0.9);

                        core.setScale(coreW * flare * taper, coreH, len);
                        glow.setScale(glowW * (1 + 0.16 * flare) * taper, glowH, len * 1.02);

                        const travel = len * t;
                        const jitter = Math.sin(t * Math.PI * 20) * opts.width * 0.06;
                        pulse.setPosition(
                            s.x + dirX * travel + rightX * jitter,
                            s.y,
                            s.z + dirZ * travel + rightZ * jitter
                        );
                        pulse.setScale(
                            coreW * 1.28 * (1 + 0.25 * (1 - t)),
                            pulseH,
                            pulseLen * (1 - 0.35 * t)
                        );
                    },
                }
            )
            .call(() => {
                ProjectilePool.put('vfx_beam_core', core);
                ProjectilePool.put('vfx_beam_glow', glow);
                ProjectilePool.put('vfx_beam_pulse', pulse);
            })
            .start();
    }


    /** 破坏死光特效（仅 skill8 prefab 路径，无手写 fallback） */
    public static createDestructionRay(
        parent: Node,
        start: Vec3,
        end: Vec3,
        opts: {
            width: number;
            duration: number;
            beamColor: Color;
            coreColor: Color;
            intensity: number;
        }
    ): void {
        this._ensureDeathRayPrefab();
        if (this._playDeathRayPrefab(parent, start, end, opts)) return;
        if (!this._deathRayPrefab && !this._deathRayPrefabLoading) {
            console.warn('[WeaponVFX] skill8 prefab unavailable, destruction ray skipped.');
        }
    }

    // ========== 枪口闪光（池化） ==========

    public static createMuzzleFlash(parent: Node, pos: Vec3, color: Color, size: number): void {
        // 第一层：主火焰（随机旋转 + 非均匀拉伸 → 不规则火焰形状）
        const node = ProjectilePool.get('vfx_flash');
        if (!node) return;

        parent.addChild(node);
        node.setPosition(pos);
        this.configureVfxNode(
            node,
            this.getFlatQuadMesh(size * 2, size * 2),
            this.getGlowMat(color)
        );

        const angle1 = Math.random() * 360;
        const stretch = 1.3 + Math.random() * 0.5;
        node.setRotationFromEuler(0, angle1, 0);
        node.setScale(0.3 * stretch, 1, 0.25);
        tween(node)
            .to(0.04, { scale: new Vec3(1.6 * stretch, 1, 1.1) })
            .to(0.06, { scale: new Vec3(0, 1, 0) })
            .call(() => ProjectilePool.put('vfx_flash', node))
            .start();

        // 第二层：交叉火焰（与主火焰夹 40~80°）→ 打破正方形轮廓，形成不规则星形
        const node2 = ProjectilePool.get('vfx_flash');
        if (!node2) return;

        parent.addChild(node2);
        node2.setPosition(pos);
        const innerColor = new Color(
            Math.min(255, color.r + 40),
            Math.min(255, color.g + 20),
            color.b,
            Math.floor(color.a * 0.8)
        );
        this.configureVfxNode(
            node2,
            this.getFlatQuadMesh(size * 1.5, size * 1.5),
            this.getGlowMat(innerColor)
        );

        const angle2 = angle1 + 40 + Math.random() * 40;
        node2.setRotationFromEuler(0, angle2, 0);
        node2.setScale(0.2, 1, 0.35);
        tween(node2)
            .to(0.03, { scale: new Vec3(0.9, 1, 1.5) })
            .to(0.05, { scale: new Vec3(0, 1, 0) })
            .call(() => ProjectilePool.put('vfx_flash', node2))
            .start();
    }

    // ========== 冲击波环（池化） ==========

    public static createShockRing(
        parent: Node,
        center: Vec3,
        maxRadius: number,
        color: Color,
        duration: number,
        height: number = 0.08
    ): void {
        const node = ProjectilePool.get('vfx_ring');
        if (!node) return;

        parent.addChild(node);
        node.setPosition(center);
        this.configureVfxNode(node, this.getBoxMesh(1, height, 1), this.getGlowMat(color));

        node.setScale(0.2, 1, 0.2);
        const finalScale = maxRadius * 2;
        tween(node)
            .to(
                duration * 0.6,
                { scale: new Vec3(finalScale, 0.3, finalScale) },
                { easing: 'expoOut' }
            )
            .to(duration * 0.4, { scale: new Vec3(finalScale * 1.1, 0.05, finalScale * 1.1) })
            .call(() => ProjectilePool.put('vfx_ring', node))
            .start();
    }

    // ========== 爆炸碎片（池化，数量上限） ==========

    public static createDebris(
        parent: Node,
        center: Vec3,
        count: number,
        color: Color,
        speed: number,
        size: number
    ): void {
        // 硬上限：最多 8 个碎片节点（性能红线）
        const actualCount = Math.min(count, 8);
        for (let i = 0; i < actualCount; i++) {
            const node = ProjectilePool.get('vfx_debris');
            if (!node) continue;

            parent.addChild(node);
            node.setPosition(center);
            const s = size * (0.5 + Math.random() * 0.5);
            this.configureVfxNode(node, this.getBoxMesh(s, s, s), this.getUnlitMat(color));

            const angle = Math.random() * Math.PI * 2;
            const upSpeed = 2 + Math.random() * 3;
            const dx = Math.cos(angle) * speed * (0.5 + Math.random() * 0.5);
            const dz = Math.sin(angle) * speed * (0.5 + Math.random() * 0.5);

            const endPos = new Vec3(
                center.x + dx * 0.4,
                center.y + upSpeed * 0.15,
                center.z + dz * 0.4
            );
            const fallPos = new Vec3(endPos.x, center.y - 0.2, endPos.z);

            node.setScale(1, 1, 1);
            tween(node)
                .to(
                    0.15,
                    { position: endPos, scale: new Vec3(1.2, 1.2, 1.2) },
                    { easing: 'quartOut' }
                )
                .to(
                    0.25,
                    { position: fallPos, scale: new Vec3(0.1, 0.1, 0.1) },
                    { easing: 'quartIn' }
                )
                .call(() => ProjectilePool.put('vfx_debris', node))
                .start();
        }
    }

    // ========== 地面灼烧（池化） ==========

    public static createGroundBurn(
        parent: Node,
        center: Vec3,
        radius: number,
        color: Color,
        duration: number
    ): void {
        const node = ProjectilePool.get('vfx_ground');
        if (!node) return;

        parent.addChild(node);
        node.setPosition(center.x, center.y + 0.02, center.z);
        this.configureVfxNode(node, this.getBoxMesh(1, 0.02, 1), this.getGlowMat(color));

        const d = radius * 2;
        node.setScale(0.1, 1, 0.1);
        tween(node)
            .to(0.15, { scale: new Vec3(d, 1, d) }, { easing: 'backOut' })
            .delay(duration * 0.7)
            .to(duration * 0.3, { scale: new Vec3(0, 1, 0) })
            .call(() => ProjectilePool.put('vfx_ground', node))
            .start();
    }

    // ========== 色彩工具 ==========

    public static lerpColor(a: Color, b: Color, t: number): Color {
        t = Math.max(0, Math.min(1, t));
        return new Color(
            Math.round(a.r + (b.r - a.r) * t),
            Math.round(a.g + (b.g - a.g) * t),
            Math.round(a.b + (b.b - a.b) * t),
            Math.round(a.a + (b.a - a.a) * t)
        );
    }

    public static levelT(level: number, maxLevel: number = 5): number {
        return Math.max(0, Math.min(1, (level - 1) / (maxLevel - 1)));
    }

    /** 清理所有缓存 */
    public static cleanup(): void {
        this._matCache.clear();
        this._meshCache.clear();
        ProjectilePool.clearAll();
        this._bulletTex = null;
        this._bulletTexLoading = false;
        this._deathRayPrefab = null;
        this._deathRayPrefabLoading = false;
        for (const node of this._deathRayPrefabPool) {
            if (node && node.isValid) node.destroy();
        }
        this._deathRayPrefabPool.length = 0;
        this._flamePrefab = null;
        this._flamePrefabLoading = false;
        for (const node of this._flamePrefabPool) {
            if (node && node.isValid) node.destroy();
        }
        this._flamePrefabPool.length = 0;
        this._initialized = false;
    }
}
