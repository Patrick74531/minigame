import { _decorator, Component, Node, Color, Billboard, RenderRoot2D, Graphics, Vec3 } from 'cc';

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

    private static readonly _tmpWorldPos = new Vec3();
    private static readonly _tmpWorldScale = new Vec3();
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
        if (this._root && this._root.isValid) {
            // 重新挂载到 owner 的父节点（可能被 onDisable 移除过）
            if (!this._root.parent && this.node.parent) {
                this.node.parent.addChild(this._root);
            }
            // showOnlyWhenDamaged 模式下重新启用时保持隐藏
            if (this.showOnlyWhenDamaged) {
                this._hiddenByDamageRule = true;
                this._root.active = false;
            } else {
                this._root.active = true;
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
        this.updateRootTransform();
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

    private createVisuals(): void {
        if (this._root && this._root.isValid) return;

        const root = new Node('HealthBarRoot');
        this._root = root;

        const host = this.followInWorldSpace
            ? (this.node.parent ?? this.node.scene ?? this.node)
            : this.node;
        host.addChild(root);
        root.setPosition(0, this.yOffset, 0);

        root.addComponent(RenderRoot2D);
        root.addComponent(Billboard);
        root.setScale(this.baseWorldScale, this.baseWorldScale, this.baseWorldScale);

        const bgNode = new Node('Background');
        root.addChild(bgNode);
        this._bgGraphics = bgNode.addComponent(Graphics);
        this._bgGraphics.fillColor = new Color(50, 0, 0, 255);
        this._bgGraphics.rect(-this.width / 2, -this.height / 2, this.width, this.height);
        this._bgGraphics.fill();

        // Foreground (Green)
        const fgNode = new Node('Foreground');
        root.addChild(fgNode);
        this._fgGraphics = fgNode.addComponent(Graphics);
        this._fgGraphics.fillColor = new Color(0, 255, 0, 255);
        this._fgGraphics.rect(0, 0, this.width, this.height); // Draw 0 to width, handle offset in node
        this._fgGraphics.fill();

        fgNode.setPosition(-this.width / 2, -this.height / 2, 0);
    }

    public updateHealth(current: number, max: number): void {
        if (!this._fgGraphics) return;

        const safeMax = max > 0 ? max : 1;
        const ratio = Math.max(0, Math.min(1, current / safeMax));

        // showOnlyWhenDamaged: 受伤时显示，满血后隐藏
        if (this.showOnlyWhenDamaged) {
            if (ratio < 1) {
                this._damagedShowTimer = this.damagedShowDuration;
                if (this._hiddenByDamageRule && this._root) {
                    this._root.active = true;
                    this._hiddenByDamageRule = false;
                }
            }
        }
        this._fgGraphics.node.setScale(ratio, 1, 1);

        // Foreground geometry is static; redraw only when color band changes.
        const targetColor =
            ratio > 0.5
                ? HealthBar._fgColorGreen
                : ratio > 0.2
                  ? HealthBar._fgColorYellow
                  : HealthBar._fgColorRed;
        const currentColor = this._fgGraphics.fillColor;
        if (
            currentColor.r !== targetColor.r ||
            currentColor.g !== targetColor.g ||
            currentColor.b !== targetColor.b ||
            currentColor.a !== targetColor.a
        ) {
            this._fgGraphics.fillColor = targetColor;
            this._fgGraphics.clear();
            this._fgGraphics.rect(0, 0, this.width, this.height);
            this._fgGraphics.fill();
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

    private updateRootTransform(): void {
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
}
