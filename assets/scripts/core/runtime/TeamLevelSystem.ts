import { Node } from 'cc';
import { GameConfig } from '../../data/GameConfig';
import { GameEvents } from '../../data/GameEvents';
import { EventManager } from '../managers/EventManager';
import { ServiceRegistry } from '../managers/ServiceRegistry';
import { UnitType } from '../../gameplay/units/Unit';

/**
 * TeamLevelSystem
 * 双人模式下的共享团队经验池。
 * 与 HeroLevelSystem 接口类似，但经验在两个英雄间共享。
 * 升级时为所有英雄发出 HERO_LEVEL_UP 事件。
 */
export class TeamLevelSystem {
    private _level: number = 1;
    private _currentXp: number = 0;
    private _heroNodes: Node[] = [];
    private _xpTable: number[] = [];

    get level(): number {
        return this._level;
    }
    get currentXp(): number {
        return this._currentXp;
    }
    get maxXp(): number {
        return this.getXpForLevel(this._level);
    }

    initialize(heroNodes: Node[]): void {
        this._heroNodes = heroNodes;
        this._level = 1;
        this._currentXp = 0;
        this.buildXpTable();
        this.eventManager.on(GameEvents.UNIT_DIED, this.onUnitDied, this);
    }

    cleanup(): void {
        this.eventManager.off(GameEvents.UNIT_DIED, this.onUnitDied, this);
        this._heroNodes = [];
        this._level = 1;
        this._currentXp = 0;
    }

    addXp(amount: number): void {
        if (amount <= 0) return;
        this._currentXp += amount;

        while (this._currentXp >= this.maxXp) {
            this._currentXp -= this.maxXp;
            this._level++;

            // Emit level up for each hero node
            for (const heroNode of this._heroNodes) {
                if (heroNode && heroNode.isValid) {
                    this.eventManager.emit(GameEvents.HERO_LEVEL_UP, {
                        level: this._level,
                        heroNode,
                    });
                }
            }
        }

        this.eventManager.emit(GameEvents.HERO_XP_GAINED, {
            xp: amount,
            currentXp: this._currentXp,
            maxXp: this.maxXp,
            level: this._level,
        });
    }

    restoreState(level: number, xp: number): void {
        const maxLevel = GameConfig.HERO_LEVEL.MAX_LEVEL ?? 50;
        const targetLevel = Math.max(1, Math.min(Math.floor(level), maxLevel));
        this._currentXp = Math.max(0, Math.floor(xp));
        this._level = 1;
        this.buildXpTable();
        for (let l = 2; l <= targetLevel; l++) {
            this._level = l;
            for (const heroNode of this._heroNodes) {
                if (heroNode && heroNode.isValid) {
                    this.eventManager.emit(GameEvents.HERO_LEVEL_UP, {
                        level: l,
                        heroNode,
                        quiet: true,
                    });
                }
            }
        }
        this._level = targetLevel;
    }

    getXpForLevel(level: number): number {
        if (level <= 0) return 1;
        if (level <= this._xpTable.length) return this._xpTable[level - 1];
        const cfg = GameConfig.HERO_LEVEL;
        return Math.floor(cfg.XP_BASE * Math.pow(cfg.XP_GROWTH, level - 1));
    }

    private buildXpTable(): void {
        const cfg = GameConfig.HERO_LEVEL;
        const maxLevel = cfg.MAX_LEVEL ?? 50;
        this._xpTable = [];
        for (let i = 0; i < maxLevel; i++) {
            this._xpTable.push(Math.floor(cfg.XP_BASE * Math.pow(cfg.XP_GROWTH, i)));
        }
    }

    private onUnitDied(data: {
        unitType: string;
        node?: Node;
        enemySpawnType?: 'regular' | 'elite' | 'boss';
        enemyIsElite?: boolean;
    }): void {
        if (data.unitType !== UnitType.ENEMY || !data.node) return;

        const isElite = data.enemySpawnType === 'boss' || data.enemyIsElite;
        const xp = isElite
            ? GameConfig.HERO_LEVEL.XP_PER_ELITE_KILL
            : GameConfig.HERO_LEVEL.XP_PER_KILL;
        this.addXp(xp);
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }
}
