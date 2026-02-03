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
        EventManager.instance.on(GameEvents.BUILDING_CONSTRUCTED, this.onBuildingConstructed, this);

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
    public update(dt: number): void {
        if (!this._heroNode || !this._heroNode.isValid) return;

        this._collectTimer += dt;
        if (this._collectTimer < 0.1) return;
        this._collectTimer = 0;

        const heroComp = this._heroNode.getComponent(Hero);
        if (!heroComp) return;

        let nearestPad: BuildingPad | null = null;

        // 检查每个建造点
        for (const pad of this._pads) {
            if (!pad.node.isValid) continue;
            if (pad.isComplete) continue;

            // 检查英雄是否在范围内
            if (pad.checkHeroInRange()) {
                nearestPad = pad;
                
                // 尝试收集金币
                const collected = pad.tryCollectCoin(heroComp.coinCount);
                if (collected > 0) {
                    heroComp.removeCoin(collected);
                    // 更新 HUD
                    HUDManager.instance.updateCoinDisplay(heroComp.coinCount);
                }
            }
        }

        // 更新 HUD 建造点信息
        if (nearestPad) {
            console.log(`[BuildingManager] 显示建造信息: ${nearestPad.buildingName}`);
            HUDManager.instance.showBuildingInfo(
                nearestPad.buildingName,
                nearestPad.requiredCoins,
                nearestPad.collectedCoins
            );
        } else {
            HUDManager.instance.hideBuildingInfo();
        }
    }

    /**
     * 建造完成处理
     */
    private onBuildingConstructed(data: { padNode: Node; buildingTypeId: string; position: Vec3 }): void {
        console.log(`[BuildingManager] 建造完成: ${data.buildingTypeId}`);

        // 根据建筑类型创建建筑
        if (this._buildingContainer) {
            switch (data.buildingTypeId) {
                case 'barracks':
                    const buildingNode = BuildingFactory.createBarracks(
                        this._buildingContainer,
                        data.position.x,
                        data.position.z // 使用 Z 轴
                    );
                    
                    // 设置建筑依赖
                    const buildingComp = buildingNode.getComponent(Building);
                    if (buildingComp && this._unitContainer) {
                        buildingComp.setUnitContainer(this._unitContainer);
                    }
                    break;
                // 可扩展其他建筑类型
                default:
                    console.log(`[BuildingManager] 未实现的建筑类型: ${data.buildingTypeId}`);
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
        EventManager.instance.off(GameEvents.BUILDING_CONSTRUCTED, this.onBuildingConstructed, this);
        this._pads = [];
    }

    /**
     * 获取所有建造点
     */
    public get pads(): BuildingPad[] {
        return this._pads;
    }
}
