import { _decorator, Node, Vec3, tween } from 'cc';
import type { BuildingPadSaveState } from '../../core/managers/GameSaveManager';
import { BuildingPad, BuildingPadState } from './BuildingPad';
import { BuildingFactory } from './BuildingFactory';
import { Building, BuildingType } from './Building';
import { BuildingPadPlacement } from './BuildingPadPlacement';
import { EventManager } from '../../core/managers/EventManager';
import { GameEvents } from '../../data/GameEvents';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';

const { ccclass } = _decorator;

/**
 * 建造管理器
 * 管理所有建造点，协调建筑生成
 */
@ccclass('BuildingManager')
export class BuildingManager {
    private static _instance: BuildingManager | null = null;
    private static readonly PAD20_UNLOCK_TRIGGER_INDEX = 19;
    private static readonly PAD20_UNLOCK_TARGET_INDEXES = new Set([1, 17, 18]);
    private static readonly PAD20_UNLOCK_TARGET_COST = 20;
    private static readonly PAD_STAGE2_TRIGGER_INDEXES = new Set([1, 17, 18]);
    private static readonly PAD_STAGE2_UNLOCK_TARGET_INDEXES = new Set([14, 15, 16, 21]);
    private static readonly PAD_STAGE2_UNLOCK_TARGET_COST = 40;
    private static readonly PAD_STAGE3_TRIGGER_INDEXES = new Set([14, 15, 16, 17]);
    private static readonly MID_SUPPORT_BUILDING_TYPES = new Set(['barracks', 'farm']);
    private static readonly MID_SUPPORT_REVEAL_ORDER: ReadonlyArray<'farm' | 'barracks'> = [
        'farm',
        'barracks',
    ];
    private static readonly MID_SUPPORT_REVEAL_INTERVAL_SECONDS = 1;
    private static readonly MID_SUPPORT_CINEMATIC_HOLD_SECONDS = 3;
    private static readonly INTER_WAVE_WALL_HEAL_PERCENT_PER_SECOND = 0.05;

    private _pads: BuildingPad[] = [];
    private _activeBuildings: Building[] = [];
    private _heroNode: Node | null = null;
    private _buildingContainer: Node | null = null;
    private _upgradePadsUnlocked: boolean = false;
    private _padNodeToIndex: Map<string, number> = new Map();
    private _stage2PadsUnlocked: boolean = false;
    private _stage3PadsBuilt: boolean = false;
    private _isInterWaveWaiting: boolean = false;
    private _stage3SequenceTriggered: boolean = false;
    private _midSupportBuildingsRevealed: boolean = false;
    private _midSupportRevealToken: number = 0;
    private _midUpgradePadsUnlockedAfterCinematic: boolean = false;

    public static get instance(): BuildingManager {
        if (!this._instance) {
            this._instance = new BuildingManager();
        }
        return this._instance;
    }

    public static destroyInstance(): void {
        this._instance = null;
    }

    private _unitContainer: Node | null = null;

    /**
     * 初始化建造管理器
     */
    public initialize(buildingContainer: Node, unitContainer: Node): void {
        this._buildingContainer = buildingContainer;
        this._unitContainer = unitContainer;
        this._pads = [];
        this._upgradePadsUnlocked = false;
        this._padNodeToIndex.clear();
        this._stage2PadsUnlocked = false;
        this._stage3PadsBuilt = false;
        this._isInterWaveWaiting = false;
        this._stage3SequenceTriggered = false;
        this._midSupportBuildingsRevealed = false;
        this._midSupportRevealToken = 0;
        this._midUpgradePadsUnlockedAfterCinematic = false;

        // 监听建造完成事件
        this.eventManager.on(GameEvents.BUILDING_CONSTRUCTED, this.onBuildingConstructed, this);
        this.eventManager.on(GameEvents.BUILDING_DESTROYED, this.onBuildingDestroyed, this);
        this.eventManager.on(GameEvents.WAVE_START, this.onWaveStart, this);
        this.eventManager.on(GameEvents.WAVE_COMPLETE, this.onWaveComplete, this);
        this.eventManager.on(
            GameEvents.MID_SUPPORT_REVEAL_CINEMATIC_FOCUS_REACHED,
            this.onMidSupportRevealCinematicFocusReached,
            this
        );
        this.eventManager.on(
            GameEvents.MID_SUPPORT_REVEAL_CINEMATIC_FINISHED,
            this.onMidSupportRevealCinematicFinished,
            this
        );

        console.log('[BuildingManager] 初始化完成');
    }

    /**
     * 设置英雄节点
     */
    public setHeroNode(hero: Node): void {
        this._heroNode = hero;
        // 更新所有建造点的英雄引用
        for (const pad of this._pads) {
            pad.setHeroNode(hero);
        }
    }

    /**
     * 注册建造点
     */
    public registerPad(pad: BuildingPad, runtimeIndex?: number): void {
        this._pads.push(pad);
        if (this._heroNode) {
            pad.setHeroNode(this._heroNode);
        }
        if (typeof runtimeIndex === 'number' && Number.isFinite(runtimeIndex)) {
            this._padNodeToIndex.set(pad.node.uuid, Math.floor(runtimeIndex));
        }
    }

    /**
     * 每帧更新
     */
    public update(_dt: number): void {
        // Logic moved to BuildingPad.onTriggerStay (Physics System)
        this.healWallsDuringInterWave(_dt);
    }

    /**
     * 建造完成处理
     */
    private onBuildingConstructed(data: {
        padNode: Node;
        buildingTypeId?: string;
        position?: Vec3;
    }): void {
        const pad = data.padNode.getComponent(BuildingPad);

        if (!data.buildingTypeId || !data.position) {
            console.warn('[BuildingManager] Missing data in BUILDING_CONSTRUCTED event');
            pad?.onBuildFailed('missing building data');
            return;
        }

        console.log(`[BuildingManager] 建造完成: ${data.buildingTypeId}`);

        // Find the Pad Component
        if (!pad) {
            console.error('[BuildingManager] Pad component missing on constructed event node');
            return;
        }

        if (!this._buildingContainer) {
            console.error('[BuildingManager] Building container is not initialized');
            pad.onBuildFailed('building container unavailable');
            return;
        }

        // 根据建筑类型创建建筑
        const angle = data.padNode.eulerAngles.y;
        const buildingNode = BuildingFactory.createBuilding(
            this._buildingContainer,
            data.position.x,
            data.position.z,
            data.buildingTypeId,
            this._unitContainer || undefined,
            angle
        );

        if (!buildingNode) {
            console.error(
                `[BuildingManager] Failed to create building for type: ${data.buildingTypeId}`
            );
            pad.onBuildFailed(`createBuilding returned null for ${data.buildingTypeId}`);
            return;
        }

        const buildingComp = buildingNode.getComponent(Building);
        if (!buildingComp) {
            console.error(
                `[BuildingManager] Missing Building component on created node: ${data.buildingTypeId}`
            );
            pad.onBuildFailed('created node missing Building component');
            return;
        }

        this._activeBuildings.push(buildingComp);

        // Link Building back to Pad for upgrades
        pad.onBuildingCreated(buildingComp);
        pad.placeUpgradeZoneInFront(buildingNode);
        this.tryUnlockPadsAfterTriggerBuild(data.padNode);
        this.refreshUpgradePadVisibilityGate();

        // DO NOT Destroy Pad. It persists for upgrades.
        // data.padNode.destroy();

        // DO NOT Remove from list.
        /*
        const idx = this._pads.findIndex(p => p.node === data.padNode);
        if (idx !== -1) {
            this._pads.splice(idx, 1);
        }
        */
    }

    /**
     * 清理
     */
    public cleanup(): void {
        this.eventManager.off(GameEvents.BUILDING_CONSTRUCTED, this.onBuildingConstructed, this);
        this.eventManager.off(GameEvents.BUILDING_DESTROYED, this.onBuildingDestroyed, this);
        this.eventManager.off(GameEvents.WAVE_START, this.onWaveStart, this);
        this.eventManager.off(GameEvents.WAVE_COMPLETE, this.onWaveComplete, this);
        this.eventManager.off(
            GameEvents.MID_SUPPORT_REVEAL_CINEMATIC_FOCUS_REACHED,
            this.onMidSupportRevealCinematicFocusReached,
            this
        );
        this.eventManager.off(
            GameEvents.MID_SUPPORT_REVEAL_CINEMATIC_FINISHED,
            this.onMidSupportRevealCinematicFinished,
            this
        );
        this._pads = [];
        this._activeBuildings = [];
        this._upgradePadsUnlocked = false;
        this._padNodeToIndex.clear();
        this._stage2PadsUnlocked = false;
        this._stage3PadsBuilt = false;
        this._isInterWaveWaiting = false;
        this._stage3SequenceTriggered = false;
        this._midSupportBuildingsRevealed = false;
        this._midSupportRevealToken += 1;
        this._midUpgradePadsUnlockedAfterCinematic = false;
    }

    public get activeBuildings(): Building[] {
        return this._activeBuildings;
    }

    public get unitContainer(): Node | null {
        return this._unitContainer;
    }

    public unregisterBuilding(building: Building): void {
        const idx = this._activeBuildings.indexOf(building);
        if (idx !== -1) {
            this._activeBuildings.splice(idx, 1);
        }
    }

    /**
     * 获取所有建造点
     */
    public get pads(): BuildingPad[] {
        return this._pads;
    }

    private onBuildingDestroyed(data: { buildingId: string; building?: unknown }): void {
        if (data.building instanceof Building) {
            this.unregisterBuilding(data.building);
        }

        if (!data.buildingId) return;

        for (const pad of this._pads) {
            if (!pad || !pad.node || !pad.node.isValid) continue;
            if (pad.onAssociatedBuildingDestroyed(data.buildingId)) {
                // 建筑被摧毁后，恢复该点位为“可重建”状态并立即显示建造 pad。
                pad.node.active = true;
                break;
            }
        }
        this.refreshUpgradePadVisibilityGate();
    }

    private tryUnlockPadsAfterTriggerBuild(triggerPadNode: Node): void {
        const builtPadIndex = this._padNodeToIndex.get(triggerPadNode.uuid);
        if (builtPadIndex === BuildingManager.PAD20_UNLOCK_TRIGGER_INDEX) {
            this.activatePadsByIndexes(
                BuildingManager.PAD20_UNLOCK_TARGET_INDEXES,
                BuildingManager.PAD20_UNLOCK_TARGET_COST
            );
        }

        if (
            !this._stage2PadsUnlocked &&
            this.areIndexedPadsBuilt(BuildingManager.PAD_STAGE2_TRIGGER_INDEXES)
        ) {
            this._stage2PadsUnlocked = true;
            this.activatePadsByIndexes(
                BuildingManager.PAD_STAGE2_UNLOCK_TARGET_INDEXES,
                BuildingManager.PAD_STAGE2_UNLOCK_TARGET_COST
            );
        }

        if (
            !this._stage3PadsBuilt &&
            this.areIndexedPadsBuilt(BuildingManager.PAD_STAGE3_TRIGGER_INDEXES)
        ) {
            this._stage3PadsBuilt = true;
        }

        this.tryTriggerMidSupportRevealSequence();
    }

    private activatePadsByIndexes(indexes: ReadonlySet<number>, overrideCost?: number): void {
        for (const pad of this._pads) {
            if (!pad || !pad.node || !pad.node.isValid) continue;
            const idx = this._padNodeToIndex.get(pad.node.uuid);
            if (idx === undefined || !indexes.has(idx)) continue;
            if (typeof overrideCost === 'number') {
                pad.overrideCost = overrideCost;
            }
            pad.node.active = true;
        }
    }

    private areIndexedPadsBuilt(indexes: ReadonlySet<number>): boolean {
        for (const targetIndex of indexes) {
            let matchedPad: BuildingPad | null = null;
            for (const pad of this._pads) {
                if (!pad || !pad.node || !pad.node.isValid) continue;
                const idx = this._padNodeToIndex.get(pad.node.uuid);
                if (idx === targetIndex) {
                    matchedPad = pad;
                    break;
                }
            }
            if (!matchedPad || matchedPad.state !== BuildingPadState.UPGRADING) {
                return false;
            }
        }
        return true;
    }

    private onWaveStart(): void {
        this._isInterWaveWaiting = false;
    }

    private onWaveComplete(): void {
        this._isInterWaveWaiting = true;
        this.tryTriggerMidSupportRevealSequence();
    }

    private healWallsDuringInterWave(dt: number): void {
        if (!this._isInterWaveWaiting) return;
        if (!Number.isFinite(dt) || dt <= 0) return;

        const healPercentPerSecond = BuildingManager.INTER_WAVE_WALL_HEAL_PERCENT_PER_SECOND;
        if (healPercentPerSecond <= 0) return;

        for (const pad of this._pads) {
            const building = pad?.getAssociatedBuilding();
            if (!building || !building.node || !building.node.isValid) continue;
            if (!building.isAlive) continue;
            if (building.buildingType !== BuildingType.WALL) continue;
            if (building.currentHp >= building.maxHp) continue;

            building.heal(building.maxHp * healPercentPerSecond * dt);
        }
    }

    private tryTriggerMidSupportRevealSequence(): void {
        if (this._stage3SequenceTriggered) return;
        if (!this._stage3PadsBuilt) return;
        if (!this._isInterWaveWaiting) return;

        this._stage3SequenceTriggered = true;
        const focusPosition = this.resolveMidSupportFocusPosition();
        if (!focusPosition) {
            this.unlockMidUpgradePadsAfterSupportCinematic();
            return;
        }

        this.hideMidSupportBuildingsBeforeCinematic();

        if (!this.eventManager.hasListeners(GameEvents.MID_SUPPORT_REVEAL_CINEMATIC)) {
            this.onMidSupportRevealCinematicFocusReached();
            const token = this._midSupportRevealToken;
            tween({})
                .delay(BuildingManager.MID_SUPPORT_CINEMATIC_HOLD_SECONDS)
                .call(() => {
                    if (token !== this._midSupportRevealToken) return;
                    this.onMidSupportRevealCinematicFinished();
                })
                .start();
            return;
        }

        this.eventManager.emit(GameEvents.MID_SUPPORT_REVEAL_CINEMATIC, {
            focusPosition,
            holdSeconds: BuildingManager.MID_SUPPORT_CINEMATIC_HOLD_SECONDS,
        });
    }

    private resolveMidSupportFocusPosition(): Vec3 | null {
        const focusSum = new Vec3();
        const samplePos = new Vec3();
        let focusCount = 0;

        for (const pad of this._pads) {
            if (!pad || !pad.node || !pad.node.isValid) continue;
            if (!BuildingManager.MID_SUPPORT_BUILDING_TYPES.has(pad.buildingTypeId)) continue;

            const building = pad.getAssociatedBuilding();
            if (building?.node?.isValid) {
                building.node.getWorldPosition(samplePos);
            } else {
                pad.node.getWorldPosition(samplePos);
            }
            focusSum.add(samplePos);
            focusCount += 1;
        }

        if (focusCount <= 0) return null;
        focusSum.multiplyScalar(1 / focusCount);
        return focusSum;
    }

    private hideMidSupportBuildingsBeforeCinematic(): void {
        for (const typeId of BuildingManager.MID_SUPPORT_REVEAL_ORDER) {
            this.setMidSupportBuildingVisible(typeId, false);
        }
    }

    private onMidSupportRevealCinematicFocusReached(): void {
        if (!this._stage3SequenceTriggered || this._midSupportBuildingsRevealed) return;

        this._midSupportBuildingsRevealed = true;
        const token = ++this._midSupportRevealToken;
        const [firstType, secondType] = BuildingManager.MID_SUPPORT_REVEAL_ORDER;

        this.setMidSupportBuildingVisible(firstType, true);
        tween({})
            .delay(BuildingManager.MID_SUPPORT_REVEAL_INTERVAL_SECONDS)
            .call(() => {
                if (token !== this._midSupportRevealToken) return;
                this.setMidSupportBuildingVisible(secondType, true);
            })
            .start();
    }

    private setMidSupportBuildingVisible(typeId: string, visible: boolean): void {
        for (const pad of this._pads) {
            if (!pad || !pad.node || !pad.node.isValid) continue;
            if (pad.buildingTypeId !== typeId) continue;

            const building = pad.getAssociatedBuilding();
            if (building?.node?.isValid) {
                building.node.active = visible;
            }

            if (
                pad.state === BuildingPadState.UPGRADING &&
                !this._midUpgradePadsUnlockedAfterCinematic
            ) {
                pad.node.active = false;
            } else if (!building && visible) {
                pad.node.active = true;
            }
        }
    }

    private onMidSupportRevealCinematicFinished(): void {
        if (!this._midSupportBuildingsRevealed) {
            this.onMidSupportRevealCinematicFocusReached();
        }
        this.unlockMidUpgradePadsAfterSupportCinematic();
    }

    private unlockMidUpgradePadsAfterSupportCinematic(): void {
        if (this._midUpgradePadsUnlockedAfterCinematic) return;
        this._midUpgradePadsUnlockedAfterCinematic = true;
        this.refreshUpgradePadVisibilityGate();
    }

    public refreshUpgradePadVisibilityGate(): void {
        if (!this._upgradePadsUnlocked && this.areAllTowerPadsBuilt()) {
            this._upgradePadsUnlocked = true;
            console.log('[BuildingManager] 全部塔位建成，开放所有已建建筑升级 pad');
        }

        for (const pad of this._pads) {
            if (!pad || !pad.node || !pad.node.isValid) continue;
            if (pad.state !== BuildingPadState.UPGRADING) continue;
            pad.node.active =
                this._upgradePadsUnlocked || this._midUpgradePadsUnlockedAfterCinematic;
        }
    }

    private areAllTowerPadsBuilt(): boolean {
        const towerPads = this._pads.filter(pad =>
            BuildingPadPlacement.isTowerType(pad.buildingTypeId)
        );
        if (towerPads.length <= 0) return true;
        return towerPads.every(pad => pad.state === BuildingPadState.UPGRADING);
    }

    // ── 存档快照 ─────────────────────────────────────────────────

    /**
     * 收集所有已建建筑的存档状态（用于快照保存）
     */
    public getSnapshot(): BuildingPadSaveState[] {
        const states: BuildingPadSaveState[] = [];
        for (const pad of this._pads) {
            if (!pad || !pad.node || !pad.node.isValid) continue;
            const building = pad.getAssociatedBuilding();
            if (!building) continue;
            const padIndex = this._padNodeToIndex.get(pad.node.uuid);
            if (padIndex === undefined) continue;
            states.push({
                padIndex,
                buildingTypeId: building.buildingTypeId,
                level: building.level,
                hpRatio: Math.max(0, building.currentHp / Math.max(1, building.maxHp)),
                nextUpgradeCost: pad.nextUpgradeCost,
            });
        }
        return states;
    }

    /**
     * 从存档恢复所有建筑（在 SpawnBootstrap.spawnPads 之后调用）
     */
    public restoreFromSave(states: BuildingPadSaveState[]): void {
        if (!states || states.length === 0) return;

        const indexToPad = new Map<number, BuildingPad>();
        for (const pad of this._pads) {
            if (!pad || !pad.node || !pad.node.isValid) continue;
            const idx = this._padNodeToIndex.get(pad.node.uuid);
            if (idx !== undefined) indexToPad.set(idx, pad);
        }

        for (const state of states) {
            const pad = indexToPad.get(state.padIndex);
            if (!pad || !pad.node || !pad.node.isValid) continue;
            if (pad.getAssociatedBuilding()) continue;

            const pos = pad.node.worldPosition;
            const angle = pad.node.eulerAngles.y;

            const buildingNode = BuildingFactory.createBuilding(
                this._buildingContainer!,
                pos.x,
                pos.z,
                state.buildingTypeId,
                this._unitContainer ?? undefined,
                angle
            );
            if (!buildingNode) continue;

            const building = buildingNode.getComponent(Building);
            if (!building) {
                buildingNode.destroy();
                continue;
            }

            if (state.level > 1) building.restoreToLevel(state.level);
            building.currentHp = Math.max(1, Math.floor(state.hpRatio * building.maxHp));

            this._activeBuildings.push(building);
            pad.initForExistingBuilding(building, state.nextUpgradeCost);
            pad.placeUpgradeZoneInFront(buildingNode, true);
            pad.node.active = false;

            this.tryUnlockPadsAfterTriggerBuild(pad.node);
        }

        this.refreshUpgradePadVisibilityGate();
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }
}
