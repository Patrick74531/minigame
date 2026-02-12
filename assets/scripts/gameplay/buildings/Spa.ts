import { _decorator, Vec3 } from 'cc';
import { Building, BuildingType } from './Building';
import { Hero } from '../units/Hero';

const { ccclass } = _decorator;

type SpaHealConfig = {
    radius?: number;
    healPercentPerSecond?: number;
    tickInterval?: number;
};

@ccclass('Spa')
export class Spa extends Building {
    private static readonly _tmpBuildingPos = new Vec3();
    private static readonly _tmpHeroPos = new Vec3();

    private _healRadius: number = 5;
    private _healPercentPerSecond: number = 0.1;
    private _tickInterval: number = 1;
    private _healTimer: number = 0;

    protected initialize(): void {
        this.buildingType = BuildingType.SPA;
        super.initialize();
    }

    public setHealConfig(config?: SpaHealConfig): void {
        if (!config) return;
        if (typeof config.radius === 'number') {
            this._healRadius = Math.max(0.1, config.radius);
        }
        if (typeof config.healPercentPerSecond === 'number') {
            this._healPercentPerSecond = Math.max(0, config.healPercentPerSecond);
        }
        if (typeof config.tickInterval === 'number') {
            this._tickInterval = Math.max(0.1, config.tickInterval);
        }
    }

    protected update(dt: number): void {
        super.update(dt);
        if (!this.isAlive || !this.gameManager.isPlaying) return;

        const heroNode = this.gameManager.hero;
        if (!heroNode || !heroNode.isValid) {
            this._healTimer = 0;
            return;
        }

        const hero = heroNode.getComponent(Hero);
        if (!hero || !hero.isAlive) {
            this._healTimer = 0;
            return;
        }

        const buildingPos = this.node.worldPosition;
        const heroPos = heroNode.worldPosition;
        Spa._tmpBuildingPos.set(buildingPos.x, 0, buildingPos.z);
        Spa._tmpHeroPos.set(heroPos.x, 0, heroPos.z);

        const inRange =
            Vec3.squaredDistance(Spa._tmpBuildingPos, Spa._tmpHeroPos) <=
            this._healRadius * this._healRadius;
        if (!inRange) {
            this._healTimer = 0;
            return;
        }

        this._healTimer += dt;
        while (this._healTimer >= this._tickInterval) {
            this._healTimer -= this._tickInterval;
            const healAmount = Math.max(
                1,
                Math.ceil(hero.stats.maxHp * this._healPercentPerSecond * this._tickInterval)
            );
            hero.heal(healAmount, true);
        }
    }
}
