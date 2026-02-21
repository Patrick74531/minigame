import { _decorator, Node, Vec3 } from 'cc';
import { BuildingPad, BuildingPadState } from './BuildingPad';
import { BuildingFactory } from './BuildingFactory';
import { Building } from './Building';
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
    private static readonly PAD20_UNLOCK_TRIGGER_INDEX = 20;
    private static readonly PAD20_UNLOCK_TARGET_INDEXES = new Set([1, 18, 19]);
    private static readonly PAD20_UNLOCK_TARGET_COST = 20;
    private static readonly PAD_STAGE2_TRIGGER_INDEXES = new Set([1, 18, 19]);
    private static readonly PAD_STAGE2_UNLOCK_TARGET_INDEXES = new Set([14, 15, 16, 17]);
    private static readonly PAD_STAGE2_UNLOCK_TARGET_COST = 40;

    private _pads: BuildingPad[] = [];
    private _activeBuildings: Building[] = [];
    private _heroNode: Node | null = null;
    private _buildingContainer: Node | null = null;
    private _upgradePadsUnlocked: boolean = false;
    private _padNodeToIndex: Map<string, number> = new Map();
    private _stage2PadsUnlocked: boolean = false;

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

        // 监听建造完成事件
        this.eventManager.on(GameEvents.BUILDING_CONSTRUCTED, this.onBuildingConstructed, this);
        this.eventManager.on(GameEvents.BUILDING_DESTROYED, this.onBuildingDestroyed, this);

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
        this._pads = [];
        this._activeBuildings = [];
        this._upgradePadsUnlocked = false;
        this._padNodeToIndex.clear();
        this._stage2PadsUnlocked = false;
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

    public refreshUpgradePadVisibilityGate(): void {
        if (!this._upgradePadsUnlocked && this.areAllTowerPadsBuilt()) {
            this._upgradePadsUnlocked = true;
            console.log('[BuildingManager] 全部塔位建成，开放所有已建建筑升级 pad');
        }

        for (const pad of this._pads) {
            if (!pad || !pad.node || !pad.node.isValid) continue;
            if (pad.state !== BuildingPadState.UPGRADING) continue;
            pad.node.active = this._upgradePadsUnlocked;
        }
    }

    private areAllTowerPadsBuilt(): boolean {
        const towerPads = this._pads.filter(pad =>
            BuildingPadPlacement.isTowerType(pad.buildingTypeId)
        );
        if (towerPads.length <= 0) return true;
        return towerPads.every(pad => pad.state === BuildingPadState.UPGRADING);
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }
}
