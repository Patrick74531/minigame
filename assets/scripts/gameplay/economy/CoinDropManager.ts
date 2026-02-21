import { Node } from 'cc';
import { EventManager } from '../../core/managers/EventManager';
import { GameEvents } from '../../data/GameEvents';
import { UnitType } from '../units/Unit';
import { CoinFactory } from './CoinFactory';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import { Enemy } from '../units/Enemy';

/**
 * CoinDropManager
 * 监听敌人死亡并生成金币掉落
 */
export class CoinDropManager {
    private static readonly REGULAR_DROP_COINS = 1;
    private static readonly ELITE_DROP_COINS = 5;
    private static readonly BOSS_DROP_COINS_STEP = 50;

    private static _instance: CoinDropManager | null = null;
    private _coinContainer: Node | null = null;
    private _bossKillCount: number = 0;

    public static get instance(): CoinDropManager {
        if (!this._instance) {
            this._instance = new CoinDropManager();
        }
        return this._instance;
    }

    public static destroyInstance(): void {
        this._instance = null;
    }

    public initialize(coinContainer: Node): void {
        this._coinContainer = coinContainer;
        this._bossKillCount = 0;
        this.eventManager.on(GameEvents.UNIT_DIED, this.onUnitDied, this);
    }

    public cleanup(): void {
        this.eventManager.off(GameEvents.UNIT_DIED, this.onUnitDied, this);
        this._coinContainer = null;
        this._bossKillCount = 0;
    }

    private onUnitDied(data: {
        unitType: string;
        node?: Node;
        position?: { x: number; z: number };
    }): void {
        if (data.unitType !== UnitType.ENEMY) return;

        if (data.position && this._coinContainer) {
            const enemyComp = data.node?.getComponent(Enemy);
            const dropCoins = this.resolveDropCoins(enemyComp);
            for (let i = 0; i < dropCoins; i++) {
                CoinFactory.createCoin(this._coinContainer, data.position.x, data.position.z, 1);
            }
        }

        if (data.node && data.node.isValid) {
            data.node.destroy();
        }
    }

    private resolveDropCoins(enemyComp: Enemy | null | undefined): number {
        if (!enemyComp) return CoinDropManager.REGULAR_DROP_COINS;

        if (enemyComp.spawnType === 'boss') {
            this._bossKillCount += 1;
            return this._bossKillCount * CoinDropManager.BOSS_DROP_COINS_STEP;
        }

        if (enemyComp.spawnType === 'elite' || enemyComp.isElite) {
            return CoinDropManager.ELITE_DROP_COINS;
        }

        return CoinDropManager.REGULAR_DROP_COINS;
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }
}
