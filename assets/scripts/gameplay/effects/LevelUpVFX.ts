import {
    Node,
    Vec3,
    Color,
    tween,
    Label,
    UIOpacity,
    LabelOutline,
    UITransform,
    Graphics,
} from 'cc';

const UI_LAYER = 33554432; // Cocos UI_2D layer

/**
 * 升级特效 — 纯屏幕空间 UI 动画
 * 不使用任何 3D mesh，全部在 UI Canvas 上绘制
 * - 全屏金色闪光
 * - "LEVEL UP!" 文字弹跳动画
 * - 向四周扩散的光线条
 */
export class LevelUpVFX {
    /**
     * 在 UI Canvas 上播放升级特效
     * @param uiCanvas UI 画布节点
     * @param level 新等级
     */
    public static play(uiCanvas: Node, _heroNode: Node, level: number): void {
        this.createFlash(uiCanvas);
        this.createText(uiCanvas, level);
        this.createBurstLines(uiCanvas);
    }

    /** 全屏金色闪光 */
    private static createFlash(uiCanvas: Node): void {
        const node = new Node('LvUpFlash');
        node.layer = UI_LAYER;
        uiCanvas.addChild(node);

        const transform = node.addComponent(UITransform);
        transform.setContentSize(1400, 900);

        const gfx = node.addComponent(Graphics);
        gfx.fillColor = new Color(255, 220, 80, 100);
        gfx.rect(-700, -450, 1400, 900);
        gfx.fill();

        const opacity = node.addComponent(UIOpacity);
        opacity.opacity = 0;

        tween(opacity)
            .to(0.08, { opacity: 180 })
            .to(0.25, { opacity: 0 })
            .call(() => node.destroy())
            .start();
    }

    /** "LEVEL UP!" 居中文字弹跳 */
    private static createText(uiCanvas: Node, level: number): void {
        const root = new Node('LvUpText');
        root.layer = UI_LAYER;
        uiCanvas.addChild(root);
        root.setPosition(0, 60, 0);

        const transform = root.addComponent(UITransform);
        transform.setContentSize(400, 120);

        const label = root.addComponent(Label);
        label.string = `LEVEL UP!  Lv.${level}`;
        label.fontSize = 48;
        label.lineHeight = 56;
        label.isBold = true;
        label.overflow = Label.Overflow.NONE;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.color = new Color(255, 230, 50, 255);

        const outline = root.addComponent(LabelOutline);
        outline.color = new Color(180, 60, 0, 255);
        outline.width = 3;

        const opacity = root.addComponent(UIOpacity);
        opacity.opacity = 0;

        // 从小弹大 + 持续 + 上移淡出
        root.setScale(0.3, 0.3, 1);
        tween(opacity).to(0.05, { opacity: 255 }).start();

        tween(root)
            .to(0.15, { scale: new Vec3(1.3, 1.3, 1) }, { easing: 'backOut' })
            .to(0.1, { scale: new Vec3(1.0, 1.0, 1) })
            .to(0.08, { scale: new Vec3(1.15, 1.15, 1) })
            .to(0.1, { scale: new Vec3(1.0, 1.0, 1) })
            .delay(0.5)
            .to(0.5, { position: new Vec3(0, 140, 0) })
            .call(() => root.destroy())
            .start();

        tween(opacity).delay(0.8).to(0.5, { opacity: 0 }).start();
    }

    /** 向四周扩散的光线条 */
    private static createBurstLines(uiCanvas: Node): void {
        const lineCount = 12;
        for (let i = 0; i < lineCount; i++) {
            const node = new Node('LvUpLine');
            node.layer = UI_LAYER;
            uiCanvas.addChild(node);

            const transform = node.addComponent(UITransform);
            transform.setContentSize(6, 40);

            const gfx = node.addComponent(Graphics);
            const hue = i / lineCount;
            const r = hue < 0.5 ? 255 : Math.floor(200 + Math.random() * 55);
            const g = Math.floor(180 + Math.random() * 75);
            const b = hue > 0.5 ? 255 : Math.floor(50 + Math.random() * 100);
            gfx.fillColor = new Color(r, g, b, 220);
            gfx.rect(-3, -20, 6, 40);
            gfx.fill();

            const angle = (Math.PI * 2 * i) / lineCount + (Math.random() - 0.5) * 0.3;
            // 从中心偏移一点开始
            const startDist = 30;
            const endDist = 200 + Math.random() * 150;
            const sx = Math.cos(angle) * startDist;
            const sy = Math.sin(angle) * startDist + 60; // 偏移到文字中心
            const ex = Math.cos(angle) * endDist;
            const ey = Math.sin(angle) * endDist + 60;

            node.setPosition(sx, sy, 0);
            // 旋转对齐方向
            const deg = (angle * 180) / Math.PI + 90;
            node.setRotationFromEuler(0, 0, -deg);

            const opacity = node.addComponent(UIOpacity);
            opacity.opacity = 255;

            tween(node)
                .to(0.3, { position: new Vec3(ex, ey, 0) }, { easing: 'quartOut' })
                .start();

            tween(opacity)
                .delay(0.1)
                .to(0.25, { opacity: 0 })
                .call(() => node.destroy())
                .start();
        }
    }
}
