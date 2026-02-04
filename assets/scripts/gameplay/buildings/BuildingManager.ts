import { _decorator, Node, Vec3 } from 'cc';
import { BuildingPad } from './BuildingPad';
import { BuildingRegistry } from './BuildingRegistry';
import { BuildingFactory } from './BuildingFactory';
import { Building } from './Building';
import { EventManager } from '../../core/managers/EventManager';
import { GameEvents } from '../../data/GameEvents';
import { Hero } from '../units/Hero';
import { HUDManager } from '../../ui/HUDManager';

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
    private _collectTimer: number = 0;

    public static get instance(): BuildingManager {
        if (!this._instance) {
            this._instance = new BuildingManager();
        }
        return this._instance;
    }

    /**
     * 初始化建造管理器
     */
    private _unitContainer: Node | null = null;

    // ... (keep usage of _buildingContainer)

    /**
     * 初始化建造管理器
     */
    public initialize(buildingContainer: Node, unitContainer: Node): void {
        this._buildingContainer = buildingContainer;
        this._unitContainer = unitContainer;
        this._pads = [];

        // 监听建造完成事件
        // 监听建造完成事件
        EventManager.instance.on(GameEvents.BUILDING_CONSTRUCTED, this.onBuildingConstructed, this);
        EventManager.instance.on(GameEvents.BUILDING_DESTROYED, this.onBuildingDestroyed, this);

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
    /**
     * 每帧更新
     */
    public update(dt: number): void {
        // Logic moved to BuildingPad.onTriggerStay (Physics System)
    }

    /**
     * 建造完成处理
     */
    private onBuildingConstructed(data: {
        padNode: Node;
        buildingTypeId: string;
        position: Vec3;
    }): void {
        console.log(`[BuildingManager] 建造完成: ${data.buildingTypeId}`);

        // 根据建筑类型创建建筑
        if (this._buildingContainer) {
            const buildingNode = BuildingFactory.createBuilding(
                this._buildingContainer,
                data.position.x,
                data.position.z,
                data.buildingTypeId,
                this._unitContainer || undefined
            );

            if (!buildingNode) {
                console.error(
                    `[BuildingManager] Failed to create building for type: ${data.buildingTypeId}`
                );
            } else {
                const buildingComp = buildingNode.getComponent(Building);
                if (buildingComp) {
                    this._activeBuildings.push(buildingComp);
                }
            }
        }

        // 销毁建造点
        data.padNode.destroy();

        // 从列表中移除
        const idx = this._pads.findIndex(p => p.node === data.padNode);
        if (idx !== -1) {
            this._pads.splice(idx, 1);
        }
    }

    /**
     * 清理
     */
    public cleanup(): void {
        EventManager.instance.off(
            GameEvents.BUILDING_CONSTRUCTED,
            this.onBuildingConstructed,
            this
        );
        EventManager.instance.off(GameEvents.BUILDING_DESTROYED, this.onBuildingDestroyed, this);
        EventManager.instance.off(
            GameEvents.BUILDING_CONSTRUCTED,
            this.onBuildingConstructed,
            this
        );
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

    private onBuildingDestroyed(data: { building: Building }): void {
        this.unregisterBuilding(data.building);
    }
}
