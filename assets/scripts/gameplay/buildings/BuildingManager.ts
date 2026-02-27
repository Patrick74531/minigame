import { _decorator, Node, Vec3, tween } from 'cc';
import type { BuildingPadSaveState } from '../../core/managers/GameSaveManager';
import type { BuildStateSnapshot, BuildStatePadSnapshot } from '../../core/runtime/CoopNetManager';
import { BuildingPad, BuildingPadState } from './BuildingPad';
import { BuildingFactory } from './BuildingFactory';
import { Building, BuildingType } from './Building';
import { BuildingPadPlacement } from './BuildingPadPlacement';
import { EventManager } from '../../core/managers/EventManager';
import { GameEvents } from '../../data/GameEvents';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import { GameManager } from '../../core/managers/GameManager';

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
    private static readonly INTER_WAVE_TOWER_HEAL_PERCENT_PER_SECOND =
        BuildingManager.INTER_WAVE_WALL_HEAL_PERCENT_PER_SECOND * 0.5;
    private static readonly TOWER_BUILDING_TYPES = new Set<BuildingType>([
        BuildingType.TOWER,
        BuildingType.FROST_TOWER,
        BuildingType.LIGHTNING_TOWER,
    ]);

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

        console.debug('[BuildingManager] 初始化完成');
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
            const normalizedIndex = Math.floor(runtimeIndex);
            this._padNodeToIndex.set(pad.node.uuid, normalizedIndex);
            pad.setCoopPadId(String(normalizedIndex));
        }
    }

    public get isInterWaveWaiting(): boolean {
        return this._isInterWaveWaiting;
    }

    /** 仅执行波间回血（供 BuildingSystemTick 在 isPlaying=false 时调用） */
    public tickInterWaveHeal(dt: number): void {
        this.healStructuresDuringInterWave(dt);
    }

    /**
     * 每帧更新
     */
    public update(_dt: number): void {
        // Logic moved to BuildingPad.onTriggerStay (Physics System)
        this.healStructuresDuringInterWave(_dt);
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

        console.debug(`[BuildingManager] 建造完成: ${data.buildingTypeId}`);

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

    public getPadByCoopPadId(padId: string): BuildingPad | null {
        return BuildingPad.findByCoopPadId(padId);
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

    private healStructuresDuringInterWave(dt: number): void {
        if (!this._isInterWaveWaiting) return;
        if (!Number.isFinite(dt) || dt <= 0) return;

        const wallHealPercentPerSecond = BuildingManager.INTER_WAVE_WALL_HEAL_PERCENT_PER_SECOND;
        const towerHealPercentPerSecond = BuildingManager.INTER_WAVE_TOWER_HEAL_PERCENT_PER_SECOND;
        if (wallHealPercentPerSecond <= 0 && towerHealPercentPerSecond <= 0) return;
        const targetTypes = new Set<BuildingType>([
            BuildingType.WALL,
            ...BuildingManager.TOWER_BUILDING_TYPES,
        ]);
        const buildingSet = new Map<string, Building>();

        for (const pad of this._pads) {
            const building = pad?.getAssociatedBuilding();
            if (!building || !building.node || !building.node.isValid) continue;
            if (!targetTypes.has(building.buildingType)) continue;
            buildingSet.set(building.node.uuid, building);
        }
        for (const building of this._activeBuildings) {
            if (!building || !building.node || !building.node.isValid) continue;
            if (!targetTypes.has(building.buildingType)) continue;
            buildingSet.set(building.node.uuid, building);
        }
        for (const node of this.gameManager.activeBuildings) {
            if (!node || !node.isValid) continue;
            const building = node.getComponent(Building);
            if (!building || !building.node || !building.node.isValid) continue;
            if (!targetTypes.has(building.buildingType)) continue;
            buildingSet.set(building.node.uuid, building);
        }

        for (const building of buildingSet.values()) {
            if (!building.isAlive) continue;
            if (building.currentHp >= building.maxHp) continue;

            if (building.buildingType === BuildingType.WALL) {
                if (wallHealPercentPerSecond > 0) {
                    building.heal(building.maxHp * wallHealPercentPerSecond * dt);
                }
                continue;
            }

            if (BuildingManager.TOWER_BUILDING_TYPES.has(building.buildingType)) {
                if (towerHealPercentPerSecond > 0) {
                    building.heal(building.maxHp * towerHealPercentPerSecond * dt);
                }
            }
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
                if (visible && pad.state === BuildingPadState.UPGRADING) {
                    // Mid-support prebuilt buildings are hidden until reveal;
                    // resnap once when shown so new-game layout matches continue-game restore.
                    pad.placeUpgradeZoneInFront(building.node, true);
                }
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
            console.debug('[BuildingManager] 全部塔位建成，开放所有已建建筑升级 pad');
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
            // Skip hidden buildings (e.g. farm/barracks not yet revealed by cinematic)
            if (!building.node.active) continue;
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
            let building = pad.getAssociatedBuilding();

            // For prebuilt pads (wall/barracks/farm), building may already exist.
            // For regular pads, create from save if missing.
            if (!building) {
                const pos = pad.getBuildWorldPosition();
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

                building = buildingNode.getComponent(Building);
                if (!building) {
                    buildingNode.destroy();
                    continue;
                }
            }

            if (state.level > 1) building.restoreToLevel(state.level);
            building.currentHp = Math.max(1, Math.floor(state.hpRatio * building.maxHp));
            building.node.active = true;

            if (!this._activeBuildings.includes(building)) {
                this._activeBuildings.push(building);
            }
            pad.initForExistingBuilding(building, state.nextUpgradeCost);
            pad.placeUpgradeZoneInFront(building.node, true);
            pad.node.active = false;

            this.tryUnlockPadsAfterTriggerBuild(pad.node);
        }

        // If mid-support buildings were already present in save, keep them visible after restore
        // instead of waiting for another inter-wave cinematic cycle.
        const hasMidSupportInSave = states.some(
            s => s.buildingTypeId === 'farm' || s.buildingTypeId === 'barracks'
        );
        if (hasMidSupportInSave) {
            this._midSupportBuildingsRevealed = true;
            this._midUpgradePadsUnlockedAfterCinematic = true;
            this._stage3SequenceTriggered = true;
            for (const pad of this._pads) {
                if (!pad || !pad.node || !pad.node.isValid) continue;
                if (!BuildingManager.MID_SUPPORT_BUILDING_TYPES.has(pad.buildingTypeId)) continue;
                const support = pad.getAssociatedBuilding();
                if (support?.node?.isValid) {
                    support.node.active = true;
                }
            }
        }

        this.refreshUpgradePadVisibilityGate();
    }

    // ── 双人权威建造快照（房客侧应用） ─────────────────────────────

    private _lastAppliedBuildVersion: number = -1;

    /**
     * 房客侧：接收房主的权威建造快照并幂等地纠偏本地建筑状态。
     * - 缺失的建筑→补建
     * - 属性不一致→覆盖（等级/血量/升级费用）
     * - 多余的建筑→移除（极端边界情况）
     * - 版本号递增防止旧快照覆盖新状态
     */
    public applyAuthoritativeSnapshot(snapshot: BuildStateSnapshot): void {
        if (!snapshot || typeof snapshot.version !== 'number') return;
        if (snapshot.version <= this._lastAppliedBuildVersion) return;
        this._lastAppliedBuildVersion = snapshot.version;

        // Index local pads by coopPadId
        const padMap = new Map<string, BuildingPad>();
        for (const pad of this._pads) {
            if (!pad || !pad.node || !pad.node.isValid) continue;
            padMap.set(pad.coopPadId, pad);
        }

        for (const data of snapshot.pads) {
            const pad = padMap.get(data.padId);
            if (!pad) continue;

            const localBuilding = pad.getAssociatedBuilding();

            if (data.level > 0) {
                // Snapshot says a building should exist
                if (!localBuilding) {
                    // Need to create building from snapshot
                    this.createBuildingFromSnapshotData(pad, data);
                } else {
                    // Building exists — reconcile level & HP
                    if (localBuilding.level < data.level) {
                        localBuilding.restoreToLevel(data.level);
                    }
                    if (data.hpRatio >= 0 && data.hpRatio <= 1) {
                        const targetHp = Math.max(
                            1,
                            Math.floor(data.hpRatio * localBuilding.maxHp)
                        );
                        if (Math.abs(localBuilding.currentHp - targetHp) > 1) {
                            localBuilding.currentHp = targetHp;
                        }
                    }
                }
            } else {
                // Snapshot says no building — if local has one, remove it (edge case)
                if (localBuilding && localBuilding.node && localBuilding.node.isValid) {
                    this.unregisterBuilding(localBuilding);
                    localBuilding.node.destroy();
                    pad.reset();
                }
            }
        }

        this.refreshUpgradePadVisibilityGate();
    }

    /**
     * Create a building on a pad from an authoritative snapshot entry.
     * Similar to restoreFromSave logic but driven by coop snapshot.
     */
    private createBuildingFromSnapshotData(pad: BuildingPad, data: BuildStatePadSnapshot): void {
        if (!this._buildingContainer) return;

        const pos = pad.getBuildWorldPosition();
        const angle = pad.node.eulerAngles.y;

        const buildingNode = BuildingFactory.createBuilding(
            this._buildingContainer,
            pos.x,
            pos.z,
            data.buildingTypeId,
            this._unitContainer ?? undefined,
            angle
        );
        if (!buildingNode) return;

        const building = buildingNode.getComponent(Building);
        if (!building) {
            buildingNode.destroy();
            return;
        }

        if (data.level > 1) building.restoreToLevel(data.level);
        if (data.hpRatio >= 0 && data.hpRatio <= 1) {
            building.currentHp = Math.max(1, Math.floor(data.hpRatio * building.maxHp));
        }
        building.node.active = true;

        if (!this._activeBuildings.includes(building)) {
            this._activeBuildings.push(building);
        }
        pad.initForExistingBuilding(building, data.nextUpgradeCost);
        pad.placeUpgradeZoneInFront(building.node, true);

        this.tryUnlockPadsAfterTriggerBuild(pad.node);
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }

    private get gameManager(): GameManager {
        return ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
    }
}
