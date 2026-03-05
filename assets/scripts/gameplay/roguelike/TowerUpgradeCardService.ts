import { Singleton } from '../../core/base/Singleton';
import { EventManager } from '../../core/managers/EventManager';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import { GameEvents } from '../../data/GameEvents';
import { BuildingManager } from '../buildings/BuildingManager';
import { Tower, type TowerFocusedUpgradeStat } from '../buildings/Tower';
import { BuildingType } from '../buildings/Building';

export interface TowerUpgradeCardDef {
    id: string;
    stat: TowerFocusedUpgradeStat;
    nameKey: string;
    multiply: number;
    minRangeGain?: number;
}

export class TowerUpgradeCardService extends Singleton<TowerUpgradeCardService>() {
    private _pendingCards: TowerUpgradeCardDef[] = [];
    private _activeTowerId: string | null = null;
    private _queue: string[] = [];

    public get pendingCards(): ReadonlyArray<TowerUpgradeCardDef> {
        return this._pendingCards;
    }

    public get activeTowerId(): string | null {
        return this._activeTowerId;
    }

    public initialize(): void {
        this._pendingCards = [];
        this._activeTowerId = null;
        this._queue = [];

        this.eventManager.on(GameEvents.BUILDING_UPGRADED, this.onBuildingUpgraded, this);
        this.eventManager.on(
            GameEvents.TOWER_UPGRADE_CARD_PICKED,
            this.onTowerUpgradeCardPicked,
            this
        );
        this.eventManager.on(GameEvents.BUILDING_DESTROYED, this.onBuildingDestroyed, this);
    }

    public cleanup(): void {
        this.eventManager.offAllByTarget(this);
        this._pendingCards = [];
        this._activeTowerId = null;
        this._queue = [];
    }

    private onBuildingUpgraded(data: { buildingId: string }): void {
        const buildingId = data?.buildingId;
        if (!buildingId) return;
        const tower = this.resolveTowerById(buildingId);
        if (!tower) return;

        this._queue.push(tower.node.uuid);
        this.tryOpenNextChoice();
    }

    private onTowerUpgradeCardPicked(data: {
        buildingId: string;
        stat: TowerFocusedUpgradeStat;
    }): void {
        if (!this._activeTowerId) return;
        if (!data?.buildingId || data.buildingId !== this._activeTowerId) return;

        const tower = this.resolveTowerById(this._activeTowerId);
        if (tower) {
            tower.applyFocusedUpgrade(data.stat);
        }

        this._activeTowerId = null;
        this._pendingCards = [];
        this.tryOpenNextChoice();
    }

    private onBuildingDestroyed(data: { buildingId: string }): void {
        const buildingId = data?.buildingId;
        if (!buildingId) return;

        this._queue = this._queue.filter(id => id !== buildingId);
        if (this._activeTowerId !== buildingId) return;

        this._activeTowerId = null;
        this._pendingCards = [];
        this.tryOpenNextChoice();
    }

    private tryOpenNextChoice(): void {
        if (this._activeTowerId) return;

        while (this._queue.length > 0) {
            const nextTowerId = this._queue.shift()!;
            const tower = this.resolveTowerById(nextTowerId);
            if (!tower || !tower.isAlive) {
                continue;
            }

            this._activeTowerId = nextTowerId;
            this._pendingCards = this.createCardsForTower(tower);
            this.eventManager.emit(GameEvents.TOWER_UPGRADE_CARDS_DRAWN, {
                buildingId: nextTowerId,
                count: this._pendingCards.length,
            });
            return;
        }
    }

    private createCardsForTower(tower: Tower): TowerUpgradeCardDef[] {
        const attack = tower.getFocusedUpgradePreview('attack');
        const range = tower.getFocusedUpgradePreview('range');
        const speed = tower.getFocusedUpgradePreview('speed');

        return [
            {
                id: 'tower_focus_attack',
                stat: 'attack',
                nameKey: 'ui.tower.upgrade.card.attack',
                multiply: attack.multiply,
            },
            {
                id: 'tower_focus_range',
                stat: 'range',
                nameKey: 'ui.tower.upgrade.card.range',
                multiply: range.multiply,
                minRangeGain: range.minRangeGain,
            },
            {
                id: 'tower_focus_speed',
                stat: 'speed',
                nameKey: 'ui.tower.upgrade.card.speed',
                multiply: speed.multiply,
            },
        ];
    }

    private resolveTowerById(buildingId: string): Tower | null {
        for (const building of this.buildingManager.activeBuildings) {
            if (!building || !building.node || !building.node.isValid) continue;
            if (building.node.uuid !== buildingId) continue;

            const type = building.buildingType;
            const isTower =
                type === BuildingType.TOWER ||
                type === BuildingType.FROST_TOWER ||
                type === BuildingType.LIGHTNING_TOWER;
            if (!isTower) return null;

            const tower = building.node.getComponent(Tower);
            return tower ?? null;
        }

        return null;
    }

    /**
     * 应用所有待选塔升级卡（广告奖励用）
     * @returns 成功应用的卡牌数量
     */
    public applyAllCards(): number {
        if (!this._activeTowerId || this._pendingCards.length === 0) return 0;

        const tower = this.resolveTowerById(this._activeTowerId);
        if (!tower) return 0;

        let applied = 0;
        for (const card of this._pendingCards) {
            tower.applyFocusedUpgrade(card.stat);
            applied++;
        }

        this._pendingCards = [];
        this._activeTowerId = null;
        this.tryOpenNextChoice();
        return applied;
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }

    private get buildingManager(): BuildingManager {
        return ServiceRegistry.get<BuildingManager>('BuildingManager') ?? BuildingManager.instance;
    }
}
