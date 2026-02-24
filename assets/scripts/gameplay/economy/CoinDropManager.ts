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
    private static readonly REGULAR_DROP_COINS = 3;
    private static readonly ELITE_DROP_COINS = 15;
    private static readonly BOSS_DROP_COINS_STEP = 50;
    private static readonly BOSS_DROP_MULTIPLIER = 3;
    private static readonly DROP_SPREAD_RADIUS = 0.42;

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
        enemySpawnType?: 'regular' | 'elite' | 'boss';
        enemyIsElite?: boolean;
    }): void {
        if (data.unitType !== UnitType.ENEMY) return;

        if (data.position && this._coinContainer) {
            const enemyComp = data.node?.getComponent(Enemy);
            const dropCoins = this.resolveDropCoins({
                enemyComp,
                spawnType: data.enemySpawnType,
                isElite: data.enemyIsElite,
            });
            for (let i = 0; i < dropCoins; i++) {
                const jitter = this.resolveDropJitter(i, dropCoins);
                CoinFactory.createCoin(
                    this._coinContainer,
                    data.position.x + jitter.x,
                    data.position.z + jitter.z,
                    1
                );
            }
        }
    }

    private resolveDropCoins(input: {
        enemyComp: Enemy | null | undefined;
        spawnType?: 'regular' | 'elite' | 'boss';
        isElite?: boolean;
    }): number {
        const enemyComp = input.enemyComp;
        const spawnType = input.spawnType ?? enemyComp?.spawnType;
        const isElite = input.isElite ?? enemyComp?.isElite ?? false;

        if (spawnType === 'boss') {
            this._bossKillCount += 1;
            // Linear progression: 50 → 100 → 150 …
            return Math.max(1, this._bossKillCount * CoinDropManager.BOSS_DROP_COINS_STEP);
        }

        if (spawnType === 'elite' || isElite) {
            return CoinDropManager.ELITE_DROP_COINS;
        }

        return CoinDropManager.REGULAR_DROP_COINS;
    }

    private resolveDropJitter(index: number, total: number): { x: number; z: number } {
        if (total <= 1) {
            return { x: 0, z: 0 };
        }
        const ratio = index / total;
        const angle = ratio * Math.PI * 2 + Math.random() * 0.25;
        const radius = CoinDropManager.DROP_SPREAD_RADIUS * (0.35 + Math.random() * 0.65);
        return {
            x: Math.cos(angle) * radius,
            z: Math.sin(angle) * radius,
        };
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }
}
