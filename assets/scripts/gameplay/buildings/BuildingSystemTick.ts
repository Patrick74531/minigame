import { _decorator, Component } from 'cc';
import { BuildingManager } from './BuildingManager';
import { GameManager } from '../../core/managers/GameManager';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';

const { ccclass } = _decorator;

/**
 * BuildingSystemTick
 * 负责在游戏进行中更新建造系统
 */
@ccclass('BuildingSystemTick')
export class BuildingSystemTick extends Component {
    protected update(dt: number): void {
        if (!this.gameManager.isPlaying) return;
        this.buildingManager.update(dt);
    }

    private get buildingManager(): BuildingManager {
        return ServiceRegistry.get<BuildingManager>('BuildingManager') ?? BuildingManager.instance;
    }

    private get gameManager(): GameManager {
        return ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
    }
}
