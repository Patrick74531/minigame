import { GameManager } from '../managers/GameManager';
import { EventManager } from '../managers/EventManager';
import { EffectManager } from '../managers/EffectManager';
import { WaveService } from '../managers/WaveService';
import { PoolManager } from '../managers/PoolManager';
import { HUDManager } from '../../ui/HUDManager';
import { BuffCardUI } from '../../ui/BuffCardUI';
import { TowerSelectUI } from '../../ui/TowerSelectUI';
import { WeaponSelectUI } from '../../ui/WeaponSelectUI';
import { WeaponBarUI } from '../../ui/WeaponBarUI';
import { BuildingManager } from '../../gameplay/buildings/BuildingManager';
import { BuildingRegistry } from '../../gameplay/buildings/BuildingRegistry';
import { WaveManager } from '../../gameplay/wave/WaveManager';
import { CoinDropManager } from '../../gameplay/economy/CoinDropManager';
import { BuffCardService } from '../../gameplay/roguelike/BuffCardService';
import { HeroWeaponManager } from '../../gameplay/weapons/HeroWeaponManager';
import { AirdropService } from '../../gameplay/airdrop/AirdropService';
import { HeroLevelSystem } from '../../gameplay/units/HeroLevelSystem';

/**
 * SystemReset
 * 负责在游戏重启/销毁时的“硬重置”逻辑。
 * 确保所有单例实例被销毁，以便场景重载后能创建全新的状态。
 */
export class SystemReset {
    /**
     * 销毁所有单例实例
     * 
     * NOTE: 调用此方法后，所有 Manager.instance 将变为 null。
     * 必须保证之后立即进行场景重载或重新初始化，否则会报错。
     */
    public static shutdown(): void {
        console.log('[SystemReset] Shutting down all singletons...');

        // 核心管理
        GameManager.destroyInstance();
        EventManager.destroyInstance();
        EffectManager.destroyInstance();
        PoolManager.destroyInstance();
        
        // 游戏玩法
        WaveService.destroyInstance();
        WaveManager.destroyInstance();
        BuildingManager.destroyInstance();
        BuildingRegistry.destroyInstance();
        CoinDropManager.destroyInstance();
        HeroLevelSystem.destroyInstance();
        BuffCardService.destroyInstance();
        HeroWeaponManager.destroyInstance();
        AirdropService.destroyInstance();

        // UI
        HUDManager.destroyInstance();
        BuffCardUI.destroyInstance();
        TowerSelectUI.destroyInstance();
        WeaponSelectUI.destroyInstance();
        WeaponBarUI.destroyInstance();

        console.log('[SystemReset] All singletons destroyed.');
    }
}
