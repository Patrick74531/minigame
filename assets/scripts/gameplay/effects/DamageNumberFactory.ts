import {
    Node,
    Vec3,
    Label,
    Color,
    Billboard,
    RenderRoot2D,
    UIOpacity,
    tween,
    LabelOutline,
} from 'cc';

/**
 * 浮动伤害数字工厂
 * 在受击单位头顶生成上飘渐隐的伤害数字
 * - 普通伤害：白色，中等大小
 * - 暴击伤害：红橙色，更大，带弹跳缩放动画
 */
export class DamageNumberFactory {
    // 复用的常量颜色
    private static readonly COLOR_NORMAL = new Color(255, 255, 255, 255);
    private static readonly COLOR_CRIT = new Color(255, 60, 30, 255);
    private static readonly COLOR_CRIT_OUTLINE = new Color(255, 200, 0, 255);

    // 每个单位的伤害数字节流（避免高射速武器刷屏）
    private static readonly THROTTLE_INTERVAL = 0.15; // 秒
    private static _lastShowTime: WeakMap<Node, number> = new WeakMap();
    private static _accumDamage: WeakMap<Node, number> = new WeakMap();
    private static _accumCrit: WeakMap<Node, boolean> = new WeakMap();
    private static _globalTime: number = 0;

    /** 每帧调用以更新全局时间（可选，回退为 Date.now） */
    public static tick(dt: number): void {
        this._globalTime += dt;
    }

    /**
     * 在指定世界坐标生成浮动伤害数字
     * @param parent 父节点（通常是场景根节点）
     * @param worldPos 受击位置（世界坐标）
     * @param damage 伤害值
     * @param isCrit 是否暴击
     */
    public static show(
        parent: Node,
        worldPos: Vec3,
        damage: number,
        isCrit: boolean = false,
        sourceNode?: Node
    ): void {
        // 节流：同一单位短时间内累计伤害，只显示一次
        if (sourceNode) {
            const now = this._globalTime || Date.now() * 0.001;
            const lastTime = this._lastShowTime.get(sourceNode) ?? 0;
            if (now - lastTime < DamageNumberFactory.THROTTLE_INTERVAL) {
                // 累计伤害
                const prev = this._accumDamage.get(sourceNode) ?? 0;
                this._accumDamage.set(sourceNode, prev + damage);
                if (isCrit) this._accumCrit.set(sourceNode, true);
                return;
            }
            // 取出累计伤害
            const accum = this._accumDamage.get(sourceNode) ?? 0;
            const accumCrit = this._accumCrit.get(sourceNode) ?? false;
            damage += accum;
            isCrit = isCrit || accumCrit;
            this._accumDamage.set(sourceNode, 0);
            this._accumCrit.set(sourceNode, false);
            this._lastShowTime.set(sourceNode, now);
        }

        // 根节点
        const root = new Node('DmgNum');
        parent.addChild(root);

        // 随机水平偏移，避免数字重叠
        const offsetX = (Math.random() - 0.5) * 0.6;
        const offsetZ = (Math.random() - 0.5) * 0.3;
        const startY = worldPos.y + 1.8;
        root.setWorldPosition(worldPos.x + offsetX, startY, worldPos.z + offsetZ);

        // Billboard 让数字始终面朝相机
        root.addComponent(RenderRoot2D);
        root.addComponent(Billboard);

        const baseScale = isCrit ? 0.032 : 0.022;
        root.setScale(baseScale, baseScale, baseScale);

        // 标签节点
        const labelNode = new Node('Label');
        root.addChild(labelNode);

        const label = labelNode.addComponent(Label);
        label.string = isCrit ? `${damage}!` : `${damage}`;
        label.fontSize = isCrit ? 52 : 36;
        label.lineHeight = isCrit ? 56 : 40;
        label.isBold = true;
        label.overflow = Label.Overflow.NONE;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.color = isCrit ? DamageNumberFactory.COLOR_CRIT : DamageNumberFactory.COLOR_NORMAL;

        if (isCrit) {
            const outline = labelNode.addComponent(LabelOutline);
            outline.color = DamageNumberFactory.COLOR_CRIT_OUTLINE;
            outline.width = 3;
        }

        // 透明度控制
        const opacity = labelNode.addComponent(UIOpacity);
        opacity.opacity = 255;

        // ====== 动画 ======
        const floatHeight = isCrit ? 2.0 : 1.4;
        const duration = isCrit ? 1.0 : 0.7;
        const endY = startY + floatHeight;

        if (isCrit) {
            // 暴击：先放大弹跳再上飘
            const peakScale = baseScale * 1.6;
            root.setScale(0.01, 0.01, 0.01);
            tween(root)
                .to(0.08, { scale: new Vec3(peakScale, peakScale, peakScale) })
                .to(0.1, { scale: new Vec3(baseScale, baseScale, baseScale) })
                .to(duration - 0.18, {
                    position: new Vec3(worldPos.x + offsetX, endY, worldPos.z + offsetZ),
                })
                .call(() => root.destroy())
                .start();
        } else {
            // 普通：直接上飘
            tween(root)
                .to(duration, {
                    position: new Vec3(worldPos.x + offsetX, endY, worldPos.z + offsetZ),
                })
                .call(() => root.destroy())
                .start();
        }

        // 渐隐
        tween(opacity)
            .delay(duration * 0.5)
            .to(duration * 0.5, { opacity: 0 })
            .start();
    }
}
