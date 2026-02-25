import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import { BuildingManager } from '../buildings/BuildingManager';
import { WaveManager } from '../wave/WaveManager';
import { HeroLevelSystem } from '../units/HeroLevelSystem';
import { Enemy } from '../units/Enemy';
import { ItemEffectType } from './ItemDefs';

/**
 * 效果处理器签名
 * @param params 来自 ItemDef.effectParams 的配置
 */
type EffectHandler = (params: Record<string, number>) => void;

/**
 * ItemEffectExecutor
 * 注册制效果执行器 — 新增效果只需 register，不修改 switch。
 */
export class ItemEffectExecutor {
    private static _handlers = new Map<ItemEffectType, EffectHandler>();

    /** 注册所有内置效果（启动时调用一次） */
    public static bootstrap(): void {
        if (this._handlers.size > 0) return;
        this.register('restore_buildings', ItemEffectExecutor.restoreBuildings);
        this.register('kill_all_enemies', ItemEffectExecutor.killAllEnemies);
        this.register('hero_level_up', ItemEffectExecutor.heroLevelUp);
    }

    /** 注册 / 覆盖某个效果类型的处理器 */
    public static register(type: ItemEffectType, handler: EffectHandler): void {
        this._handlers.set(type, handler);
    }

    /** 执行效果 */
    public static execute(type: ItemEffectType, params: Record<string, number>): boolean {
        const handler = this._handlers.get(type);
        if (!handler) return false;
        handler(params);
        return true;
    }

    /** 清除所有处理器（测试 / 热更新用） */
    public static clear(): void {
        this._handlers.clear();
    }

    // === 内置效果 ===

    private static restoreBuildings(_params: Record<string, number>): void {
        const bm =
            ServiceRegistry.get<BuildingManager>('BuildingManager') ?? BuildingManager.instance;
        for (const building of bm.activeBuildings) {
            if (!building || !building.node || !building.node.isValid) continue;
            if (!building.isAlive) continue;
            building.restoreToFullHealth();
        }
    }

    private static killAllEnemies(params: Record<string, number>): void {
        const wm = ServiceRegistry.get<WaveManager>('WaveManager') ?? WaveManager.instance;
        const damage = params.damage ?? 999999;
        const enemies = [...wm.enemies];
        for (const enemyNode of enemies) {
            if (!enemyNode || !enemyNode.isValid) continue;
            const enemyComp = enemyNode.getComponent(Enemy);
            if (enemyComp) {
                enemyComp.takeDamage(damage);
            }
        }
    }

    private static heroLevelUp(params: Record<string, number>): void {
        const levels = params.levels ?? 5;
        const heroLevel = HeroLevelSystem.instance;
        for (let i = 0; i < levels; i++) {
            const needed = heroLevel.maxXp - heroLevel.currentXp;
            heroLevel.addXp(Math.max(1, needed));
        }
    }
}
