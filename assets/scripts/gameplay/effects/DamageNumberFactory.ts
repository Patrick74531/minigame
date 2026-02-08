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

export type DamageNumberStyle = 'default' | 'enemyHit';

/**
 * 浮动伤害数字工厂
 * 在受击单位头顶生成上飘渐隐的伤害数字
 * - 普通伤害：白色，中等大小
 * - 暴击伤害：红橙色，更大，带弹跳缩放动画
 */
export class DamageNumberFactory {
    // 复用的常量颜色
    private static readonly COLOR_NORMAL = new Color(255, 255, 255, 255);
    private static readonly COLOR_ENEMY_HIT = new Color(255, 70, 70, 255);
    private static readonly COLOR_CRIT = new Color(255, 60, 30, 255);
    private static readonly COLOR_CRIT_OUTLINE = new Color(255, 200, 0, 255);

    // 每个单位的伤害数字节流（避免高射速武器刷屏）
    private static readonly THROTTLE_INTERVAL = 0.15; // 秒
    private static _lastShowTime: WeakMap<Node, number> = new WeakMap();
    private static _accumDamage: WeakMap<Node, number> = new WeakMap();
    private static _accumCrit: WeakMap<Node, boolean> = new WeakMap();
    private static _accumEnemyHit: WeakMap<Node, boolean> = new WeakMap();
    private static _globalTime: number = 0;

    // 节点池：避免频繁 new Node + addComponent
    private static readonly _pool: Node[] = [];
    private static readonly MAX_POOL_SIZE = 30;
    private static readonly MAX_CONCURRENT = 20;
    private static _activeCount: number = 0;

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
        sourceNode?: Node,
        style: DamageNumberStyle = 'default'
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
                if (style === 'enemyHit') this._accumEnemyHit.set(sourceNode, true);
                return;
            }
            // 取出累计伤害
            const accum = this._accumDamage.get(sourceNode) ?? 0;
            const accumCrit = this._accumCrit.get(sourceNode) ?? false;
            const accumEnemyHit = this._accumEnemyHit.get(sourceNode) ?? false;
            damage += accum;
            isCrit = isCrit || accumCrit;
            if (accumEnemyHit) {
                style = 'enemyHit';
            }
            this._accumDamage.set(sourceNode, 0);
            this._accumCrit.set(sourceNode, false);
            this._accumEnemyHit.set(sourceNode, false);
            this._lastShowTime.set(sourceNode, now);
        }

        // 伤害取整
        damage = Math.round(damage);

        // 限制同屏伤害数字总数
        if (DamageNumberFactory._activeCount >= DamageNumberFactory.MAX_CONCURRENT) return;

        // 从池中取节点或创建新节点
        let root = DamageNumberFactory._pool.pop() ?? null;
        if (root && root.isValid) {
            root.active = true;
            root.removeAllChildren();
            parent.addChild(root);
        } else {
            root = new Node('DmgNum');
            parent.addChild(root);
            root.addComponent(RenderRoot2D);
            root.addComponent(Billboard);
        }
        DamageNumberFactory._activeCount++;

        // 随机水平偏移，避免数字重叠
        const offsetX = (Math.random() - 0.5) * 0.6;
        const offsetZ = (Math.random() - 0.5) * 0.3;
        const startY = worldPos.y + 1.8;
        root.setWorldPosition(worldPos.x + offsetX, startY, worldPos.z + offsetZ);

        const isEnemyHitStyle = !isCrit && style === 'enemyHit';
        const baseScale = isCrit ? 0.016 : isEnemyHitStyle ? 0.009 : 0.011;
        root.setScale(baseScale, baseScale, baseScale);

        // 标签节点
        const labelNode = new Node('Label');
        root.addChild(labelNode);

        const label = labelNode.addComponent(Label);
        label.string = isCrit ? `${damage}!` : `${damage}`;
        label.fontSize = isCrit ? 40 : isEnemyHitStyle ? 26 : 30;
        label.lineHeight = isCrit ? 44 : isEnemyHitStyle ? 30 : 34;
        label.isBold = true;
        label.overflow = Label.Overflow.NONE;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.color = isCrit
            ? DamageNumberFactory.COLOR_CRIT
            : isEnemyHitStyle
              ? DamageNumberFactory.COLOR_ENEMY_HIT
              : DamageNumberFactory.COLOR_NORMAL;

        // 所有伤害数字加描边，提高可读性
        const outline = labelNode.addComponent(LabelOutline);
        if (isCrit) {
            outline.color = DamageNumberFactory.COLOR_CRIT_OUTLINE;
            outline.width = 3;
        } else {
            outline.color = new Color(0, 0, 0, 180);
            outline.width = 2;
        }

        // 透明度控制
        const opacity = labelNode.addComponent(UIOpacity);
        opacity.opacity = 255;

        // ====== 动画 ======
        const floatHeight = isCrit ? 1.2 : isEnemyHitStyle ? 0.6 : 0.8;
        const duration = isCrit ? 0.8 : isEnemyHitStyle ? 0.45 : 0.55;
        const endY = startY + floatHeight;

        const recycleRoot = root;
        const recycleFn = () => {
            DamageNumberFactory._activeCount = Math.max(0, DamageNumberFactory._activeCount - 1);
            if (recycleRoot.isValid) {
                recycleRoot.removeFromParent();
                recycleRoot.active = false;
                if (DamageNumberFactory._pool.length < DamageNumberFactory.MAX_POOL_SIZE) {
                    DamageNumberFactory._pool.push(recycleRoot);
                } else {
                    recycleRoot.destroy();
                }
            }
        };

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
                .call(recycleFn)
                .start();
        } else {
            // 普通：直接上飘
            tween(root)
                .to(duration, {
                    position: new Vec3(worldPos.x + offsetX, endY, worldPos.z + offsetZ),
                })
                .call(recycleFn)
                .start();
        }

        // 渐隐
        tween(opacity)
            .delay(duration * 0.5)
            .to(duration * 0.5, { opacity: 0 })
            .start();
    }
}
