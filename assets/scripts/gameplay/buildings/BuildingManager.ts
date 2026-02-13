import { _decorator, Node, Vec3 } from 'cc';
import { BuildingPad } from './BuildingPad';
import { BuildingFactory } from './BuildingFactory';
import { Building } from './Building';
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

    private _pads: BuildingPad[] = [];
    private _activeBuildings: Building[] = [];
    private _heroNode: Node | null = null;
    private _buildingContainer: Node | null = null;

    public static get instance(): BuildingManager {
        if (!this._instance) {
            this._instance = new BuildingManager();
        }
        return this._instance;
    }

    private _unitContainer: Node | null = null;

    /**
     * 初始化建造管理器
     */
    public initialize(buildingContainer: Node, unitContainer: Node): void {
        this._buildingContainer = buildingContainer;
        this._unitContainer = unitContainer;
        this._pads = [];

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
    public registerPad(pad: BuildingPad): void {
        this._pads.push(pad);
        if (this._heroNode) {
            pad.setHeroNode(this._heroNode);
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
    }

    public get activeBuildings(): Building[] {
        return this._activeBuildings;
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
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }
}
