import { Node, Vec3, Color, MeshRenderer, primitives, utils, Material, tween, Quat } from 'cc';

/**
 * WeaponVFX — 武器特效工具集
 * 提供通用的视觉效果组件，供各武器行为复用。
 * 所有方法均为静态，不持有状态。
 */
export class WeaponVFX {

    // ========== 材质工厂 ==========

    /** 创建 unlit 材质（不受光照影响，颜色鲜艳） */
    public static createUnlitMat(color: Color): Material {
        const mat = new Material();
        mat.initialize({ effectName: 'builtin-unlit' });
        mat.setProperty('mainColor', color);
        return mat;
    }

    /** 创建带 additive 混合的发光材质 */
    public static createGlowMat(color: Color): Material {
        const mat = new Material();
        mat.initialize({
            effectName: 'builtin-unlit',
            technique: 1,
            defines: {},
        });
        mat.setProperty('mainColor', color);
        // 尝试设置 Additive 混合
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
        } catch (_e) { /* fallback to normal */ }
        return mat;
    }

    // ========== 网格工厂 ==========

    /** 创建 box mesh 并附加到节点 */
    public static addBoxMesh(node: Node, w: number, h: number, l: number, mat: Material): MeshRenderer {
        const renderer = node.addComponent(MeshRenderer);
        renderer.mesh = utils.MeshUtils.createMesh(
            primitives.box({ width: w, height: h, length: l })
        );
        renderer.material = mat;
        return renderer;
    }

    // ========== 枪口闪光 ==========

    /** 在指定位置创建一个快速闪烁的光球 */
    public static createMuzzleFlash(parent: Node, pos: Vec3, color: Color, size: number): void {
        const node = new Node('MuzzleFlash');
        node.layer = 1 << 0;
        parent.addChild(node);
        node.setPosition(pos);

        this.addBoxMesh(node, size, size, size, this.createGlowMat(color));

        node.setScale(0.5, 0.5, 0.5);
        tween(node)
            .to(0.04, { scale: new Vec3(1.5, 1.5, 1.5) })
            .to(0.06, { scale: new Vec3(0, 0, 0) })
            .call(() => node.destroy())
            .start();
    }

    // ========== 冲击波环 ==========

    /** 创建快速扩散的扁平环 */
    public static createShockRing(
        parent: Node, center: Vec3,
        maxRadius: number, color: Color,
        duration: number, height: number = 0.08
    ): void {
        const node = new Node('ShockRing');
        node.layer = 1 << 0;
        parent.addChild(node);
        node.setPosition(center);

        this.addBoxMesh(node, 1, height, 1, this.createGlowMat(color));

        node.setScale(0.2, 1, 0.2);
        const finalScale = maxRadius * 2;
        tween(node)
            .to(duration * 0.6, { scale: new Vec3(finalScale, 0.3, finalScale) }, { easing: 'expoOut' })
            .to(duration * 0.4, { scale: new Vec3(finalScale * 1.1, 0.05, finalScale * 1.1) })
            .call(() => node.destroy())
            .start();
    }

    // ========== 爆炸碎片 ==========

    /** 创建向外飞散的小碎片 */
    public static createDebris(
        parent: Node, center: Vec3,
        count: number, color: Color,
        speed: number, size: number
    ): void {
        for (let i = 0; i < count; i++) {
            const node = new Node('Debris');
            node.layer = 1 << 0;
            parent.addChild(node);
            node.setPosition(center);

            const s = size * (0.5 + Math.random() * 0.5);
            this.addBoxMesh(node, s, s, s, this.createUnlitMat(color));

            // 随机方向
            const angle = Math.random() * Math.PI * 2;
            const upSpeed = 2 + Math.random() * 3;
            const dx = Math.cos(angle) * speed * (0.5 + Math.random() * 0.5);
            const dz = Math.sin(angle) * speed * (0.5 + Math.random() * 0.5);

            const endPos = new Vec3(
                center.x + dx * 0.4,
                center.y + upSpeed * 0.15,
                center.z + dz * 0.4,
            );
            const fallPos = new Vec3(endPos.x, center.y - 0.2, endPos.z);

            tween(node)
                .to(0.15, { position: endPos, scale: new Vec3(1.2, 1.2, 1.2) }, { easing: 'quartOut' })
                .to(0.25, { position: fallPos, scale: new Vec3(0.1, 0.1, 0.1) }, { easing: 'quartIn' })
                .call(() => node.destroy())
                .start();
        }
    }

    // ========== 地面灼烧圆 ==========

    /** 创建地面上的持续灼烧圆圈 */
    public static createGroundBurn(
        parent: Node, center: Vec3,
        radius: number, color: Color,
        duration: number
    ): void {
        const node = new Node('GroundBurn');
        node.layer = 1 << 0;
        parent.addChild(node);
        node.setPosition(center.x, center.y + 0.02, center.z);

        this.addBoxMesh(node, 1, 0.02, 1, this.createGlowMat(color));

        const d = radius * 2;
        node.setScale(0.1, 1, 0.1);
        tween(node)
            .to(0.15, { scale: new Vec3(d, 1, d) }, { easing: 'backOut' })
            .delay(duration * 0.7)
            .to(duration * 0.3, { scale: new Vec3(0, 1, 0) })
            .call(() => node.destroy())
            .start();
    }

    // ========== 脉冲缩放 ==========

    /** 给节点添加持续的脉冲缩放效果 */
    public static addPulse(node: Node, minScale: number, maxScale: number, period: number): void {
        const half = period / 2;
        tween(node)
            .repeatForever(
                tween(node)
                    .to(half, { scale: new Vec3(maxScale, maxScale, maxScale) }, { easing: 'sineInOut' })
                    .to(half, { scale: new Vec3(minScale, minScale, minScale) }, { easing: 'sineInOut' })
            )
            .start();
    }

    // ========== 色彩工具 ==========

    /** 根据等级在两种颜色之间插值 */
    public static lerpColor(a: Color, b: Color, t: number): Color {
        t = Math.max(0, Math.min(1, t));
        return new Color(
            Math.round(a.r + (b.r - a.r) * t),
            Math.round(a.g + (b.g - a.g) * t),
            Math.round(a.b + (b.b - a.b) * t),
            Math.round(a.a + (b.a - a.a) * t),
        );
    }

    /** 等级 → 0~1 归一化 (1→0, 5→1) */
    public static levelT(level: number, maxLevel: number = 5): number {
        return Math.max(0, Math.min(1, (level - 1) / (maxLevel - 1)));
    }
}
