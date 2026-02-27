import {
    _decorator,
    Node,
    Material,
    Label,
    BoxCollider,
    ITriggerEvent,
    Vec3,
    RigidBody,
    Prefab,
    resources,
    instantiate,
} from 'cc';
import { Building, BuildingType } from './Building';
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
import { BuildingPadVisuals } from './BuildingPadVisuals';
import { BuildingPadPlacement } from './BuildingPadPlacement';
import { Localization } from '../../core/i18n/Localization';

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
    private static readonly UPGRADE_HEAL_STABILIZE_IMMUNITY_SECONDS = 2.6;
    private static readonly _activePads: Set<BuildingPad> = new Set();
    private static _coopModeEnabled: boolean = false;
    private static _coopHostEnabled: boolean = true;

    /** 每次收集金币数量 */
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

    /** 初始化时特定的覆写花费（如新手福利塔） */
    public overrideCost: number | null = null;

    // 内部状态
    private _config: BuildingTypeConfig | null = null;
    private _collectedCoins: number = 0;
    private _state: BuildingPadState = BuildingPadState.WAITING;
    private _collectTimer: number = 0;
    private _label: Label | null = null;
    private _costLabelNode: Node | null = null;
    private _coinIconNode: Node | null = null;
    private _functionIconNode: Node | null = null;
    private _heroInRange: boolean = false;
    private _heroNode: Node | null = null;
    private _padMaterial: Material | null = null;

    private _initialBuildingTypeId: string = '';
    private _isTowerSlot: boolean = false;
    private _coopPadId: string = '';
    private _towerSelectionPrompted: boolean = false;

    // === Getters ===

    public get state(): BuildingPadState {
        return this._state;
    }

    public get collectedCoins(): number {
        return this._collectedCoins;
    }

    public get nextUpgradeCost(): number {
        return this._nextUpgradeCost;
    }

    public get coopPadId(): string {
        return this._coopPadId || this.node.uuid;
    }

    // requiredCoins getter replaced by dynamic version below

    public get progress(): number {
        if (this.requiredCoins === 0) return 0;
        return this._collectedCoins / this.requiredCoins;
    }

    /**
     * Construction anchor position (world-space), used for build/restore placement.
     */
    public getBuildWorldPosition(): Vec3 {
        return this._originalPosition.clone();
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
        // Capture initial anchor early so restore path can use it even before start().
        this._originalPosition.set(this.node.worldPosition);
        BuildingPad._activePads.add(this);
    }

    // === Physics Implementation ===

    // Flag to track hero presence
    private _heroInArea: boolean = false;
    private _heroRef: Hero | null = null;
    private _heroesInArea: Set<Node> = new Set();
    private _isAnimating: boolean = false; // New flag to block input during animation
    private _buildEmitAttempts: number = 0;
    private _buildAutoRetryRounds: number = 0;

    // Store original spawn position to place the building there.
    private _originalPosition: Vec3 = new Vec3();

    protected start(): void {
        // If pad was already restored with a building (via restoreFromSave),
        // skip the normal offset logic — position was already placed correctly.
        const alreadyRestored = !!this._associatedBuilding;

        // 1. Store Original Position (Where the building should be)
        // Only overwrite if not already captured by initialize() or restore path.
        if (!alreadyRestored) {
            this._originalPosition.set(this.node.worldPosition);
        }

        this.setupPhysics();

        // Previous start logic
        console.debug(
            `[BuildingPad] start() \u88ab\u8c03\u7528, buildingTypeId=${this.buildingTypeId}`
        );

        // Save initial type and check if it is a tower slot
        this._initialBuildingTypeId = this.buildingTypeId;
        this._isTowerSlot = BuildingPadPlacement.isTowerType(this.buildingTypeId);

        const config = this.buildingRegistry.get(this.buildingTypeId);
        this._config = config ?? null;
        if (!this._config) {
            console.error(
                `[BuildingPad] \u672a\u627e\u5230\u5efa\u7b51\u7c7b\u578b: ${this.buildingTypeId}`
            );
            return;
        }

        this.createVisuals();
        if (this.lockWorldPosition && !alreadyRestored) {
            BuildingPadPlacement.applyFixedOffsetFromSpawn(
                this.node,
                this._originalPosition,
                this.collectRadius,
                this.buildingTypeId,
                GameConfig.BUILDING.UPGRADE_PAD.GAP,
                typeId => this.buildingRegistry.get(typeId)?.visual?.scale
            );
        }

        this.eventManager.on(GameEvents.TOWER_SELECTED, this.onTowerSelected, this);

        console.debug(
            `[BuildingPad] 初始化: ${this.buildingName}, 需要 ${this.requiredCoins} 金币`
        );
    }

    protected onDestroy(): void {
        this.eventManager.off(GameEvents.TOWER_SELECTED, this.onTowerSelected, this);
        BuildingPad._activePads.delete(this);
        super.onDestroy();
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
        col.size = new Vec3(2.0, 2.0, 2.0);

        col.setGroup(1 << 2); // BUILDING_PAD
        col.setMask(1 << 0); // Collide with HERO

        col.on('onTriggerEnter', this.onTriggerEnter, this);
        col.on('onTriggerExit', this.onTriggerExit, this);

        console.debug(
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
            this._heroesInArea.add(hero.node);
            this.refreshHeroPresence();

            // Guest in coop mode: no building interaction HUD
            if (BuildingPad._coopModeEnabled && !BuildingPad._coopHostEnabled) return;

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
        let hero = otherNode.getComponent(Hero);
        if (!hero) {
            hero = otherNode.getComponent('Hero') as Hero;
        }
        if (hero) {
            this._heroesInArea.delete(hero.node);
            this.refreshHeroPresence();

            // Hide Info
            if (!this._heroInArea && this.hudManager) {
                this.hudManager.hideBuildingInfo();
            }
        }
    }

    /**
     * Standard Update Loop for Interaction
     */
    protected update(_dt: number): void {
        if (!this.gameManager.isPlaying) return;
        // Guest in coop mode: no local coin collection
        if (BuildingPad._coopModeEnabled && !BuildingPad._coopHostEnabled) return;

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
                this.refreshHeroPresence();
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
     * 创建视觉元素（正方形投放区 + 一行数字/金币）
     */
    private createVisuals(): void {
        const refs = BuildingPadVisuals.createVisuals(
            this.node,
            this.buildingTypeId,
            this.requiredCoins
        );
        this._label = refs.label;
        this._costLabelNode = refs.costLabelNode;
        this._coinIconNode = refs.coinIconNode;
        this._functionIconNode = refs.functionIconNode;
    }

    private updateDisplay(): void {
        BuildingPadVisuals.updateDisplay({
            label: this._label,
            costLabelNode: this._costLabelNode,
            coinIconNode: this._coinIconNode,
            functionIconNode: this._functionIconNode,
            requiredCoins: this.requiredCoins,
            collectedCoins: this._collectedCoins,
            progress: this.progress,
        });
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

        console.debug(
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

        // Use unified upgrade curve, keep legacy fallback for mixed remote caches.
        this._nextUpgradeCost = this.resolveInitialUpgradeCost();

        // Change state AFTER calculation
        this._state = BuildingPadState.UPGRADING;

        // Reset collection for upgrade
        this._collectedCoins = 0;

        // Update Label to show nothing or "Upgrade"
        this.updateDisplay();

        // Recompute with real built footprint even if pad was initially world-locked.
        this.placeUpgradeZoneInFront(building.node, true);

        console.debug(`[BuildingPad] Entered Upgrade Mode. Next Cost: ${this._nextUpgradeCost}`);
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

    public getAssociatedBuilding(): Building | null {
        if (!this._associatedBuilding) return null;
        if (!this._associatedBuilding.node || !this._associatedBuilding.node.isValid) return null;
        return this._associatedBuilding;
    }

    /**
     * 将投放区放到建筑前方，避免与建筑模型重叠
     */
    public placeUpgradeZoneInFront(buildingNode: Node, force: boolean = false): void {
        if (!buildingNode || !buildingNode.isValid) return;
        if (this.lockWorldPosition && !force) return;

        BuildingPadPlacement.placeUpgradeZoneInFront(
            this.node,
            buildingNode,
            this.buildingTypeId,
            this.collectRadius,
            GameConfig.BUILDING.UPGRADE_PAD.GAP
        );

        // Prevent stale in-area state from old position causing accidental collection
        this._heroesInArea.clear();
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

        if (this._state === BuildingPadState.WAITING && !this._associatedBuilding) {
            if (this.overrideCost !== null) {
                return this.overrideCost;
            }

            if (this._isTowerSlot) {
                return this.resolveTowerDefaultBuildCost();
            }
        }

        return this._config?.cost ?? 0;
    }

    /**
     * 尝试从英雄收集金币
     * @param heroCoins 英雄当前持有的金币数
     * @returns 实际收集的金币数
     */
    public tryCollectCoin(heroCoins: number): number {
        // Guest in coop mode cannot deposit coins
        if (BuildingPad._coopModeEnabled && !BuildingPad._coopHostEnabled) return 0;
        if (this._isAnimating) return 0; // Block collection during animation

        if (this._state !== BuildingPadState.WAITING && this._state !== BuildingPadState.UPGRADING)
            return 0;

        if (heroCoins <= 0) return 0;

        const needed = this.requiredCoins - this._collectedCoins;
        const toCollect = Math.min(this.collectRate, heroCoins, needed);

        if (toCollect > 0) {
            this._collectedCoins += toCollect;
            this.updateDisplay();
            const padFilled = this.isComplete && this._isTowerSlot;

            // 检查是否建造/升级完成
            if (this.isComplete) {
                if (this._state === BuildingPadState.WAITING) {
                    // Check logic for Tower Selection
                    if (this._isTowerSlot) {
                        this.enterTowerSelection(!BuildingPad._coopModeEnabled);
                    } else {
                        this.onBuildComplete();
                    }
                } else if (this._state === BuildingPadState.UPGRADING) {
                    this.onUpgradeComplete();
                }
            }

            if (BuildingPad._coopModeEnabled) {
                this.eventManager.emit(GameEvents.COOP_PAD_COIN_DEPOSITED, {
                    padNode: this.node,
                    padId: this.coopPadId,
                    amount: toCollect,
                    remaining: Math.max(0, this.requiredCoins - this._collectedCoins),
                    padFilled,
                    eventType: padFilled ? 'tower_select' : undefined,
                });
            }
        }

        return toCollect;
    }

    private enterTowerSelection(showSelectionPrompt: boolean): void {
        this._state = BuildingPadState.SELECTING;
        if (!showSelectionPrompt) return;
        if (this._towerSelectionPrompted) return;
        this._towerSelectionPrompted = true;
        console.debug(`[BuildingPad] Coins collected for Tower Slot. Requesting Selection...`);
        this.eventManager.emit(GameEvents.REQUEST_TOWER_SELECTION, { padNode: this.node });
    }

    private onTowerSelected(data: { padNode: Node; buildingTypeId: string }): void {
        if (data.padNode !== this.node) return;

        console.debug(`[BuildingPad] Tower Selected: ${data.buildingTypeId}`);

        // Update type and config
        this.buildingTypeId = data.buildingTypeId;
        this._config = this.buildingRegistry.get(this.buildingTypeId) ?? null;
        this._towerSelectionPrompted = false;

        // Switch back to WAITING to check costs again vs collected coins
        this._state = BuildingPadState.WAITING;

        // Update visuals to match new type cost (if different)
        this.updateDisplay();

        // Check if we have enough coins now (if we selected a cheaper or same cost tower)
        if (this.isComplete) {
            this.onBuildComplete();
        } else {
            console.debug(
                `[BuildingPad] Selected tower is more expensive. improved collection needed.`
            );
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

        console.debug(`[BuildingPad] 建造完成: ${this.buildingName}`);

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

        this._associatedBuilding.grantDamageImmunity(
            BuildingPad.UPGRADE_HEAL_STABILIZE_IMMUNITY_SECONDS
        );

        // Wall must remain active during upgrade; disabling it breaks collision continuity and
        // can cause combat-time HP/regen inconsistencies under heavy attacks.
        const shouldHideDuringUpgrade = this._associatedBuilding.buildingType !== BuildingType.WALL;
        if (shouldHideDuringUpgrade) {
            this._associatedBuilding.node.active = false;
        }

        // Play visual effect first
        this.playConstructionEffect(() => {
            if (!this._associatedBuilding) {
                this._isAnimating = false;
                return;
            }

            if (shouldHideDuringUpgrade) {
                this._associatedBuilding.node.active = true;
            }

            // Perform Upgrade
            const upgraded = this._associatedBuilding.upgrade();
            if (!upgraded) {
                this._isAnimating = false;
                return;
            }

            this._associatedBuilding.grantDamageImmunity(
                BuildingPad.UPGRADE_HEAL_STABILIZE_IMMUNITY_SECONDS
            );
            this.forceUpgradeHealthBarResync();

            // Use unified curve, fallback to legacy multipliers.
            const costMult = this.resolveUpgradeCostMultiplier();
            this._nextUpgradeCost = Math.ceil(this._nextUpgradeCost * costMult);

            // Reset
            this._collectedCoins = 0;
            this.updateDisplay();

            this._isAnimating = false;
        });
    }

    /**
     * 某些升级帧序下（尤其是被持续攻击时）血条可视更新可能滞后一帧以上。
     * 这里在升级后的多个短延迟帧强制同步，确保展示为满血。
     */
    private forceUpgradeHealthBarResync(): void {
        if (!this._associatedBuilding) return;
        this._associatedBuilding.restoreToFullHealth();

        const delays = [0, 0.08, 0.2];
        for (const delay of delays) {
            this.scheduleOnce(() => {
                if (!this.node || !this.node.isValid) return;
                if (!this._associatedBuilding || !this._associatedBuilding.node?.isValid) return;
                this._associatedBuilding.restoreToFullHealth();
            }, delay);
        }
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
        this._towerSelectionPrompted = false;

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

    private refreshHeroPresence(): void {
        let fallbackHero: Hero | null = null;
        for (const heroNode of Array.from(this._heroesInArea)) {
            if (!heroNode || !heroNode.isValid) {
                this._heroesInArea.delete(heroNode);
                continue;
            }
            const hero = heroNode.getComponent(Hero);
            if (!hero) {
                this._heroesInArea.delete(heroNode);
                continue;
            }
            if (BuildingPad._coopModeEnabled && !hero.isLocalPlayerHero) {
                continue;
            }
            if (!fallbackHero) {
                fallbackHero = hero;
            }
        }

        this._heroRef = fallbackHero;
        this._heroInArea = !!fallbackHero;
    }

    public applyNetworkCoinDeposit(amount: number): void {
        if (!Number.isFinite(amount) || amount <= 0) return;
        if (this._isAnimating) return;
        if (this._state !== BuildingPadState.WAITING && this._state !== BuildingPadState.UPGRADING)
            return;

        const needed = this.requiredCoins - this._collectedCoins;
        if (needed <= 0) return;
        const applied = Math.min(Math.floor(amount), needed);
        if (applied <= 0) return;

        this._collectedCoins += applied;
        this.updateDisplay();

        if (this.isComplete) {
            if (this._state === BuildingPadState.WAITING) {
                if (this._isTowerSlot) {
                    // In coop mode wait for DECISION_OWNER before showing local selection UI.
                    this.enterTowerSelection(false);
                } else {
                    this.onBuildComplete();
                }
            } else if (this._state === BuildingPadState.UPGRADING) {
                this.onUpgradeComplete();
            }
        }
    }

    public applyDecisionOwner(localPlayerOwnsDecision: boolean): void {
        if (!this._isTowerSlot) return;
        if (this._state !== BuildingPadState.SELECTING) {
            if (!this.isComplete) return;
            this.enterTowerSelection(false);
        }
        if (localPlayerOwnsDecision) {
            this.enterTowerSelection(true);
        }
    }

    public setCoopPadId(padId: string): void {
        this._coopPadId = padId.trim();
    }

    public static findByCoopPadId(padId: string): BuildingPad | null {
        const normalized = padId.trim();
        if (!normalized) return null;

        for (const pad of BuildingPad._activePads) {
            if (!pad || !pad.node || !pad.node.isValid) continue;
            if (pad.coopPadId === normalized || pad.node.uuid === normalized) {
                return pad;
            }
        }
        return null;
    }

    public static setCoopModeEnabled(enabled: boolean): void {
        BuildingPad._coopModeEnabled = enabled;
    }

    /** In coop mode, only the host can interact with pads for building. */
    public static setCoopHostEnabled(enabled: boolean): void {
        BuildingPad._coopHostEnabled = enabled;
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

    private resolveInitialUpgradeCost(): number {
        const unifiedStart = GameConfig.BUILDING.UPGRADE_COST?.START_COST;
        if (typeof unifiedStart === 'number' && Number.isFinite(unifiedStart)) {
            return unifiedStart;
        }

        const legacyStart = GameConfig.BUILDING.BASE_UPGRADE?.START_COST;
        if (typeof legacyStart === 'number' && Number.isFinite(legacyStart)) {
            return legacyStart;
        }

        return 20;
    }

    private resolveUpgradeCostMultiplier(): number {
        const unifiedMultiplier = GameConfig.BUILDING.UPGRADE_COST?.COST_MULTIPLIER;
        if (typeof unifiedMultiplier === 'number' && Number.isFinite(unifiedMultiplier)) {
            return unifiedMultiplier;
        }

        const perBuildingMultiplier = this._associatedBuilding?.upgradeCostMultiplier;
        if (typeof perBuildingMultiplier === 'number' && Number.isFinite(perBuildingMultiplier)) {
            return perBuildingMultiplier;
        }

        const defaultMultiplier = GameConfig.BUILDING.DEFAULT_COST_MULTIPLIER;
        if (typeof defaultMultiplier === 'number' && Number.isFinite(defaultMultiplier)) {
            return defaultMultiplier;
        }

        return 1.35;
    }

    private resolveTowerDefaultBuildCost(): number {
        const unifiedCost = GameConfig.BUILDING.TOWER_DEFAULT_BUILD_COST;
        if (typeof unifiedCost === 'number' && Number.isFinite(unifiedCost)) {
            return unifiedCost;
        }

        const configuredCost = this._config?.cost;
        if (typeof configuredCost === 'number' && Number.isFinite(configuredCost)) {
            return configuredCost;
        }

        return 40;
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }

    private getHudTitle(): string {
        const hudName = this.resolveHudBuildingName();
        if (this._state === BuildingPadState.UPGRADING) {
            const level = this._associatedBuilding?.level || 1;
            return BuildingText.upgradeTitle(hudName, level);
        }
        return BuildingText.buildTitle(hudName);
    }

    private resolveHudBuildingName(): string {
        const typeId = this._associatedBuilding?.buildingTypeId ?? this.buildingTypeId;
        if (BuildingPadPlacement.isTowerType(typeId)) {
            return Localization.instance.t('building.tower.generic.name');
        }
        return this.buildingName;
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
