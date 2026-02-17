import { Node } from 'cc';
import { GameConfig } from '../../data/GameConfig';
import { GameEvents } from '../../data/GameEvents';
import { EventManager } from '../../core/managers/EventManager';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import { UnitType } from './Unit';
import { Enemy } from './Enemy';

/**
 * 英雄成长系统
 * 监听敌人死亡事件获取经验，升级后按配置增长英雄属性
 *
 * 职责：
 * - 追踪经验值和等级
 * - 计算每级所需经验（指数曲线）
 * - 升级时发出事件，由 Hero 和 HUD 响应
 *
 * 设计原则：
 * - 纯数据逻辑，不持有 Hero 引用，通过事件解耦
 * - 所有数值来自 GameConfig.HERO_LEVEL，便于调参
 */
export class HeroLevelSystem {
    private static _instance: HeroLevelSystem | null = null;
    public static get instance(): HeroLevelSystem {
        if (!this._instance) {
            this._instance = new HeroLevelSystem();
        }
        return this._instance;
    }

    public static destroyInstance(): void {
        this._instance = null;
    }

    private _level: number = 1;
    private _currentXp: number = 0;
    private _heroNode: Node | null = null;

    // === 缓存的每级经验表（避免重复计算） ===
    private _xpTable: number[] = [];

    public get level(): number {
        return this._level;
    }
    public get currentXp(): number {
        return this._currentXp;
    }
    public get maxXp(): number {
        return this.getXpForLevel(this._level);
    }
    public get isMaxLevel(): boolean {
        return false;
    }

    /**
     * 初始化：绑定英雄节点，监听击杀事件
     */
    public initialize(heroNode: Node): void {
        this._heroNode = heroNode;
        this._level = 1;
        this._currentXp = 0;
        this.buildXpTable();

        this.eventManager.on(GameEvents.UNIT_DIED, this.onUnitDied, this);
    }

    /**
     * 清理事件监听
     */
    public cleanup(): void {
        this.eventManager.off(GameEvents.UNIT_DIED, this.onUnitDied, this);
        this._heroNode = null;
        this._level = 1;
        this._currentXp = 0;
    }

    /**
     * 手动增加经验（供外部调用，如任务奖励）
     */
    public addXp(amount: number): void {
        if (amount <= 0) return;

        this._currentXp += amount;

        // 连续升级处理（一次杀很多怪可能连升数级）
        while (this._currentXp >= this.maxXp) {
            this._currentXp -= this.maxXp;
            this._level++;

            this.eventManager.emit(GameEvents.HERO_LEVEL_UP, {
                level: this._level,
                heroNode: this._heroNode!,
            });
        }

        this.eventManager.emit(GameEvents.HERO_XP_GAINED, {
            xp: amount,
            currentXp: this._currentXp,
            maxXp: this.maxXp,
            level: this._level,
        });
    }

    /**
     * 获取指定等级升级所需的经验值
     * 公式：base * growth^(level-1)，取整
     */
    public getXpForLevel(level: number): number {
        if (level <= 0) return 0;
        if (level > this._xpTable.length) {
            const raw = Math.floor(
                GameConfig.HERO_LEVEL.XP_BASE * Math.pow(GameConfig.HERO_LEVEL.XP_GROWTH, level - 1)
            );
            if (!Number.isFinite(raw)) {
                return Number.MAX_SAFE_INTEGER;
            }
            return Math.max(1, raw);
        }
        return this._xpTable[level - 1];
    }

    /**
     * 根据等级计算某个属性相对于基础值的成长倍率
     * @param statKey 属性键（如 'attack', 'maxHp'）
     * @param level 目标等级
     * @returns 累计乘算倍率和累计加算值
     */
    public getStatGrowth(
        statKey: string,
        level: number
    ): { multiplier: number; additive: number; cap?: number } {
        const growth = GameConfig.HERO_LEVEL.GROWTH[statKey];
        if (!growth) return { multiplier: 1, additive: 0 };

        const levels = level - 1; // 成长次数 = 等级 - 1
        const multiplier = growth.multiply ? Math.pow(growth.multiply, levels) : 1;
        const additive = growth.add ? growth.add * levels : 0;

        return { multiplier, additive, cap: growth.cap };
    }

    // === 私有方法 ===

    private buildXpTable(): void {
        const cfg = GameConfig.HERO_LEVEL;
        this._xpTable = [];
        for (let i = 0; i < cfg.MAX_LEVEL; i++) {
            this._xpTable.push(Math.floor(cfg.XP_BASE * Math.pow(cfg.XP_GROWTH, i)));
        }
    }

    private onUnitDied(data: { unitType: string; node?: Node }): void {
        if (data.unitType !== UnitType.ENEMY || !data.node) return;

        const enemy = data.node.getComponent(Enemy);
        const isElite = enemy ? enemy.isElite : false;
        const xp = isElite
            ? GameConfig.HERO_LEVEL.XP_PER_ELITE_KILL
            : GameConfig.HERO_LEVEL.XP_PER_KILL;

        this.addXp(xp);
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }
}
