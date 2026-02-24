import {
    _decorator,
    Component,
    Node,
    Vec3,
    Quat,
    Label,
    Color,
    Camera,
    RenderRoot2D,
    director,
    UIOpacity,
    tween,
    LabelOutline,
    LabelShadow,
} from 'cc';

export type DamageNumberStyle = 'default' | 'enemyHit' | 'heal';

const { ccclass } = _decorator;

@ccclass('DamageNumberFacing')
class DamageNumberFacing extends Component {
    private _cameraNode: Node | null = null;
    private static readonly _lookAtPos = new Vec3();
    private static readonly _flipY180 = (() => {
        const q = new Quat();
        Quat.fromEuler(q, 0, 180, 0);
        return q;
    })();

    protected lateUpdate(): void {
        const cameraNode = this.resolveCameraNode();
        if (!cameraNode || !cameraNode.isValid || !this.node.isValid) return;

        cameraNode.getWorldPosition(DamageNumberFacing._lookAtPos);
        this.node.lookAt(DamageNumberFacing._lookAtPos);
        // Label front-face is opposite to Node.forward in this setup, flip once to avoid mirrored text.
        this.node.rotate(DamageNumberFacing._flipY180);
    }

    private resolveCameraNode(): Node | null {
        if (this._cameraNode && this._cameraNode.isValid && this._cameraNode.activeInHierarchy) {
            return this._cameraNode;
        }

        const scene = director.getScene();
        if (!scene) return null;
        const cameras = scene.getComponentsInChildren(Camera);
        if (cameras.length <= 0) return null;

        const activeCamera = cameras.find(cam => cam.enabledInHierarchy && cam.node.activeInHierarchy);
        this._cameraNode = (activeCamera ?? cameras[0]).node;
        return this._cameraNode;
    }
}

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
    private static readonly COLOR_HEAL = new Color(80, 255, 120, 255);
    private static readonly COLOR_CRIT = new Color(255, 245, 60, 255);
    private static readonly COLOR_CRIT_OUTLINE = new Color(255, 50, 10, 255);
    private static readonly COLOR_CRIT_SHADOW = new Color(180, 0, 0, 200);
    private static readonly FONT_FAMILY = 'Arial Black';

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
            root.addComponent(DamageNumberFacing);
        }
        if (!root.getComponent(DamageNumberFacing)) {
            root.addComponent(DamageNumberFacing);
        }
        DamageNumberFactory._activeCount++;

        const isEnemyHitStyle = !isCrit && style === 'enemyHit';
        const isHealStyle = !isCrit && style === 'heal';
        // 暴击和普通数字使用不同偏移幅度，减少多人群战时的重叠
        const offsetX = (Math.random() - 0.5) * (isCrit ? 1.0 : 0.8);
        const offsetZ = (Math.random() - 0.5) * (isCrit ? 0.5 : 0.35);
        const startY = worldPos.y + 1.72 + Math.random() * 0.14;
        root.setWorldPosition(worldPos.x + offsetX, startY, worldPos.z + offsetZ);

        const baseScale = isCrit ? 0.016 : isEnemyHitStyle ? 0.009 : isHealStyle ? 0.01 : 0.01;
        root.setScale(baseScale, baseScale, baseScale);

        // 文本根节点
        const textRoot = new Node('TextRoot');
        root.addChild(textRoot);

        const text = isCrit ? `${damage}` : isHealStyle ? `+${damage}` : `${damage}`;
        const fontSize = isCrit ? 42 : isEnemyHitStyle ? 26 : isHealStyle ? 28 : 30;
        const lineHeight = isCrit ? 46 : isEnemyHitStyle ? 30 : isHealStyle ? 32 : 34;
        const color = isCrit
            ? DamageNumberFactory.COLOR_CRIT
            : isEnemyHitStyle
              ? DamageNumberFactory.COLOR_ENEMY_HIT
              : isHealStyle
                ? DamageNumberFactory.COLOR_HEAL
                : DamageNumberFactory.COLOR_NORMAL;

        const labelNode = new Node('Label');
        textRoot.addChild(labelNode);
        this.configureLabelNode(labelNode, text, fontSize, lineHeight, color, isCrit, isHealStyle);

        // 透明度控制
        const opacity = textRoot.addComponent(UIOpacity);
        opacity.opacity = 255;

        // ====== 动画 ======
        const floatHeight = isCrit ? 1.2 : isEnemyHitStyle ? 0.6 : isHealStyle ? 0.7 : 0.8;
        const duration = isCrit ? 0.8 : isEnemyHitStyle ? 0.45 : isHealStyle ? 0.5 : 0.55;
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
            // 暴击：强力弹跳 + 水平抖动 + 浮起
            const peakScale = baseScale * 1.6;
            const settleScale = baseScale * 1.06;
            root.setScale(0.006, 0.006, 0.006);

            // 主体动画：弹入 → 过冲 → 回弹 → 上飘
            tween(root)
                .to(
                    0.06,
                    { scale: new Vec3(peakScale, peakScale, peakScale) },
                    { easing: 'quadOut' }
                )
                .to(0.06, { scale: new Vec3(baseScale * 0.85, baseScale * 0.85, baseScale * 0.85) })
                .to(0.05, { scale: new Vec3(settleScale, settleScale, settleScale) })
                .to(duration - 0.17, {
                    position: new Vec3(worldPos.x + offsetX, endY, worldPos.z + offsetZ),
                    scale: new Vec3(baseScale * 0.7, baseScale * 0.7, baseScale * 0.7),
                })
                .call(recycleFn)
                .start();

            // 水平快速抖动增强冲击感
            const shakeAmplitude = 0.08;
            tween(textRoot)
                .to(0.03, { position: new Vec3(shakeAmplitude, 0, 0) })
                .to(0.03, { position: new Vec3(-shakeAmplitude, 0, 0) })
                .to(0.03, { position: new Vec3(shakeAmplitude * 0.5, 0, 0) })
                .to(0.03, { position: new Vec3(0, 0, 0) })
                .start();

            // 暴击渐隐稍晚开始，保持冲击显示时间
            tween(opacity)
                .delay(duration * 0.6)
                .to(duration * 0.4, { opacity: 0 })
                .start();
        } else {
            // 普通：直接上飘
            tween(root)
                .to(duration, {
                    position: new Vec3(worldPos.x + offsetX, endY, worldPos.z + offsetZ),
                })
                .call(recycleFn)
                .start();

            // 渐隐
            tween(opacity)
                .delay(duration * 0.5)
                .to(duration * 0.5, { opacity: 0 })
                .start();
        }
    }

    private static configureLabelNode(
        labelNode: Node,
        text: string,
        fontSize: number,
        lineHeight: number,
        color: Color,
        isCrit: boolean,
        isHealStyle: boolean
    ): void {
        const label = labelNode.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = lineHeight;
        label.isBold = true;
        label.overflow = Label.Overflow.NONE;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.color = color;
        label.cacheMode = Label.CacheMode.CHAR;
        label.useSystemFont = true;
        label.fontFamily = DamageNumberFactory.FONT_FAMILY;

        const outline = labelNode.addComponent(LabelOutline);
        if (isCrit) {
            outline.color = DamageNumberFactory.COLOR_CRIT_OUTLINE;
            outline.width = 4;
            const shadow = labelNode.addComponent(LabelShadow);
            shadow.color = DamageNumberFactory.COLOR_CRIT_SHADOW;
            shadow.offset.set(3, -3);
            shadow.blur = 6;
        } else if (isHealStyle) {
            outline.color = new Color(0, 80, 0, 180);
            outline.width = 2;
        } else {
            outline.color = new Color(0, 0, 0, 180);
            outline.width = 2;
        }
    }
}
