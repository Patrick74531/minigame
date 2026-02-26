import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import { BuildingManager } from '../buildings/BuildingManager';
import { WaveManager } from '../wave/WaveManager';
import { HeroLevelSystem } from '../units/HeroLevelSystem';
import { GameManager } from '../../core/managers/GameManager';
import { Unit } from '../units/Unit';
import { Hero } from '../units/Hero';
import { BuildingType } from '../buildings/Building';
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
        this.register('freeze_enemies', ItemEffectExecutor.freezeEnemies);
        this.register('upgrade_buildings', ItemEffectExecutor.upgradeBuildings);
        this.register('bonus_coins', ItemEffectExecutor.bonusCoins);
        this.register('hero_invincible', ItemEffectExecutor.heroInvincible);
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

    private static killAllEnemies(_params: Record<string, number>): void {
        const wm = ServiceRegistry.get<WaveManager>('WaveManager') ?? WaveManager.instance;
        // 快照当前敌人列表，用 die() 直接击杀以确保不遗漏任何敌人类型
        const enemies = [...wm.enemies];
        for (const enemyNode of enemies) {
            if (!enemyNode || !enemyNode.isValid) continue;
            const unit = enemyNode.getComponent(Unit);
            if (unit && unit.isAlive) {
                unit.die();
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

    private static freezeEnemies(params: Record<string, number>): void {
        const duration = params.duration ?? 10;
        const wm = ServiceRegistry.get<WaveManager>('WaveManager') ?? WaveManager.instance;
        for (const enemyNode of wm.enemies) {
            if (!enemyNode || !enemyNode.isValid) continue;
            const unit = enemyNode.getComponent(Unit);
            if (unit && unit.isAlive) {
                // applyStun 使敌人完全停止（移动+攻击+扫描全部暂停）
                unit.applyStun(duration);
            }
        }
    }

    private static upgradeBuildings(_params: Record<string, number>): void {
        const bm =
            ServiceRegistry.get<BuildingManager>('BuildingManager') ?? BuildingManager.instance;
        for (const building of bm.activeBuildings) {
            if (!building || !building.node || !building.node.isValid) continue;
            if (!building.isAlive) continue;
            // 只升级防御塔类型
            const bt = building.buildingType;
            const isTower =
                bt === BuildingType.TOWER ||
                bt === BuildingType.FROST_TOWER ||
                bt === BuildingType.LIGHTNING_TOWER;
            if (!isTower) continue;
            if (building.level < building.maxLevel) {
                building.upgrade();
            }
        }
    }

    private static bonusCoins(params: Record<string, number>): void {
        const amount = params.amount ?? 200;
        const gm = ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
        gm.addCoins(amount);
    }

    private static heroInvincible(params: Record<string, number>): void {
        const duration = params.duration ?? 30;
        const gm = ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
        const heroNode = gm.hero;
        if (!heroNode || !heroNode.isValid) return;
        const hero = heroNode.getComponent(Hero);
        if (hero && hero.isAlive) {
            hero.applyInvincible(duration);
        }
    }
}
