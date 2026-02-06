import { Node, Vec3, Color, MeshRenderer, primitives, utils, Material, tween, Mesh } from 'cc';
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
    private static _initialized: boolean = false;

    /** 初始化共享资源 + 预热池（在 GameController.onLoad 调用一次） */
    public static initialize(): void {
        if (this._initialized) return;
        this._initialized = true;

        // 预热 VFX 节点池
        ProjectilePool.register('vfx_flash', () => this._createVfxNode('Flash'), 5);
        ProjectilePool.register('vfx_ring', () => this._createVfxNode('Ring'), 4);
        ProjectilePool.register('vfx_debris', () => this._createVfxNode('Debris'), 15);
        ProjectilePool.register('vfx_ground', () => this._createVfxNode('Ground'), 3);
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

    /** 获取/创建发光(Additive)材质（缓存，开启 Instancing） */
    public static getGlowMat(color: Color): Material {
        const key = `glow_${color.toHEX()}`;
        let mat = this._matCache.get(key);
        if (mat) return mat;

        mat = new Material();
        mat.initialize({
            effectName: 'builtin-unlit',
            technique: 1,
            defines: { USE_INSTANCING: true },
        });
        mat.setProperty('mainColor', color);
        try {
            if (mat.passes && mat.passes.length > 0) {
                const pass = mat.passes[0];
                const target = pass.blendState.targets[0];
                target.blend = true;
                target.blendSrc = 2; // SRC_ALPHA
                target.blendDst = 1; // ONE
                target.blendSrcAlpha = 2;
                target.blendDstAlpha = 1;
            }
        } catch (_e) {
            /* fallback */
        }
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
        renderer.material = mat;
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
        renderer.material = this.getUnlitMat(color);
        return node;
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
            renderer.material = mat;
        }
    }

    // ========== 枪口闪光（池化） ==========

    public static createMuzzleFlash(parent: Node, pos: Vec3, color: Color, size: number): void {
        const node = ProjectilePool.get('vfx_flash');
        if (!node) return;

        parent.addChild(node);
        node.setPosition(pos);
        this.configureVfxNode(node, this.getBoxMesh(size, size, size), this.getGlowMat(color));

        node.setScale(0.5, 0.5, 0.5);
        tween(node)
            .to(0.04, { scale: new Vec3(1.5, 1.5, 1.5) })
            .to(0.06, { scale: new Vec3(0, 0, 0) })
            .call(() => ProjectilePool.put('vfx_flash', node))
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
        this._initialized = false;
    }
}
