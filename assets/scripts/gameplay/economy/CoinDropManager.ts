import { Node } from 'cc';
import { EventManager } from '../../core/managers/EventManager';
import { GameEvents } from '../../data/GameEvents';
import { UnitType } from '../units/Unit';
import { CoinFactory } from './CoinFactory';
import { GameConfig } from '../../data/GameConfig';

/**
 * CoinDropManager
 * 监听敌人死亡并生成金币掉落
 */
export class CoinDropManager {
    private static _instance: CoinDropManager | null = null;
    private _coinContainer: Node | null = null;

    public static get instance(): CoinDropManager {
        if (!this._instance) {
            this._instance = new CoinDropManager();
        }
        return this._instance;
    }

    public initialize(coinContainer: Node): void {
        this._coinContainer = coinContainer;
        EventManager.instance.on(GameEvents.UNIT_DIED, this.onUnitDied, this);
    }

    public cleanup(): void {
        EventManager.instance.off(GameEvents.UNIT_DIED, this.onUnitDied, this);
        this._coinContainer = null;
    }

    private onUnitDied(data: { unitType: string; node?: Node; position?: any }): void {
        if (data.unitType !== UnitType.ENEMY) return;

        if (data.position && this._coinContainer) {
            const value =
                GameConfig.ENEMY.COIN_DROP + Math.floor(Math.random() * 5);
            CoinFactory.createCoin(
                this._coinContainer,
                data.position.x,
                data.position.z,
                value
            );
        }

        if (data.node && data.node.isValid) {
            data.node.destroy();
        }
    }
}
