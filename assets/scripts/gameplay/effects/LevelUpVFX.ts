import {
    Node,
    Vec3,
    Color,
    MeshRenderer,
    Material,
    primitives,
    utils,
    tween,
    Billboard,
    RenderRoot2D,
    Label,
    UIOpacity,
    LabelOutline,
} from 'cc';

/**
 * 升级特效
 * 在英雄头顶播放光环扩散 + "LEVEL UP!" 文字弹跳动画
 */
export class LevelUpVFX {
    /**
     * 在指定节点位置播放升级特效
     * @param parent 父节点（场景容器）
     * @param heroNode 英雄节点（用于获取位置）
     * @param level 新等级
     */
    public static play(parent: Node, heroNode: Node, level: number): void {
        const pos = heroNode.worldPosition;
        this.createRing(parent, pos);
        this.createText(parent, pos, level);
        this.createBurstParticles(parent, pos);
    }

    /** 扩散光环 */
    private static createRing(parent: Node, pos: Vec3): void {
        const ring = new Node('LvUpRing');
        parent.addChild(ring);
        ring.setWorldPosition(pos.x, pos.y + 0.1, pos.z);

        const renderer = ring.addComponent(MeshRenderer);
        renderer.mesh = utils.MeshUtils.createMesh(
            primitives.plane({ width: 1, length: 1, widthSegments: 1, lengthSegments: 1 })
        );

        const mat = new Material();
        mat.initialize({ effectName: 'builtin-unlit', technique: 1 });
        mat.setProperty('mainColor', new Color(80, 200, 255, 200));
        if (mat.passes && mat.passes.length > 0) {
            const target = mat.passes[0].blendState.targets[0];
            target.blend = true;
            target.blendSrc = 2;
            target.blendDst = 1;
        }
        renderer.material = mat;

        ring.setScale(0.3, 1, 0.3);
        tween(ring)
            .to(0.4, { scale: new Vec3(5, 1, 5) }, { easing: 'quartOut' })
            .to(0.3, { scale: new Vec3(6, 1, 6) })
            .call(() => ring.destroy())
            .start();
    }

    /** "LEVEL UP!" 文字 */
    private static createText(parent: Node, pos: Vec3, level: number): void {
        const root = new Node('LvUpText');
        parent.addChild(root);
        root.setWorldPosition(pos.x, pos.y + 2.5, pos.z);

        root.addComponent(RenderRoot2D);
        root.addComponent(Billboard);

        const baseScale = 0.04;
        root.setScale(0.01, 0.01, 0.01);

        const labelNode = new Node('Label');
        root.addChild(labelNode);

        const label = labelNode.addComponent(Label);
        label.string = `LEVEL UP!\nLv.${level}`;
        label.fontSize = 42;
        label.lineHeight = 48;
        label.isBold = true;
        label.overflow = Label.Overflow.NONE;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.color = new Color(255, 230, 80, 255);

        const outline = labelNode.addComponent(LabelOutline);
        outline.color = new Color(200, 80, 0, 255);
        outline.width = 3;

        const opacity = labelNode.addComponent(UIOpacity);
        opacity.opacity = 255;

        // 弹跳放大 + 上飘
        const peakScale = baseScale * 1.4;
        tween(root)
            .to(0.12, { scale: new Vec3(peakScale, peakScale, peakScale) })
            .to(0.1, { scale: new Vec3(baseScale, baseScale, baseScale) })
            .to(0.08, { scale: new Vec3(peakScale * 0.95, peakScale * 0.95, peakScale * 0.95) })
            .to(0.1, { scale: new Vec3(baseScale, baseScale, baseScale) })
            .delay(0.4)
            .to(0.5, { position: new Vec3(pos.x, pos.y + 4.5, pos.z) })
            .call(() => root.destroy())
            .start();

        tween(opacity)
            .delay(0.9)
            .to(0.4, { opacity: 0 })
            .start();
    }

    /** 光粒子爆发 */
    private static createBurstParticles(parent: Node, pos: Vec3): void {
        const count = 8;
        for (let i = 0; i < count; i++) {
            const p = new Node('LvUpParticle');
            parent.addChild(p);
            p.setWorldPosition(pos.x, pos.y + 1.0, pos.z);

            const renderer = p.addComponent(MeshRenderer);
            const size = 0.06 + Math.random() * 0.04;
            renderer.mesh = utils.MeshUtils.createMesh(
                primitives.box({ width: size, height: size, length: size })
            );

            const mat = new Material();
            mat.initialize({ effectName: 'builtin-unlit' });
            const hue = Math.random();
            const r = hue < 0.5 ? 255 : 80 + Math.floor(Math.random() * 175);
            const g = 180 + Math.floor(Math.random() * 75);
            const b = hue > 0.5 ? 255 : 80 + Math.floor(Math.random() * 175);
            mat.setProperty('mainColor', new Color(r, g, b, 255));
            renderer.material = mat;

            const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
            const speed = 1.5 + Math.random() * 2.0;
            const endPos = new Vec3(
                pos.x + Math.cos(angle) * speed,
                pos.y + 1.5 + Math.random() * 1.5,
                pos.z + Math.sin(angle) * speed
            );

            p.setScale(1, 1, 1);
            tween(p)
                .to(0.3, { position: endPos, scale: new Vec3(0.5, 0.5, 0.5) }, { easing: 'quartOut' })
                .to(0.2, { scale: new Vec3(0, 0, 0) })
                .call(() => p.destroy())
                .start();
        }
    }
}
