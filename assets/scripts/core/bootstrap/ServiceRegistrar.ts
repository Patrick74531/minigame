import { Node } from 'cc';
import { ServiceRegistry } from '../managers/ServiceRegistry';
import { EventManager } from '../managers/EventManager';
import { GameManager } from '../managers/GameManager';
import { HUDManager } from '../../ui/HUDManager';
import { BuildingManager } from '../../gameplay/buildings/BuildingManager';
import { BuildingRegistry } from '../../gameplay/buildings/BuildingRegistry';
import { EffectManager } from '../managers/EffectManager';
import { WaveManager } from '../../gameplay/wave/WaveManager';
import { WaveService } from '../managers/WaveService';
import { PoolManager } from '../managers/PoolManager';
import { CoinDropManager } from '../../gameplay/economy/CoinDropManager';
import { UnitFactory } from '../../gameplay/units/UnitFactory';
import { BuffCardService } from '../../gameplay/roguelike/BuffCardService';
import { BuffCardUI } from '../../ui/BuffCardUI';
import { HeroWeaponManager } from '../../gameplay/weapons/HeroWeaponManager';
import { AirdropService } from '../../gameplay/airdrop/AirdropService';
import { WeaponSelectUI } from '../../ui/WeaponSelectUI';
import { WeaponBarUI } from '../../ui/WeaponBarUI';

/**
 * ServiceRegistrar
 * 统一注册全局服务入口
 */
export class ServiceRegistrar {
    public static registerCore(): void {
        ServiceRegistry.register('EventManager', EventManager.instance);
        ServiceRegistry.register('GameManager', GameManager.instance);
        ServiceRegistry.register('HUDManager', HUDManager.instance);
        ServiceRegistry.register('BuildingManager', BuildingManager.instance);
        ServiceRegistry.register('BuildingRegistry', BuildingRegistry.instance);
        ServiceRegistry.register('EffectManager', EffectManager.instance);
        ServiceRegistry.register('CoinDropManager', CoinDropManager.instance);
        ServiceRegistry.register('WaveManager', WaveManager.instance);
        ServiceRegistry.register('WaveRuntime', WaveManager.instance);
        ServiceRegistry.register('WaveService', WaveService.instance);
        ServiceRegistry.register('PoolManager', PoolManager.instance);
        // Fallback spawner when soldier pool is not registered
        ServiceRegistry.register('SoldierSpawner', (parent: Node, x: number, z: number) =>
            UnitFactory.createSoldier(parent, x, z)
        );
        ServiceRegistry.register('BuffCardService', BuffCardService.instance);
        ServiceRegistry.register('BuffCardUI', BuffCardUI.instance);
        ServiceRegistry.register('HeroWeaponManager', HeroWeaponManager.instance);
        ServiceRegistry.register('AirdropService', AirdropService.instance);
        ServiceRegistry.register('WeaponSelectUI', WeaponSelectUI.instance);
        ServiceRegistry.register('WeaponBarUI', WeaponBarUI.instance);
    }
}
