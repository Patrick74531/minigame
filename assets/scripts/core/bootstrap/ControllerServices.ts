import { ServiceRegistry } from '../managers/ServiceRegistry';
import { EventManager } from '../managers/EventManager';
import { GameManager } from '../managers/GameManager';
import { EffectManager } from '../managers/EffectManager';
import { WaveService } from '../managers/WaveService';
import { PoolManager } from '../managers/PoolManager';
import { HUDManager } from '../../ui/HUDManager';
import { BuildingManager } from '../../gameplay/buildings/BuildingManager';
import { WaveManager } from '../../gameplay/wave/WaveManager';
import { CoinDropManager } from '../../gameplay/economy/CoinDropManager';

/**
 * ControllerServices
 * GameController 专用服务入口集合
 */
export class ControllerServices {
    public get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }

    public get gameManager(): GameManager {
        return ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
    }

    public get hudManager(): HUDManager {
        return ServiceRegistry.get<HUDManager>('HUDManager') ?? HUDManager.instance;
    }

    public get buildingManager(): BuildingManager {
        return ServiceRegistry.get<BuildingManager>('BuildingManager') ?? BuildingManager.instance;
    }

    public get effectManager(): EffectManager {
        return ServiceRegistry.get<EffectManager>('EffectManager') ?? EffectManager.instance;
    }

    public get waveManager(): WaveManager {
        return ServiceRegistry.get<WaveManager>('WaveManager') ?? WaveManager.instance;
    }

    public get waveService(): WaveService {
        return ServiceRegistry.get<WaveService>('WaveService') ?? WaveService.instance;
    }

    public get poolManager(): PoolManager {
        return ServiceRegistry.get<PoolManager>('PoolManager') ?? PoolManager.instance;
    }

    public get coinDropManager(): CoinDropManager {
        return ServiceRegistry.get<CoinDropManager>('CoinDropManager') ?? CoinDropManager.instance;
    }
}
