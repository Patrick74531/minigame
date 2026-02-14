import {
    _decorator,
    Node,
    Color,
    MeshRenderer,
    primitives,
    utils,
    Material,
    Label,
    UITransform,
    Billboard,
    RenderRoot2D,
    BoxCollider,
    ITriggerEvent,
    Vec3,
    RigidBody,
    Graphics,
    LabelOutline,
    Prefab,
    resources,
    instantiate,
} from 'cc';
import { Building } from './Building';
import { BaseComponent } from '../../core/base/BaseComponent';
import { BuildingRegistry, BuildingTypeConfig } from './BuildingRegistry';
import { EventManager } from '../../core/managers/EventManager';
import { GameEvents } from '../../data/GameEvents';
import { GameConfig } from '../../data/GameConfig';
import { HUDManager } from '../../ui/HUDManager';
import { Hero } from '../units/Hero';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import { BuildingText } from './BuildingText';
import { GameManager } from '../../core/managers/GameManager';

const { ccclass, property } = _decorator;

/**
 * 建造点状态
 */
export enum BuildingPadState {
    WAITING, // 等待金币
    BUILDING, // 建造中
    COMPLETE, // 建造完成 (Transient)
    UPGRADING, // 升级中
    SELECTING, // 选择塔防类型中
}

/**
 * 建造点组件
 * 显示圆盘和所需金币数，检测英雄进入并收集金币
 */
@ccclass('BuildingPad')
export class BuildingPad extends BaseComponent {
    private static readonly BUILD_CONFIRM_DELAY = 0.25;
    private static readonly BUILD_MAX_RETRY = 3;
    private static readonly BUILD_AUTO_RETRY_ROUNDS = 2;

    /** 建筑类型 ID */
    @property
    public buildingTypeId: string = 'barracks';

    /** 投放区半径（与视觉模型和触发区一致） */
    @property
    public collectRadius: number = GameConfig.BUILDING.UPGRADE_PAD.RADIUS;

    /** 每次收集金币数量 */
    @property
    public collectRate: number = 1;

    /** 收集间隔（秒） */
    @property
    public collectInterval: number = 0.1;

    /** 锁定在初始世界坐标（建成后不自动移动到建筑前方） */
    @property
    public lockWorldPosition: boolean = true;

    // 内部状态
    private _config: BuildingTypeConfig | null = null;
    private _collectedCoins: number = 0;
    private _state: BuildingPadState = BuildingPadState.WAITING;
    private _collectTimer: number = 0;
    private _label: Label | null = null;
    private _heroInRange: boolean = false;
    private _heroNode: Node | null = null;
    private _padMaterial: Material | null = null;

    private _initialBuildingTypeId: string = '';
    private _isTowerSlot: boolean = false;

    // === Getters ===

    public get state(): BuildingPadState {
        return this._state;
    }

    public get collectedCoins(): number {
        return this._collectedCoins;
    }

    // requiredCoins getter replaced by dynamic version below

    public get progress(): number {
        if (this.requiredCoins === 0) return 0;
        return this._collectedCoins / this.requiredCoins;
    }

    public get isComplete(): boolean {
        return this._collectedCoins >= this.requiredCoins;
    }

    public get buildingName(): string {
        return BuildingText.resolveName({
            id: this._config?.id ?? this.buildingTypeId,
            nameKey: this._config?.nameKey,
        });
    }

    // === 生命周期 ===

    protected initialize(): void {
        // 初始化逻辑保留为空，延迟到 start 执行，确保属性已被赋值
    }

    // === Physics Implementation ===

    // Flag to track hero presence
    private _heroInArea: boolean = false;
    private _heroRef: Hero | null = null;
    private _isAnimating: boolean = false; // New flag to block input during animation
    private _buildEmitAttempts: number = 0;
    private _buildAutoRetryRounds: number = 0;

    // Store original spawn position to place the building there.
    private _originalPosition: Vec3 = new Vec3();

    protected start(): void {
        // 1. Store Original Position (Where the building should be)
        this._originalPosition.set(this.node.worldPosition);

        this.setupPhysics();

        // Previous start logic
        console.log(
            `[BuildingPad] start() \u88ab\u8c03\u7528, buildingTypeId=${this.buildingTypeId}`
        );
        
        // Save initial type and check if it is a tower slot
        this._initialBuildingTypeId = this.buildingTypeId;
        this._isTowerSlot = this.isTowerType(this.buildingTypeId);

        const config = this.buildingRegistry.get(this.buildingTypeId);
        this._config = config ?? null;
        if (!this._config) {
            console.error(
                `[BuildingPad] \u672a\u627e\u5230\u5efa\u7b51\u7c7b\u578b: ${this.buildingTypeId}`
            );
            return;
        }

        this.createVisuals();
        if (this.lockWorldPosition) {
            this.applyFixedOffsetFromSpawn();
        }
        
        // Listen for tower selection
        this.eventManager.on(GameEvents.TOWER_SELECTED, this.onTowerSelected, this);

        console.log(`[BuildingPad] 初始化: ${this.buildingName}, 需要 ${this._config.cost} 金币`);
    }

    protected onDestroy(): void {
        this.eventManager.off(GameEvents.TOWER_SELECTED, this.onTowerSelected, this);
    }
    
    private isTowerType(typeId: string): boolean {
        return typeId === 'tower' || typeId === 'frost_tower' || typeId === 'lightning_tower';
    }

    private applyFixedOffsetFromSpawn(): void {
        const forward = new Vec3();
        Vec3.multiplyScalar(forward, this.node.forward, -1);
        if (forward.lengthSqr() < 0.0001) {
            forward.set(0, 0, 1);
        } else {
            forward.normalize();
        }

        const buildingHalfSize = this.estimateBuildingHalfSize();
        const offsetDistance =
            buildingHalfSize + this.collectRadius + GameConfig.BUILDING.UPGRADE_PAD.GAP;

        this.node.setWorldPosition(
            this._originalPosition.x + forward.x * offsetDistance,
            this.node.worldPosition.y,
            this._originalPosition.z + forward.z * offsetDistance
        );
    }

    private estimateBuildingHalfSize(): number {
        if (this.buildingTypeId === 'wall') {
            return 1.0;
        }
        if (this.buildingTypeId === 'farm') {
            return 3.4;
        }

        const cfg = this.buildingRegistry.get(this.buildingTypeId);
        const sx = Math.abs(cfg?.visual?.scale?.x ?? 1);
        const sz = Math.abs(cfg?.visual?.scale?.z ?? 1);
        const half = Math.max(sx, sz) * 0.5;
        return Math.max(0.3, half);
    }

    private setupPhysics(): void {
        // Add RigidBody (Static) - Required for consistent Trigger events in some engines
        let rb = this.node.getComponent(RigidBody);
        if (!rb) {
            rb = this.node.addComponent(RigidBody);
            rb.type = RigidBody.Type.STATIC;
        }

        let col = this.node.getComponent(BoxCollider);
        if (!col) {
            col = this.node.addComponent(BoxCollider);
        }

        // Force update properties even if component existed (e.g. from Prefab)
        col.isTrigger = true;
        col.center = new Vec3(0, 1.0, 0);
        col.size = new Vec3(2.4, 2.0, 2.4);

        col.setGroup(1 << 2); // BUILDING_PAD
        col.setMask(1 << 0); // Collide with HERO

        col.on('onTriggerEnter', this.onTriggerEnter, this);
        col.on('onTriggerExit', this.onTriggerExit, this);

        console.log(
            `[BuildingPad] Physics Setup Complete. BoxCollider Size: ${col.size}, Trigger: ${col.isTrigger}`
        );
    }

    /**
     * Physics Event: Player enters pad
     */
    private onTriggerEnter(event: ITriggerEvent): void {
        const otherNode = event.otherCollider.node;

        let hero = otherNode.getComponent(Hero);
        if (!hero) {
            hero = otherNode.getComponent('Hero') as Hero;
        }

        if (hero) {
            this._heroInArea = true;
            this._heroRef = hero;

            // Show Info
            if (this.hudManager) {
                const title = this.getHudTitle();
                this.hudManager.showBuildingInfo(title, this.requiredCoins, this.collectedCoins);
            }
        }
    }

    /**
     * Physics Event: Player exits pad
     */
    private onTriggerExit(event: ITriggerEvent): void {
        const otherNode = event.otherCollider.node;
        const hero = otherNode.getComponent(Hero);
        if (hero) {
            this._heroInArea = false;
            this._heroRef = null;

            // Hide Info
            if (this.hudManager) {
                this.hudManager.hideBuildingInfo();
            }
        }
    }

    /**
     * Standard Update Loop for Interaction
     */
    protected update(_dt: number): void {
        if (!this.gameManager.isPlaying) return;

        if (this._heroInArea && this._heroRef) {
            // Check state
            if (
                this._state !== BuildingPadState.WAITING &&
                this._state !== BuildingPadState.UPGRADING
            ) {
                return;
            }

            // Check if hero still valid
            if (!this._heroRef.node || !this._heroRef.node.isValid) {
                this._heroInArea = false;
                this._heroRef = null;
                return;
            }

            // Perform Collection
            if (this._heroRef.coinCount > 0) {
                const collected = this.tryCollectCoin(this._heroRef.coinCount);
                if (collected > 0) {
                    this._heroRef.removeCoin(collected);

                    // Update HUD periodically or on change
                    if (this.hudManager) {
                        this.hudManager.updateCoinDisplay(this._heroRef.coinCount);
                        // Update building info too as coins change
                        const title = this.getHudTitle();
                        this.hudManager.showBuildingInfo(
                            title,
                            this.requiredCoins,
                            this.collectedCoins
                        );
                    }
                }
            }
        }
    }
    
    /**
     * 创建视觉元素（圆盘和数字）
     */
    private createVisuals(): void {
        // Root for all visuals, lifted slightly to avoid z-fighting with ground
        const visualRoot = new Node('VisualRoot');
        this.node.addChild(visualRoot);
        visualRoot.setPosition(0, 0.05, 0);

        // 1. Ground Graphics (Dashed Border)
        const flatRoot = new Node('FlatRoot');
        visualRoot.addChild(flatRoot);
        flatRoot.setRotationFromEuler(-90, 0, 0);
        flatRoot.addComponent(RenderRoot2D);
        flatRoot.setScale(0.01, 0.01, 0.01); // Scale down to match world units

        // -- Setup Helper for Dashed Drawing --
        const ctx = flatRoot.addComponent(Graphics);
        ctx.lineWidth = 6;
        ctx.strokeColor = Color.WHITE;
        ctx.lineJoin = Graphics.LineJoin.ROUND;
        ctx.lineCap = Graphics.LineCap.ROUND;

        const w = 240;
        const h = 240;
        const r = 40;
        // Use 0 radius or just skip corners to match request "No corner circles"
        // drawing dashed rect with unconnected corners
        this.drawDashedRectSimple(ctx, -w / 2, -h / 2, w, h, 20, 15);

        // -- Content Container (Label + Coin) --
        const contentNode = new Node('Content');
        flatRoot.addChild(contentNode);

        // -- Cost Label --
        // Positioned Top (y > 0)
        const labelNode = new Node('CostLabel');
        contentNode.addChild(labelNode);
        // Moved Up slightly more to accommodate larger text
        labelNode.setPosition(0, 60, 0);

        const uiTransform = labelNode.addComponent(UITransform);
        uiTransform.setContentSize(300, 150); // Increased size container

        this._label = labelNode.addComponent(Label);
        this._label.string = `${this.requiredCoins}`;
        this._label.fontSize = 120; // Increased from 90
        this._label.lineHeight = 120;
        this._label.color = Color.WHITE;
        this._label.isBold = true;
        this._label.horizontalAlign = Label.HorizontalAlign.CENTER; // Center align
        this._label.verticalAlign = Label.VerticalAlign.BOTTOM;

        // Add outline for better visibility
        const outline = labelNode.addComponent(LabelOutline);
        outline.color = Color.BLACK;
        outline.width = 6; // Thicker outline for larger text

        // 2. Coin Model (3D)
        const loadCoin = (path: string, next?: () => void) => {
            resources.load(path, Prefab, (err, prefab) => {
                if (err || !prefab) {
                    if (next) next();
                    else console.warn(`[BuildingPad] Failed to load coin from ${path}:`, err);
                    return;
                }
                if (!visualRoot.isValid) return;

                const coin = instantiate(prefab);
                visualRoot.addChild(coin);

                // Position: Bottom (World Z+)
                // Text is at Y=+60 (flatRoot) => World Z=-0.6
                // Coin should be at World Z=+0.7 to balance
                coin.setPosition(0, 0, 0.7);

                // Rotate to lie flat (-90 X)
                coin.setRotationFromEuler(-90, 0, 0);

                // Scale - Reduced further
                // Previous 1.2. User said "smaller".
                // Let's try 0.8.
                const coinScale = 0.8;
                coin.setScale(coinScale, coinScale, coinScale);
            });
        };

        loadCoin('effects/star_coin', () => {
            loadCoin('effects/star_coin/star_coin');
        });
    }

    private drawDashedRectSimple(
        ctx: Graphics,
        x: number,
        y: number,
        w: number,
        h: number,
        dash: number,
        gap: number
    ): void {
        // Draw 4 independent dashed lines, leave corners open
        const cornerGap = 20; // safe space from corner

        // Top Edge (y+h)
        this.drawDashedLine(ctx, x + cornerGap, y + h, x + w - cornerGap, y + h, dash, gap);
        // Right Edge (x+w)
        this.drawDashedLine(ctx, x + w, y + h - cornerGap, x + w, y + cornerGap, dash, gap);
        // Bottom Edge (y)
        this.drawDashedLine(ctx, x + w - cornerGap, y, x + cornerGap, y, dash, gap);
        // Left Edge (x)
        this.drawDashedLine(ctx, x, y + cornerGap, x, y + h - cornerGap, dash, gap);
    }

    private drawDashedLine(
        ctx: Graphics,
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        dashLen: number,
        gapLen: number
    ): void {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        const dirX = dx / len;
        const dirY = dy / len;

        let current = 0;
        let drawing = true;

        while (current < len) {
            const segLen = Math.min(drawing ? dashLen : gapLen, len - current);

            if (drawing) {
                ctx.moveTo(x1 + dirX * current, y1 + dirY * current);
                ctx.lineTo(x1 + dirX * (current + segLen), y1 + dirY * (current + segLen));
                ctx.stroke();
            }

            current += segLen;
            drawing = !drawing;
        }
    }

    private updateDisplay(): void {
        if (this._label) {
            const remaining = this.requiredCoins - this._collectedCoins;

            if (remaining <= 0) {
                this._label.string = BuildingText.constructingLabel();
                this._label.fontSize = 20; // Reduce size for text fit
            } else {
                this._label.string = `${remaining}`;
                this._label.fontSize = 50; // Restore size for number
            }

            if (this.progress >= 1) {
                this._label.color = new Color(0, 255, 0, 255);
            } else if (this.progress >= 0.5) {
                this._label.color = new Color(255, 255, 0, 255);
            } else {
                this._label.color = new Color(255, 215, 0, 255);
            }
        }
    }

    public setHeroNode(hero: Node): void {
        this._heroNode = hero;
    }

    /**
     * 为已存在的建筑初始化（如基地）
     * @param building 建筑实例
     * @param initialNextCost 初始升级费用
     */
    public initForExistingBuilding(building: Building, initialNextCost: number): void {
        this._associatedBuilding = building;

        // Ensure config is loaded
        if (!this._config) {
            this._config = this.buildingRegistry.get(this.buildingTypeId) ?? null;
        }

        this._nextUpgradeCost = initialNextCost;
        this._state = BuildingPadState.UPGRADING;
        this._collectedCoins = 0;

        this.updateDisplay();

        console.log(
            `[BuildingPad] Init for existing building: ${this.buildingName}, Next Cost: ${this._nextUpgradeCost}`
        );
    }

    /**
     * 关联的建筑实例
     */
    private _associatedBuilding: Building | null = null;
    private _nextUpgradeCost: number = 0;

    /**
     * 建筑创建时的回调
     */
    public onBuildingCreated(building: Building): void {
        this._associatedBuilding = building;
        this._buildEmitAttempts = 0;
        this._buildAutoRetryRounds = 0;

        // 若 start() 还未执行，提前加载配置
        if (!this._config) {
            this._config = this.buildingRegistry.get(this.buildingTypeId) ?? null;
        }

        // Calculate next upgrade cost
        const baseCost = this._config?.cost ?? 0;
        const costMult = building.upgradeCostMultiplier;

        this._nextUpgradeCost = Math.ceil(baseCost * costMult);

        // Change state AFTER calculation
        this._state = BuildingPadState.UPGRADING;

        // Reset collection for upgrade
        this._collectedCoins = 0;

        // Update Label to show nothing or "Upgrade"
        this.updateDisplay();

        // Recompute with real built footprint even if pad was initially world-locked.
        this.placeUpgradeZoneInFront(building.node, true);

        console.log(
            `[BuildingPad] Entered Upgrade Mode. Base: ${baseCost}, Next Cost: ${this._nextUpgradeCost}`
        );
    }

    public onAssociatedBuildingDestroyed(buildingId: string): boolean {
        if (!this._associatedBuilding || !buildingId) return false;
        const associatedNode = this._associatedBuilding.node;
        if (!associatedNode || !associatedNode.isValid) {
            this.reset();
            return true;
        }
        if (associatedNode.uuid !== buildingId) return false;

        this.reset();
        return true;
    }

    /**
     * 将投放区放到建筑前方，避免与建筑模型重叠
     */
    public placeUpgradeZoneInFront(buildingNode: Node, force: boolean = false): void {
        if (!buildingNode || !buildingNode.isValid) return;
        if (this.lockWorldPosition && !force) return;

        // Calculate direction: Perpendicular to building (Local Back)
        // Cocos Forward is -Z. Local Back is +Z.
        // We want to move in the direction of the building's "Front" visually presented to player?
        // Actually, for Walls rotated 90deg, "Front" or "Back" (perpendicular) are both fine, as long as not parallel.
        // Using visual Back (-Forward) = Local +Z.
        const forward = new Vec3();
        Vec3.multiplyScalar(forward, buildingNode.forward, -1); // Local +Z (Back)

        // Normalize (forward from Node might have scale?) No, usually normalized direction.
        // Node.forward is normalized in recent Cocos versions? Let's ensure.
        forward.normalize();

        const worldScale = buildingNode.worldScale;
        // Use X/Z max as approximate radius/half-size
        // For walls (long X), using Max might push it very far?
        // If Wall is 10 units long (X), 1 unit thick (Z).
        // If we move along Z (Back), we only need to clear Thickness (Z).
        // So we should probably use the dimension projected on the direction?
        // That's complex.
        // Simplified: For 'wall', use a fixed small size. For others use Max.
        // A wall's meaningful bounds for "clearing" perpendicular is small.

        let buildingHalfSize = Math.max(Math.abs(worldScale.x), Math.abs(worldScale.z)) * 0.5;
        if (this.buildingTypeId === 'wall') {
            // Walls are long but thin. We are moving perpendicular. Use thickness approx.
            buildingHalfSize = 1.0;
        } else if (this.buildingTypeId === 'farm') {
            // Keep clear of mine mesh, but still visible and reachable.
            buildingHalfSize = 3.8;
        }

        const offsetDistance =
            buildingHalfSize + this.collectRadius + GameConfig.BUILDING.UPGRADE_PAD.GAP;

        const worldPos = buildingNode.worldPosition;
        this.node.setWorldPosition(
            worldPos.x + forward.x * offsetDistance,
            this.node.worldPosition.y, // Keep current Y (usually 0)
            worldPos.z + forward.z * offsetDistance
        );

        // Prevent stale in-area state from old position causing accidental collection
        this._heroInArea = false;
        this._heroRef = null;
        if (this.hudManager) {
            this.hudManager.hideBuildingInfo();
        }
    }

    public get requiredCoins(): number {
        if (this._state === BuildingPadState.UPGRADING) {
            return this._nextUpgradeCost;
        }
        return this._config?.cost ?? 0;
    }

    /**
     * 尝试从英雄收集金币
     * @param heroCoins 英雄当前持有的金币数
     * @returns 实际收集的金币数
     */
    public tryCollectCoin(heroCoins: number): number {
        if (this._isAnimating) return 0; // Block collection during animation

        if (this._state !== BuildingPadState.WAITING && this._state !== BuildingPadState.UPGRADING)
            return 0;

        // If Max Level, stop collecting
        if (this._state === BuildingPadState.UPGRADING && this._associatedBuilding) {
            const maxLvl = this._associatedBuilding.maxLevel;
            if (this._associatedBuilding.level >= maxLvl) {
                // Max Level Reached
                if (this._label) this._label.string = BuildingText.maxLabel();
                return 0;
            }
        }

        if (heroCoins <= 0) return 0;

        const needed = this.requiredCoins - this._collectedCoins;
        const toCollect = Math.min(this.collectRate, heroCoins, needed);

        if (toCollect > 0) {
            this._collectedCoins += toCollect;
            this.updateDisplay();

            // 检查是否建造/升级完成
            if (this.isComplete) {
                if (this._state === BuildingPadState.WAITING) {
                    // Check logic for Tower Selection
                    if (this._isTowerSlot) {
                        this.enterTowerSelection();
                    } else {
                        this.onBuildComplete();
                    }
                } else if (this._state === BuildingPadState.UPGRADING) {
                    this.onUpgradeComplete();
                }
            }
        }

        return toCollect;
    }

    private enterTowerSelection(): void {
        this._state = BuildingPadState.SELECTING;
        console.log(`[BuildingPad] Coins collected for Tower Slot. Requesting Selection...`);
        this.eventManager.emit(GameEvents.REQUEST_TOWER_SELECTION, { padNode: this.node });
    }
    
    private onTowerSelected(data: { padNode: Node, buildingTypeId: string }): void {
        if (data.padNode !== this.node) return;
        
        console.log(`[BuildingPad] Tower Selected: ${data.buildingTypeId}`);
        
        // Update type and config
        this.buildingTypeId = data.buildingTypeId;
        this._config = this.buildingRegistry.get(this.buildingTypeId) ?? null;
        
        // Switch back to WAITING to check costs again vs collected coins
        this._state = BuildingPadState.WAITING;
        
        // Update visuals to match new type cost (if different)
        this.updateDisplay();
        
        // Check if we have enough coins now (if we selected a cheaper or same cost tower)
        if (this.isComplete) {
            this.onBuildComplete();
        } else {
            console.log(`[BuildingPad] Selected tower is more expensive. improved collection needed.`);
            // Update HUD if hero is in area
            if (this._heroInArea && this.hudManager) {
                 const title = this.getHudTitle();
                 this.hudManager.showBuildingInfo(title, this.requiredCoins, this.collectedCoins);
            }
        }
    }

    /**
     * 建造完成
     */
    private onBuildComplete(): void {
        if (this._state === BuildingPadState.BUILDING) return;
        this._state = BuildingPadState.BUILDING;
        this._buildEmitAttempts = 0;

        console.log(`[BuildingPad] 建造完成: ${this.buildingName}`);

        // 首次建造：烟雾播放完毕后才真正创建模型，避免建筑“抢跑”。
        this.playConstructionEffect(() => {
            this.requestBuildConstruction();
        });

        // Note: Manager will call onBuildingCreated(), setting state to UPGRADING
    }

    private requestBuildConstruction(): void {
        if (!this.node.isValid || this._state !== BuildingPadState.BUILDING) return;
        if (this._associatedBuilding) return;

        this._buildEmitAttempts += 1;
        this.eventManager.emit(GameEvents.BUILDING_CONSTRUCTED, {
            padNode: this.node,
            buildingTypeId: this.buildingTypeId,
            position: this._originalPosition.clone(),
        });

        this.scheduleOnce(() => {
            if (!this.node.isValid) return;
            if (this._state !== BuildingPadState.BUILDING || this._associatedBuilding) return;

            if (this._buildEmitAttempts < BuildingPad.BUILD_MAX_RETRY) {
                console.warn(
                    `[BuildingPad] Build confirmation timeout (${this._buildEmitAttempts}/${BuildingPad.BUILD_MAX_RETRY}), retrying...`
                );
                this.requestBuildConstruction();
                return;
            }

            this.onBuildFailed('build confirmation timeout');
        }, BuildingPad.BUILD_CONFIRM_DELAY);
    }

    public onBuildFailed(reason: string = 'unknown'): void {
        if (this._associatedBuilding) return;
        if (
            this._state !== BuildingPadState.BUILDING &&
            this._state !== BuildingPadState.COMPLETE
        ) {
            return;
        }

        console.warn(`[BuildingPad] Build failed: ${reason}`);
        this._buildEmitAttempts = 0;
        this._state = BuildingPadState.WAITING;

        if (this._buildAutoRetryRounds < BuildingPad.BUILD_AUTO_RETRY_ROUNDS) {
            this._buildAutoRetryRounds += 1;
            this._collectedCoins = this.requiredCoins;
            this.updateDisplay();
            this.scheduleOnce(() => {
                if (!this.node.isValid) return;
                if (this._state !== BuildingPadState.WAITING || this._associatedBuilding) return;
                
                // Retry logic must also respect selection!
                // If it failed, we assume the selection was already done OR it failed for other reasons.
                // Since buildingTypeId is already set, we just try to complete.
                if (this.isComplete) {
                     this.onBuildComplete();
                }
            }, 0.35);
            return;
        }

        // 保底解锁：重试多次失败后降为“差 1 金币”，避免一直卡在建造中。
        this._buildAutoRetryRounds = 0;
        this._collectedCoins = Math.max(0, this.requiredCoins - 1);
        this.updateDisplay();
    }

    private onUpgradeComplete(): void {
        if (!this._associatedBuilding) return;

        // Prevent multiple triggers
        if (this._isAnimating) return;
        this._isAnimating = true;

        // Hide building during animation
        this._associatedBuilding.node.active = false;

        // Play visual effect first
        this.playConstructionEffect(() => {
            if (!this._associatedBuilding) {
                this._isAnimating = false;
                return;
            }

            // Show building again
            this._associatedBuilding.node.active = true;

            // Perform Upgrade
            const upgraded = this._associatedBuilding.upgrade();
            if (!upgraded) {
                this._isAnimating = false;
                return;
            }

            // Calculate NEXT cost
            const costMult = this._associatedBuilding.upgradeCostMultiplier;
            this._nextUpgradeCost = Math.ceil(this._nextUpgradeCost * costMult);

            // Reset
            this._collectedCoins = 0;
            this.updateDisplay();

            // Check Max Level
            const maxLvl = this._associatedBuilding.maxLevel;
            if (this._associatedBuilding.level >= maxLvl) {
                console.log('[BuildingPad] Max Level Reached.');
                if (this._label) {
                    this._label.string = BuildingText.maxLabel();
                    this._label.color = Color.RED;
                }
            }

            this._isAnimating = false;
        });
    }

    /**
     * 重置建造点
     */
    public reset(): void {
        this._associatedBuilding = null;
        this._nextUpgradeCost = 0;
        this._collectedCoins = 0;
        this._state = BuildingPadState.WAITING;
        this._isAnimating = false;
        this._buildEmitAttempts = 0;
        this._buildAutoRetryRounds = 0;
        
        // Restore initial type if this was a tower slot
        if (this._isTowerSlot) {
            this.buildingTypeId = this._initialBuildingTypeId;
            this._config = this.buildingRegistry.get(this.buildingTypeId) ?? null;
        }
        
        this.updateDisplay();

        if (this._heroInArea && this.hudManager) {
            const title = this.getHudTitle();
            this.hudManager.showBuildingInfo(title, this.requiredCoins, this.collectedCoins);
        }
    }

    private playConstructionEffect(onComplete?: () => void): void {
        const path = 'effects/build_smoke/attckSmoke';
        resources.load(path, Prefab, (err, prefab) => {
            if (err || !prefab) {
                console.warn(`[BuildingPad] Failed to load construction effect: ${path}`, err);
                if (onComplete) onComplete(); // Ensure callback runs even on error
                return;
            }
            if (!this.node.isValid) {
                if (onComplete) onComplete();
                return;
            }

            const effectNode = instantiate(prefab);
            const anchorPos = new Vec3();
            const associatedParent = this._associatedBuilding?.node?.parent;
            const parent =
                associatedParent && associatedParent.isValid
                    ? associatedParent
                    : this.node.parent && this.node.parent.isValid
                      ? this.node.parent
                      : this.node;

            if (this._associatedBuilding?.node?.isValid) {
                anchorPos.set(this._associatedBuilding.node.worldPosition);
            } else {
                anchorPos.set(this._originalPosition);
            }

            parent.addChild(effectNode);
            effectNode.setWorldPosition(anchorPos.x, anchorPos.y + 0.5, anchorPos.z);

            // Scale up 9x as requested (previous was 3x)
            effectNode.setScale(9, 9, 9);

            // Destroy after 1.5 seconds as requested
            this.scheduleOnce(() => {
                if (effectNode && effectNode.isValid) {
                    effectNode.destroy();
                }
                if (onComplete) onComplete();
            }, 1.5);
        });
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }

    private getHudTitle(): string {
        if (this._state === BuildingPadState.UPGRADING) {
            const level = this._associatedBuilding?.level || 1;
            return BuildingText.upgradeTitle(this.buildingName, level);
        }
        return BuildingText.buildTitle(this.buildingName);
    }

    private get hudManager(): HUDManager {
        return ServiceRegistry.get<HUDManager>('HUDManager') ?? HUDManager.instance;
    }

    private get gameManager(): GameManager {
        return ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
    }

    private get buildingRegistry(): BuildingRegistry {
        return (
            ServiceRegistry.get<BuildingRegistry>('BuildingRegistry') ?? BuildingRegistry.instance
        );
    }
}
