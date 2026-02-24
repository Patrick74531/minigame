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
} from 'cc';
import { Localization } from '../core/i18n/Localization';

const { ccclass, property } = _decorator;

export type HealthBarAnchorResolver = (owner: Node, fallbackYOffset: number) => number | null;

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

    protected onLoad(): void {
        this.createVisuals();
        this.requestAnchorRefresh();
        // showOnlyWhenDamaged 模式下初始隐藏
        if (this.showOnlyWhenDamaged && this._root) {
            this._root.active = false;
            this._hiddenByDamageRule = true;
        }
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
                this._root.active = false;
            } else {
                // 先对齐位置；若尚未收到血量快照，则先隐藏，等待 updateHealth 再显示。
                this.snapRootToOwner();
                this._root.active = this._hasHealthSnapshot;
            }
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
            this._root.active = false;
            return;
        }

        // showOnlyWhenDamaged 自动隐藏倒计时
        if (this.showOnlyWhenDamaged && !this._hiddenByDamageRule) {
            this._damagedShowTimer -= dt;
            if (this._damagedShowTimer <= 0) {
                this._hiddenByDamageRule = true;
                this._root.active = false;
                return;
            }
        }

        // 被 showOnlyWhenDamaged 隐藏时不更新
        if (this._hiddenByDamageRule) return;

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
        this._nameLabel.fontSize = 30;
        this._nameLabel.lineHeight = 34;
        this._nameLabel.isBold = true;
        this._nameLabel.string = '';
        this._nameLabel.color = new Color(255, 238, 198, 255);

        // Outline
        const outline = labelNode.addComponent(LabelOutline);
        outline.color = new Color(18, 10, 4, 255);
        outline.width = 3;

        // Shadow
        const shadow = labelNode.addComponent(LabelShadow);
        shadow.color = new Color(0, 0, 0, 200);
        shadow.offset.set(2, -1);
        shadow.blur = 2;

        // 统一按当前 width/height 重建静态几何，避免运行时改尺寸后前后景不一致。
        this.syncStaticGeometry(true);
    }

    public setName(name: string, level: number): void {
        if (!this._nameLabel) return;
        const levelText = Localization.instance.t('ui.common.level.short', { level });
        this._nameLabel.string = `${name}  ${levelText}`;
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
            if (this._root) {
                this._root.active = false;
            }
            return;
        }

        // showOnlyWhenDamaged: 受伤时显示，满血后隐藏
        if (this.showOnlyWhenDamaged) {
            if (ratio < 1) {
                this._damagedShowTimer = this.damagedShowDuration;
                if (this._hiddenByDamageRule && this._root) {
                    // 关键：先对齐位置，再激活，防止闪烁到场景原点
                    this.snapRootToOwner();
                    this._root.active = true;
                    this._hiddenByDamageRule = false;
                }
            }
        } else if (this._root && !this._root.active) {
            // 非“受伤才显示”模式下，拿到首个血量快照后再激活。
            this.snapRootToOwner();
            this._root.active = true;
        }
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
            this._nameLabel.node.setPosition(0, h + 14, 0);
        }
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
            this._root.active = false;
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
                if (this._root.active) this._root.active = false;
                return;
            }
        } else {
            this._cachedOnScreen = true;
        }

        // offscreen 检查通过后，安全地激活 root
        if (!this._root.active && !this._hiddenByDamageRule) {
            this._root.active = true;
        }

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
