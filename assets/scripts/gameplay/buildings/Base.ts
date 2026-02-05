import { _decorator, Vec3 } from 'cc';
import { Building, BuildingType } from './Building';
import { GameManager } from '../../core/managers/GameManager';
import { GameConfig } from '../../data/GameConfig';
import { HUDManager } from '../../ui/HUDManager';
import { EventManager } from '../../core/managers/EventManager';
import { GameEvents } from '../../data/GameEvents';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import { Hero } from '../units/Hero';

const { ccclass, property } = _decorator;

/**
 * 基地组件
 * 游戏核心保护目标，血量归零则游戏结束
 */
@ccclass('Base')
export class Base extends Building {
    private _upgradeProgress: number = 0;
    private _nextUpgradeCost: number = 0;
    private _collectTimer: number = 0;
    private _showingUpgradeInfo: boolean = false;

    protected initialize(): void {
        this.buildingType = BuildingType.BASE;
        this.maxLevel = GameConfig.BUILDING.BASE_UPGRADE.MAX_LEVEL;
        this.upgradeCostMultiplier = GameConfig.BUILDING.BASE_UPGRADE.COST_MULTIPLIER;
        this.statMultiplier = GameConfig.BUILDING.BASE_UPGRADE.HP_MULTIPLIER;
        this._nextUpgradeCost = GameConfig.BUILDING.BASE_UPGRADE.START_COST;
        super.initialize();

        this.eventManager.on(GameEvents.ENEMY_REACHED_BASE, this.onEnemyReachedBase, this);

        // Initial HUD Update
        this.hudManager.updateBaseHp(this.currentHp, this.maxHp);
    }

    public takeDamage(damage: number, attacker?: any): void {
        super.takeDamage(damage, attacker);

        // Update HUD
        this.hudManager.updateBaseHp(this.currentHp, this.maxHp);
    }

    private onEnemyReachedBase(data: { damage?: number }): void {
        const damage = data?.damage ?? 10;
        if (!this.isAlive) return;
        this.takeDamage(damage);
    }

    protected update(dt: number): void {
        super.update(dt);

        if (!this.isAlive || !this.gameManager.isPlaying) {
            return;
        }

        this.processBaseUpgrade(dt);
    }

    private processBaseUpgrade(dt: number): void {
        const heroNode = this.gameManager.hero;
        const upgradeCfg = GameConfig.BUILDING.BASE_UPGRADE;

        if (!heroNode || !heroNode.isValid) {
            this._collectTimer = 0;
            this.updateUpgradeInfoUI(false);
            return;
        }

        const hero = heroNode.getComponent(Hero);
        if (!hero) {
            this._collectTimer = 0;
            this.updateUpgradeInfoUI(false);
            return;
        }

        const dist = Vec3.distance(this.node.worldPosition, heroNode.worldPosition);
        const inRange = dist <= upgradeCfg.COLLECT_RADIUS;
        if (!inRange) {
            this._collectTimer = 0;
            this.updateUpgradeInfoUI(false);
            return;
        }

        this.updateUpgradeInfoUI(true);

        if (this.level >= this.maxLevel || hero.coinCount <= 0) {
            return;
        }

        this._collectTimer += dt;
        while (
            this._collectTimer >= upgradeCfg.COLLECT_INTERVAL &&
            this.level < this.maxLevel &&
            hero.coinCount > 0
        ) {
            this._collectTimer -= upgradeCfg.COLLECT_INTERVAL;

            const needed = this._nextUpgradeCost - this._upgradeProgress;
            if (needed <= 0) {
                break;
            }

            const collected = hero.removeCoin(
                Math.min(upgradeCfg.COLLECT_RATE, needed, hero.coinCount)
            );
            if (collected <= 0) {
                break;
            }

            this._upgradeProgress += collected;
            this.hudManager.updateCoinDisplay(hero.coinCount);

            if (this._upgradeProgress >= this._nextUpgradeCost) {
                this.onBaseUpgradeComplete(hero);
            }

            this.updateUpgradeInfoUI(true);
        }
    }

    private onBaseUpgradeComplete(hero: Hero): void {
        const upgraded = this.upgrade();
        if (!upgraded) {
            return;
        }

        hero.applyBaseUpgradeBuff();
        this.hudManager.updateBaseHp(this.currentHp, this.maxHp);

        this._upgradeProgress = 0;
        if (this.level < this.maxLevel) {
            this._nextUpgradeCost = Math.ceil(this._nextUpgradeCost * this.upgradeCostMultiplier);
        }
    }

    private updateUpgradeInfoUI(inRange: boolean): void {
        if (!inRange) {
            if (this._showingUpgradeInfo) {
                this.hudManager.hideBuildingInfo();
                this._showingUpgradeInfo = false;
            }
            return;
        }

        this._showingUpgradeInfo = true;
        if (this.level >= this.maxLevel) {
            this.hudManager.showBuildingInfo('基地已满级', 1, 1);
            return;
        }

        this.hudManager.showBuildingInfo(
            `升级基地 Lv.${this.level}`,
            this._nextUpgradeCost,
            this._upgradeProgress
        );
    }

    protected onDestroyed(): void {
        if (this._showingUpgradeInfo) {
            this.hudManager.hideBuildingInfo();
            this._showingUpgradeInfo = false;
        }

        // Trigger generic building destruction (remove from map, fx)
        super.onDestroyed();

        // Trigger Game Over
        console.log('[Base] Destroyed! Game Over.');
        this.gameManager.gameOver(false); // Victory = false
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }

    private get hudManager(): HUDManager {
        return ServiceRegistry.get<HUDManager>('HUDManager') ?? HUDManager.instance;
    }

    private get gameManager(): GameManager {
        return ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
    }
}
