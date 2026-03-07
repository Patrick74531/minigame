import {
    _decorator,
    Component,
    Node,
    Color,
    Billboard,
    RenderRoot2D,
    Graphics,
    Vec3,
    Camera,
    Canvas,
    geometry,
    director,
    view,
    Label,
    LabelOutline,
    LabelShadow,
    UITransform,
} from 'cc';
import { Localization } from '../core/i18n/Localization';

const { ccclass, property } = _decorator;

export type HealthBarAnchorResolver = (owner: Node, fallbackYOffset: number) => number | null;
export type TowerFocusedBuffCounts = {
    attack: number;
    range: number;
    speed: number;
};

type BuffBadgeStat = keyof TowerFocusedBuffCounts;
type BuffBadgeRef = {
    node: Node;
    bgGraphics: Graphics;
    iconNode: Node;
    iconGraphics: Graphics;
    countRootNode: Node;
    countBgNode: Node;
    countBg: Graphics;
    countLabelNode: Node;
    countLabel: Label;
};

/**
 * Health Bar Component
 * Displays a billboarded health bar above the entity using simple Graphics.
 * Supports model-head auto anchor and world-space follow to avoid owner rotation inheritance.
 */
@ccclass('HealthBar')
export class HealthBar extends Component {
    @property
    public width: number = 100;

    @property
    public height: number = 10;

    @property
    public yOffset: number = 2.5;

    @property
    public followInWorldSpace: boolean = true;

    @property
    public autoDetectHeadAnchor: boolean = true;

    @property
    public headPadding: number = 0.18;

    @property
    public anchorProbeInterval: number = 0.4;

    @property
    public anchorProbeDuration: number = 8.0;

    @property
    public headNameHints: string = 'head,mixamorig:head,bip001 head,head_top';

    @property
    public baseWorldScale: number = 0.02;

    @property
    public inheritOwnerScaleInWorldSpace: boolean = true;

    /** 仅在受伤时显示血条（敌人等），满血时自动隐藏 */
    @property
    public showOnlyWhenDamaged: boolean = false;

    /** showOnlyWhenDamaged 模式下，受伤后持续显示的秒数 */
    @property
    public damagedShowDuration: number = 3.0;

    /** 不在主相机视野内时隐藏（避免屏幕边缘/离屏幽灵血条） */
    @property
    public hideWhenOffscreen: boolean = true;

    /** 视野裁剪边距（按屏幕比例） */
    @property
    public offscreenPadding: number = 0.12;

    /** 视野检测频率（秒） */
    @property
    public offscreenCheckInterval: number = 0.08;

    /** owner 死亡或血量空时强制隐藏 */
    @property
    public hideWhenOwnerDead: boolean = true;

    /** 塔专属强化徽记是否允许在世界空间显示 */
    @property
    public showTowerFocusedBuffBadges: boolean = false;

    private _fgGraphics: Graphics | null = null;
    private _bgGraphics: Graphics | null = null;
    private _root: Node | null = null;

    private _resolvedYOffset: number = 0;
    private _probeTimer: number = 0;
    private _probeElapsed: number = 0;
    private _forceProbe: boolean = true;
    private _headNode: Node | null = null;
    /** showOnlyWhenDamaged 计时器，> 0 时显示血条 */
    private _damagedShowTimer: number = 0;
    /** 当前是否因 showOnlyWhenDamaged 而隐藏 */
    private _hiddenByDamageRule: boolean = false;

    private _lastOwnerX: number = Number.NaN;
    private _lastOwnerY: number = Number.NaN;
    private _lastOwnerZ: number = Number.NaN;
    private _lastAppliedYOffset: number = Number.NaN;
    private _lastAppliedScale: number = Number.NaN;
    private _headHintsCache: string[] | null = null;
    private _headHintsSource: string = '';
    private _customAnchorResolver: HealthBarAnchorResolver | null = null;
    private _cameraRef: Camera | null = null;
    private _offscreenTimer: number = 0;
    private _cachedOnScreen: boolean = true;
    private _nameLabel: Label | null = null;
    private _buffBadgeRoot: Node | null = null;
    private _buffBadgeCounts: TowerFocusedBuffCounts = { attack: 0, range: 0, speed: 0 };
    private _buffBadges: Record<BuffBadgeStat, BuffBadgeRef> | null = null;
    /** 节点重新启用后强制重绘一次 Graphics（避免 detach/reattach 后渲染数据陈旧） */
    private _needsFullRedraw: boolean = false;
    /** 缓存上次绘制状态，避免每次 updateHealth 都重绘 */
    private _lastRenderedRatio: number = -1;
    private _lastRenderedBand: number = -1;
    /** 缓存上次应用的条尺寸，支持运行时改 width/height 后自动重建几何 */
    private _lastGeometryWidth: number = -1;
    private _lastGeometryHeight: number = -1;
    /** 是否已收到过有效血量数据（避免开局短暂显示空条） */
    private _hasHealthSnapshot: boolean = false;

    private static readonly _tmpWorldPos = new Vec3();
    private static readonly _tmpWorldScale = new Vec3();
    private static readonly _tmpScreenPos = new Vec3();
    private static readonly _tmpFrustumSphere = new geometry.Sphere();
    private static readonly _fgColorGreen = new Color(0, 255, 0, 255);
    private static readonly _fgColorYellow = new Color(255, 255, 0, 255);
    private static readonly _fgColorRed = new Color(255, 0, 0, 255);
    private static readonly _maxInheritedScale = 2.5;
    private static readonly _buffStats: BuffBadgeStat[] = ['attack', 'range', 'speed'];

    protected onLoad(): void {
        this.createVisuals();
        this.requestAnchorRefresh();
        // showOnlyWhenDamaged 模式下初始隐藏
        if (this.showOnlyWhenDamaged) {
            this._hiddenByDamageRule = true;
        }
        this.syncVisualVisibility(false);
    }

    protected onEnable(): void {
        this._cachedOnScreen = true;
        this._offscreenTimer = 0;
        // 复用节点时重置渲染缓存，避免沿用旧血量视觉状态。
        this._lastRenderedRatio = -1;
        this._lastRenderedBand = -1;
        this._needsFullRedraw = true;
        if (this._root && this._root.isValid) {
            // 重新挂载到 owner 的父节点（可能被 onDisable 移除过）
            if (!this._root.parent && this.node.parent) {
                this.node.parent.addChild(this._root);
                this._needsFullRedraw = true;
            }
            // showOnlyWhenDamaged 模式下重新启用时保持隐藏
            if (this.showOnlyWhenDamaged) {
                this._hiddenByDamageRule = true;
            } else {
                this.snapRootToOwner();
            }
            this.syncVisualVisibility(this._hasHealthSnapshot || this.hasVisibleBuffBadges());
        }
    }

    protected onDisable(): void {
        if (this._root && this._root.isValid) {
            this._root.active = false;
            // 从父节点移除，避免 owner 被池化/销毁后 root 成为幽灵节点
            if (this._root.parent) {
                this._root.removeFromParent();
            }
        }
    }

    protected onDestroy(): void {
        if (this._root && this._root.isValid) {
            this._root.destroy();
        }
        this._root = null;
    }

    protected lateUpdate(dt: number): void {
        if (!this._root || !this._root.isValid || !this.node.isValid) return;

        // owner 没有父节点时（被池化回收 / 正在被销毁），隐藏血条
        if (!this.node.parent || !this.node.parent.isValid) {
            if (this._root.active) this._root.active = false;
            return;
        }

        if (this.hideWhenOwnerDead && !this.isOwnerAlive()) {
            this.syncVisualVisibility(false);
            return;
        }

        // showOnlyWhenDamaged 自动隐藏倒计时
        if (this.showOnlyWhenDamaged && !this._hiddenByDamageRule) {
            this._damagedShowTimer -= dt;
            if (this._damagedShowTimer <= 0) {
                this._hiddenByDamageRule = true;
            }
        }

        if (!this.shouldKeepRootVisible()) {
            this.syncVisualVisibility(false);
            return;
        }

        this.updateAnchorProbe(dt);
        this.updateRootTransform(dt);
    }

    public setAnchorResolver(resolver: HealthBarAnchorResolver | null): void {
        this._customAnchorResolver = resolver;
        this.requestAnchorRefresh();
    }

    public requestAnchorRefresh(): void {
        this._forceProbe = true;
        this._probeElapsed = 0;
        this._probeTimer = 0;
        this._headNode = null;
    }

    /**
     * 立即将 _root 对齐到 owner 当前世界坐标（避免闪烁到错误位置）。
     * 必须在将 _root.active 设为 true **之前** 调用。
     */
    private snapRootToOwner(): void {
        if (!this._root || !this.node.isValid) return;
        if (!this.followInWorldSpace) {
            this._root.setPosition(0, this.yOffset, 0);
            return;
        }
        this.node.getWorldPosition(HealthBar._tmpWorldPos);
        const wx = HealthBar._tmpWorldPos.x;
        const wy = HealthBar._tmpWorldPos.y;
        const wz = HealthBar._tmpWorldPos.z;
        const offsetY = Math.max(this.yOffset, this._resolvedYOffset || 0);
        if (Number.isFinite(wx) && Number.isFinite(wy) && Number.isFinite(wz)) {
            this._root.setWorldPosition(wx, wy + offsetY, wz);
            this._lastOwnerX = wx;
            this._lastOwnerY = wy;
            this._lastOwnerZ = wz;
            this._lastAppliedYOffset = offsetY;
        }
    }

    private createVisuals(): void {
        if (this._root && this._root.isValid) return;

        const root = new Node('HealthBarRoot');
        this._root = root;

        const host = this.followInWorldSpace
            ? (this.node.parent ?? this.node.scene ?? this.node)
            : this.node;
        host.addChild(root);
        // 立即对齐到 owner 世界坐标（不使用 (0,yOffset,0) 避免闪烁到场景原点）
        this.snapRootToOwner();

        root.addComponent(RenderRoot2D);
        root.addComponent(Billboard);
        root.setScale(this.baseWorldScale, this.baseWorldScale, this.baseWorldScale);

        const bgNode = new Node('Background');
        root.addChild(bgNode);
        this._bgGraphics = bgNode.addComponent(Graphics);

        // Foreground (Green)
        const fgNode = new Node('Foreground');
        root.addChild(fgNode);
        fgNode.setScale(1, 1, 1);
        this._fgGraphics = fgNode.addComponent(Graphics);
        this._fgGraphics.fillColor = new Color(0, 255, 0, 255);

        // Name Label
        const labelNode = new Node('NameLabel');
        root.addChild(labelNode);
        this._nameLabel = labelNode.addComponent(Label);
        this._nameLabel.fontSize = 24;
        this._nameLabel.lineHeight = 28;
        this._nameLabel.isBold = true;
        this._nameLabel.string = '';
        this._nameLabel.color = new Color(246, 232, 196, 238);

        // Outline
        const outline = labelNode.addComponent(LabelOutline);
        outline.color = new Color(18, 10, 4, 255);
        outline.width = 2;

        // Shadow
        const shadow = labelNode.addComponent(LabelShadow);
        shadow.color = new Color(0, 0, 0, 140);
        shadow.offset.set(1, -1);
        shadow.blur = 1;

        // Focused tower buff badges (shown only when count > 0).
        const badgeRoot = new Node('BuffBadgeRoot');
        root.addChild(badgeRoot);
        this._buffBadgeRoot = badgeRoot;
        this.createBuffBadges(badgeRoot);
        badgeRoot.active = false;

        // 统一按当前 width/height 重建静态几何，避免运行时改尺寸后前后景不一致。
        this.syncStaticGeometry(true);
    }

    public setName(name: string, level: number): void {
        if (!this._nameLabel) return;
        const levelText = Localization.instance.t('ui.common.level.short', { level });
        this._nameLabel.string = `${name} ${levelText}`;
    }

    public setTowerFocusedBuffCounts(counts: TowerFocusedBuffCounts | null): void {
        if (!this._buffBadgeRoot || !this._buffBadges) return;
        if (!counts) {
            this._buffBadgeCounts = { attack: 0, range: 0, speed: 0 };
            for (const stat of HealthBar._buffStats) {
                this._buffBadges[stat].node.active = false;
            }
            this._buffBadgeRoot.active = false;
            this.syncVisualVisibility(this._cachedOnScreen);
            return;
        }

        const nextCounts: TowerFocusedBuffCounts = {
            attack: Math.max(0, Math.floor(counts.attack || 0)),
            range: Math.max(0, Math.floor(counts.range || 0)),
            speed: Math.max(0, Math.floor(counts.speed || 0)),
        };
        this._buffBadgeCounts = nextCounts;

        if (!this.showTowerFocusedBuffBadges) {
            for (const stat of HealthBar._buffStats) {
                this._buffBadges[stat].node.active = false;
            }
            this._buffBadgeRoot.active = false;
            this.syncVisualVisibility(this._cachedOnScreen);
            return;
        }

        let hasActive = false;
        for (const stat of HealthBar._buffStats) {
            const badge = this._buffBadges[stat];
            const count = nextCounts[stat];
            badge.node.active = count > 0;
            if (count > 0) {
                hasActive = true;
                badge.countLabel.string = `${count}`;
            }
        }

        this._buffBadgeRoot.active = hasActive;
        if (hasActive) {
            this.updateBuffBadgeLayout();
        }
        if (hasActive && this._root && !this._root.active) {
            this.snapRootToOwner();
        }
        this.syncVisualVisibility(this._cachedOnScreen);
    }

    public updateHealth(current: number, max: number): void {
        if (!this._fgGraphics) return;
        this.syncStaticGeometry();
        this._hasHealthSnapshot = true;
        // 防止旧实现遗留的 scaleX 影响当前宽度渲染（例如对象复用/热更新后）。
        if (Math.abs(this._fgGraphics.node.scale.x - 1) > 0.0001) {
            this._fgGraphics.node.setScale(1, 1, 1);
            this._needsFullRedraw = true;
        }

        const safeMax = max > 0 ? max : 1;
        const ratio = Math.max(0, Math.min(1, current / safeMax));

        if (this.hideWhenOwnerDead && ratio <= 0) {
            this.syncVisualVisibility(false);
            return;
        }

        // showOnlyWhenDamaged: 受伤时显示，满血后隐藏
        if (this.showOnlyWhenDamaged) {
            if (ratio < 1) {
                this._damagedShowTimer = this.damagedShowDuration;
                if (this._hiddenByDamageRule) {
                    this._hiddenByDamageRule = false;
                }
            }
        }

        if (this.shouldKeepRootVisible() && this._root && !this._root.active) {
            this.snapRootToOwner();
        }
        this.syncVisualVisibility(this._cachedOnScreen);

        const band = this.resolveHealthBand(ratio);
        const ratioChanged = Math.abs(ratio - this._lastRenderedRatio) > 0.001;
        const bandChanged = band !== this._lastRenderedBand;
        if (!this._needsFullRedraw && !ratioChanged && !bandChanged) {
            return;
        }

        const targetColor =
            band === 2
                ? HealthBar._fgColorGreen
                : band === 1
                  ? HealthBar._fgColorYellow
                  : HealthBar._fgColorRed;
        const currentColor = this._fgGraphics.fillColor;
        const colorChanged =
            currentColor.r !== targetColor.r ||
            currentColor.g !== targetColor.g ||
            currentColor.b !== targetColor.b ||
            currentColor.a !== targetColor.a;

        this._needsFullRedraw = false;
        if (colorChanged) {
            this._fgGraphics.fillColor = targetColor;
        }

        this._fgGraphics.clear();
        const fillWidth = this.width * ratio;
        if (fillWidth > 0.001) {
            const radius = Math.max(2, this.height * 0.5);
            const fillRadius = Math.min(radius, fillWidth * 0.5);
            this._fgGraphics.roundRect(0, 0, fillWidth, this.height, fillRadius);
            this._fgGraphics.fill();
        }

        this._lastRenderedRatio = ratio;
        this._lastRenderedBand = band;
    }

    private resolveHealthBand(ratio: number): number {
        if (ratio > 0.5) return 2;
        if (ratio > 0.2) return 1;
        return 0;
    }

    private syncStaticGeometry(force: boolean = false): void {
        if (!this._bgGraphics || !this._fgGraphics) return;
        const w = Math.max(1, this.width);
        const h = Math.max(1, this.height);
        const changed =
            Math.abs(w - this._lastGeometryWidth) > 0.001 ||
            Math.abs(h - this._lastGeometryHeight) > 0.001;
        if (!force && !changed) return;

        this._lastGeometryWidth = w;
        this._lastGeometryHeight = h;
        this._needsFullRedraw = true;

        const radius = Math.max(2, h * 0.5);
        this._bgGraphics.clear();
        this._bgGraphics.fillColor = new Color(18, 16, 22, 245);
        this._bgGraphics.roundRect(-w / 2, -h / 2, w, h, radius);
        this._bgGraphics.fill();
        this._bgGraphics.strokeColor = new Color(60, 82, 104, 210);
        this._bgGraphics.lineWidth = 1.6;
        this._bgGraphics.roundRect(-w / 2, -h / 2, w, h, radius);
        this._bgGraphics.stroke();

        this._fgGraphics.node.setPosition(-w / 2, -h / 2, 0);
        if (this._nameLabel && this._nameLabel.node?.isValid) {
            // 提升名字与血条间距，避免字体描边与血条重叠。
            this._nameLabel.node.setPosition(0, h + 12, 0);
        }
        this.updateBuffBadgeLayout();
    }

    private createBuffBadges(parent: Node): void {
        const badges: Partial<Record<BuffBadgeStat, BuffBadgeRef>> = {};
        for (const stat of HealthBar._buffStats) {
            const badgeNode = new Node(`BuffBadge_${stat}`);
            parent.addChild(badgeNode);
            const bg = badgeNode.addComponent(Graphics);

            const iconNode = new Node('Icon');
            badgeNode.addChild(iconNode);
            const iconGraphics = iconNode.addComponent(Graphics);

            const countRootNode = new Node('Count');
            badgeNode.addChild(countRootNode);

            const countBgNode = new Node('CountBg');
            countRootNode.addChild(countBgNode);
            const countBg = countBgNode.addComponent(Graphics);

            const countLabelNode = new Node('CountLabel');
            countRootNode.addChild(countLabelNode);
            const countLabel = countLabelNode.addComponent(Label);
            const countLabelTransform = countLabelNode.addComponent(UITransform);
            countLabelTransform.setContentSize(24, 24);
            countLabel.string = '0';
            countLabel.color = new Color(255, 246, 214, 255);
            countLabel.isBold = true;
            countLabel.useSystemFont = false;
            countLabel.cacheMode = Label.CacheMode.CHAR;
            countLabel.enableWrapText = false;
            countLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
            countLabel.verticalAlign = Label.VerticalAlign.CENTER;
            countLabel.lineHeight = 16;
            const countOutline = countLabelNode.addComponent(LabelOutline);
            countOutline.color = new Color(12, 10, 8, 255);
            countOutline.width = 2;

            badges[stat] = {
                node: badgeNode,
                bgGraphics: bg,
                iconNode,
                iconGraphics,
                countRootNode,
                countBgNode,
                countBg,
                countLabelNode,
                countLabel,
            };
        }
        this._buffBadges = badges as Record<BuffBadgeStat, BuffBadgeRef>;
        this.updateBuffBadgeLayout();
    }

    private updateBuffBadgeLayout(): void {
        if (!this._buffBadgeRoot || !this._buffBadges) return;

        const hasActive = HealthBar._buffStats.some(stat => this._buffBadgeCounts[stat] > 0);
        if (!hasActive) {
            this._buffBadgeRoot.active = false;
            return;
        }

        const badgeSize = Math.round(Math.max(22, Math.min(30, this.height * 2.5)));
        const spacing = Math.round(Math.max(5, badgeSize * 0.24));
        const totalWidth = badgeSize * HealthBar._buffStats.length + spacing * 2;
        const baseY = this.shouldShowBarVisuals() ? this.height + 42 : 28;
        this._buffBadgeRoot.setPosition(0, baseY, 0);

        for (let i = 0; i < HealthBar._buffStats.length; i++) {
            const stat = HealthBar._buffStats[i];
            const badge = this._buffBadges[stat];
            const x = -totalWidth * 0.5 + badgeSize * 0.5 + i * (badgeSize + spacing);
            badge.node.setPosition(x, 0, 0);

            const bg = badge.bgGraphics;
            bg.clear();
            bg.fillColor = this.getBadgeColor(stat, 236);
            bg.roundRect(-badgeSize * 0.5, -badgeSize * 0.5, badgeSize, badgeSize, badgeSize * 0.3);
            bg.fill();
            bg.strokeColor = new Color(255, 247, 228, 184);
            bg.lineWidth = 1.8;
            bg.roundRect(
                -badgeSize * 0.5 + 0.8,
                -badgeSize * 0.5 + 0.8,
                badgeSize - 1.6,
                badgeSize - 1.6,
                badgeSize * 0.28
            );
            bg.stroke();

            badge.iconNode.active = true;
            badge.iconNode.setPosition(0, 1, 0);
            this.drawBadgeIcon(badge.iconGraphics, stat, badgeSize * 0.54);

            const countSize = Math.round(Math.max(15, badgeSize * 0.64));
            const countX = Math.round(badgeSize * 0.36);
            const countY = -Math.round(badgeSize * 0.36);
            badge.countRootNode.setPosition(countX, countY, 0);
            badge.countBgNode.setPosition(0, 0, 0);
            badge.countLabelNode.setPosition(0, 0, 0);
            badge.countLabelNode.setSiblingIndex(1);
            badge.countLabel.overflow = Label.Overflow.NONE;
            badge.countLabel.fontSize = Math.round(Math.max(13, countSize * 0.82));
            badge.countLabel.lineHeight = badge.countLabel.fontSize + 2;
            badge.countLabel.node.getComponent(LabelOutline)!.width = Math.max(
                1,
                Math.round(countSize * 0.12)
            );
            const labelTransform = badge.countLabelNode.getComponent(UITransform);
            if (labelTransform) {
                labelTransform.setContentSize(countSize, countSize);
            }

            const countBg = badge.countBg;
            countBg.clear();
            countBg.fillColor = new Color(26, 24, 30, 255);
            countBg.circle(0, 0, countSize * 0.5);
            countBg.fill();
            countBg.strokeColor = this.getBadgeColor(stat, 255);
            countBg.lineWidth = 1.6;
            countBg.circle(0, 0, countSize * 0.5);
            countBg.stroke();
        }
    }

    private drawBadgeIcon(graphics: Graphics, stat: BuffBadgeStat, size: number): void {
        graphics.clear();
        const s = Math.max(6, size);
        const iconColor = new Color(255, 249, 229, 255);
        graphics.strokeColor = iconColor;
        graphics.fillColor = iconColor;
        graphics.lineWidth = Math.max(1.4, s * 0.1);
        graphics.lineCap = Graphics.LineCap.ROUND;
        graphics.lineJoin = Graphics.LineJoin.ROUND;

        if (stat === 'attack') {
            graphics.moveTo(-s * 0.28, -s * 0.22);
            graphics.lineTo(s * 0.24, s * 0.22);
            graphics.stroke();
            graphics.moveTo(s * 0.11, s * 0.22);
            graphics.lineTo(s * 0.24, s * 0.22);
            graphics.lineTo(s * 0.24, s * 0.09);
            graphics.stroke();
            graphics.moveTo(-s * 0.22, s * 0.22);
            graphics.lineTo(s * 0.22, -s * 0.24);
            graphics.stroke();
            return;
        }

        if (stat === 'range') {
            graphics.circle(0, 0, s * 0.3);
            graphics.stroke();
            graphics.circle(0, 0, s * 0.12);
            graphics.stroke();
            graphics.circle(0, 0, s * 0.05);
            graphics.fill();
            return;
        }

        graphics.moveTo(-s * 0.06, s * 0.34);
        graphics.lineTo(s * 0.11, s * 0.03);
        graphics.lineTo(0, s * 0.03);
        graphics.lineTo(s * 0.06, -s * 0.33);
        graphics.lineTo(-s * 0.11, -s * 0.03);
        graphics.lineTo(0, -s * 0.03);
        graphics.close();
        graphics.fill();
    }

    private getBadgeColor(stat: BuffBadgeStat, alpha: number): Color {
        if (stat === 'attack') return new Color(214, 84, 80, alpha);
        if (stat === 'range') return new Color(78, 168, 214, alpha);
        return new Color(221, 158, 64, alpha);
    }

    private hasVisibleBuffBadges(): boolean {
        if (!this.showTowerFocusedBuffBadges) return false;
        return HealthBar._buffStats.some(stat => this._buffBadgeCounts[stat] > 0);
    }

    private shouldShowBarVisuals(): boolean {
        return this._hasHealthSnapshot && (!this.showOnlyWhenDamaged || !this._hiddenByDamageRule);
    }

    private shouldKeepRootVisible(): boolean {
        return this.shouldShowBarVisuals() || this.hasVisibleBuffBadges();
    }

    private syncVisualVisibility(rootAllowed: boolean): void {
        if (!this._root) return;

        const showBar = this.shouldShowBarVisuals();
        const showBadges = this.hasVisibleBuffBadges();

        if (this._bgGraphics?.node?.isValid) {
            this._bgGraphics.node.active = showBar;
        }
        if (this._fgGraphics?.node?.isValid) {
            this._fgGraphics.node.active = showBar;
        }
        if (this._nameLabel?.node?.isValid) {
            this._nameLabel.node.active = showBar;
        }
        if (this._buffBadgeRoot?.isValid) {
            this._buffBadgeRoot.active = showBadges;
        }

        this._root.active = rootAllowed && (showBar || showBadges);
    }

    private updateAnchorProbe(dt: number): void {
        if (!this.autoDetectHeadAnchor && !this._customAnchorResolver) {
            this._resolvedYOffset = this.yOffset;
            return;
        }

        const clampedInterval = Math.max(0.05, this.anchorProbeInterval);
        const clampedDuration = Math.max(0, this.anchorProbeDuration);

        this._probeTimer += dt;
        this._probeElapsed += dt;

        if (!this._forceProbe) {
            if (this._probeElapsed > clampedDuration) return;
            if (this._probeTimer < clampedInterval) return;
        }

        this._probeTimer = 0;
        this._forceProbe = false;

        this.recomputeAnchor();
    }

    private recomputeAnchor(): void {
        const fallback = this.yOffset;
        let detected: number | null = null;

        if (this._customAnchorResolver) {
            detected = this._customAnchorResolver(this.node, fallback);
        }

        if (detected == null && this.autoDetectHeadAnchor) {
            detected = this.detectOffsetFromModel();
        }

        this._resolvedYOffset = Math.max(fallback, detected ?? fallback);
    }

    private detectOffsetFromModel(): number | null {
        if (!this.node.isValid) return null;

        if (!this._headNode || !this._headNode.isValid) {
            this._headNode = this.findHeadNode(this.node);
        }

        if (this._headNode && this._headNode.isValid) {
            const ownerY = this.getNodeWorldY(this.node);
            const headY = this.getNodeWorldY(this._headNode);
            return Math.max(0.2, headY - ownerY + this.headPadding);
        }

        const ownerY = this.getNodeWorldY(this.node);
        const topY = this.findHighestWorldY(this.node);
        if (!Number.isFinite(topY)) return null;
        return Math.max(0.2, topY - ownerY + this.headPadding);
    }

    private findHeadNode(root: Node): Node | null {
        const hints = this.getHeadHints();
        if (!hints.length) return null;

        const stack: Node[] = [root];
        while (stack.length > 0) {
            const current = stack.pop()!;
            const name = current.name.toLowerCase();
            for (const hint of hints) {
                if (name.includes(hint)) {
                    return current;
                }
            }
            for (let i = current.children.length - 1; i >= 0; i--) {
                stack.push(current.children[i]);
            }
        }
        return null;
    }

    private getHeadHints(): string[] {
        if (this._headHintsCache && this._headHintsSource === this.headNameHints) {
            return this._headHintsCache;
        }
        this._headHintsSource = this.headNameHints;
        this._headHintsCache = this.headNameHints
            .split(',')
            .map(v => v.trim().toLowerCase())
            .filter(Boolean);
        return this._headHintsCache;
    }

    private findHighestWorldY(root: Node): number {
        let maxY = -Infinity;
        const stack: Node[] = [root];

        while (stack.length > 0) {
            const current = stack.pop()!;
            const worldY = this.getNodeWorldY(current);
            if (worldY > maxY) {
                maxY = worldY;
            }
            for (let i = 0; i < current.children.length; i++) {
                stack.push(current.children[i]);
            }
        }

        return maxY;
    }

    private getNodeWorldY(node: Node): number {
        node.getWorldPosition(HealthBar._tmpWorldPos);
        return HealthBar._tmpWorldPos.y;
    }

    private updateRootTransform(dt: number): void {
        if (!this._root) return;

        if (this.followInWorldSpace && this._root.parent === this.node && this.node.parent) {
            this.node.parent.addChild(this._root);
        }
        this.updateRootScale();

        const offsetY = Math.max(this.yOffset, this._resolvedYOffset || 0);

        if (!this.followInWorldSpace) {
            this._root.setPosition(0, offsetY, 0);
            return;
        }

        this.node.getWorldPosition(HealthBar._tmpWorldPos);
        const worldX = HealthBar._tmpWorldPos.x;
        const worldY = HealthBar._tmpWorldPos.y;
        const worldZ = HealthBar._tmpWorldPos.z;
        if (
            !Number.isFinite(worldX) ||
            !Number.isFinite(worldY) ||
            !Number.isFinite(worldZ) ||
            !Number.isFinite(offsetY)
        ) {
            this.syncVisualVisibility(false);
            return;
        }
        // 先进行 offscreen 检查，确认在屏幕内后再激活 root，
        // 避免在 offscreen 检查之前意外激活导致闪烁。
        if (this.hideWhenOffscreen) {
            this._offscreenTimer += dt;
            const interval = Math.max(0.02, this.offscreenCheckInterval);
            if (this._offscreenTimer >= interval || !this._cachedOnScreen) {
                this._offscreenTimer = 0;
                const padding = Math.max(
                    0,
                    this.offscreenPadding + (this._cachedOnScreen ? 0 : 0.05)
                );
                this._cachedOnScreen = this.isWorldPointOnScreen(
                    worldX,
                    worldY + offsetY,
                    worldZ,
                    padding
                );
            }
            if (!this._cachedOnScreen) {
                this.syncVisualVisibility(false);
                return;
            }
        } else {
            this._cachedOnScreen = true;
        }

        if (!this.shouldKeepRootVisible()) {
            this.syncVisualVisibility(false);
            return;
        }
        this.syncVisualVisibility(true);

        if (
            Math.abs(worldX - this._lastOwnerX) < 0.0001 &&
            Math.abs(worldY - this._lastOwnerY) < 0.0001 &&
            Math.abs(worldZ - this._lastOwnerZ) < 0.0001 &&
            Math.abs(offsetY - this._lastAppliedYOffset) < 0.0001
        ) {
            return;
        }

        this._lastOwnerX = worldX;
        this._lastOwnerY = worldY;
        this._lastOwnerZ = worldZ;
        this._lastAppliedYOffset = offsetY;
        this._root.setWorldPosition(worldX, worldY + offsetY, worldZ);
    }

    private updateRootScale(): void {
        if (!this._root) return;

        let scale = Math.max(0.0001, this.baseWorldScale);
        if (this.followInWorldSpace && this.inheritOwnerScaleInWorldSpace) {
            this.node.getWorldScale(HealthBar._tmpWorldScale);
            const ws = HealthBar._tmpWorldScale;
            const rawAvgScale = (Math.abs(ws.x) + Math.abs(ws.y) + Math.abs(ws.z)) / 3;
            const avgScale = Number.isFinite(rawAvgScale)
                ? Math.max(0.05, Math.min(HealthBar._maxInheritedScale, rawAvgScale))
                : 1;
            scale *= avgScale;
        }
        if (!Number.isFinite(scale) || scale <= 0) return;

        if (Math.abs(scale - this._lastAppliedScale) < 0.0001) {
            return;
        }

        this._lastAppliedScale = scale;
        this._root.setScale(scale, scale, scale);
    }

    private isWorldPointOnScreen(x: number, y: number, z: number, padding: number): boolean {
        const cam = this.resolveMainCamera();
        if (!cam) return true;

        const camLike2 = cam as unknown as {
            frustum?: unknown;
        };
        if (camLike2.frustum) {
            const geomLike = geometry as unknown as {
                intersect?: { sphereFrustum?: (sphere: unknown, frustum: unknown) => boolean };
            };
            const sphereFrustum = geomLike.intersect?.sphereFrustum;
            if (typeof sphereFrustum === 'function') {
                const sphere = HealthBar._tmpFrustumSphere;
                sphere.center.set(x, y, z);
                sphere.radius = 0.2;
                if (!sphereFrustum(sphere, camLike2.frustum)) {
                    return false;
                }
            }
        }

        const camLike = cam as unknown as {
            worldToScreen?: (out: Vec3, worldPos: Vec3) => void;
        };
        const worldToScreen = camLike.worldToScreen;
        if (typeof worldToScreen !== 'function') return true;

        const world = HealthBar._tmpWorldPos;
        world.set(x, y, z);
        const screen = HealthBar._tmpScreenPos;
        // Cocos 3.x API: worldToScreen(out, worldPos)
        worldToScreen.call(cam, screen, world);
        if (
            !Number.isFinite(screen.x) ||
            !Number.isFinite(screen.y) ||
            !Number.isFinite(screen.z)
        ) {
            return false;
        }
        if (screen.z < 0) return false;

        const size = view.getVisibleSize();
        if (!size || size.width <= 0 || size.height <= 0) return true;

        const padX = size.width * padding;
        const padY = size.height * padding;
        return (
            screen.x >= -padX &&
            screen.x <= size.width + padX &&
            screen.y >= -padY &&
            screen.y <= size.height + padY
        );
    }

    private resolveMainCamera(): Camera | null {
        if (this._cameraRef && this._cameraRef.isValid && this._cameraRef.enabledInHierarchy) {
            return this._cameraRef;
        }

        const scene = director.getScene();
        if (!scene) return null;
        const cameras = scene.getComponentsInChildren(Camera);
        const firstWorldCamera = cameras.find(
            cam =>
                !!cam &&
                cam.isValid &&
                cam.enabledInHierarchy &&
                !this.isUnderCanvas(cam.node) &&
                cam.node.name.toLowerCase().includes('main')
        );
        if (firstWorldCamera) {
            this._cameraRef = firstWorldCamera;
            return firstWorldCamera;
        }

        const worldCamera = cameras.find(
            cam => !!cam && cam.isValid && cam.enabledInHierarchy && !this.isUnderCanvas(cam.node)
        );
        if (worldCamera) {
            this._cameraRef = worldCamera;
            return worldCamera;
        }

        for (const cam of cameras) {
            if (!cam || !cam.isValid || !cam.enabledInHierarchy) continue;
            this._cameraRef = cam;
            return cam;
        }
        this._cameraRef = null;
        return null;
    }

    private isUnderCanvas(node: Node): boolean {
        let current: Node | null = node;
        while (current) {
            if (current.getComponent(Canvas)) return true;
            current = current.parent;
        }
        return false;
    }

    private isOwnerAlive(): boolean {
        const ownerUnit = this.node.getComponent('Unit') as { isAlive?: boolean } | null;
        if (ownerUnit && ownerUnit.isAlive === false) return false;

        const ownerBuilding = this.node.getComponent('Building') as { isAlive?: boolean } | null;
        if (ownerBuilding && ownerBuilding.isAlive === false) return false;

        return this.node.activeInHierarchy;
    }
}
