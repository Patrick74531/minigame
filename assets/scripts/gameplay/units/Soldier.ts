import { _decorator } from 'cc';
import { Unit, UnitState, UnitType } from './Unit';
import { GameConfig } from '../../data/GameConfig';
import { MathUtils } from '../../core/utils/MathUtils';

const { ccclass, property } = _decorator;

/**
 * 士兵单位
 * 由建筑产出，自动寻找并攻击敌人
 */
@ccclass('Soldier')
export class Soldier extends Unit {
    protected initialize(): void {
        super.initialize();
        this.unitType = UnitType.SOLDIER;

        // 应用士兵默认属性
        this.initStats({
            maxHp: GameConfig.SOLDIER.BASE_HP,
            attack: GameConfig.SOLDIER.BASE_ATTACK,
            attackRange: GameConfig.SOLDIER.ATTACK_RANGE,
            attackInterval: GameConfig.SOLDIER.ATTACK_INTERVAL,
            moveSpeed: GameConfig.SOLDIER.MOVE_SPEED,
        });
    }

    public onSpawn(): void {
        super.onSpawn();
        this._state = UnitState.IDLE;
    }

    /**
     * 开始追击目标
     * @param target 目标敌人
     */
    public chase(target: Unit): void {
        this.setTarget(target);
        this._state = UnitState.MOVING;
    }

    protected updateMovement(dt: number): void {
        if (!this.isAlive || !this._target) {
            this._state = UnitState.IDLE;
            return;
        }

        if (!this._target.isAlive) {
            this._target = null;
            this._state = UnitState.IDLE;
            return;
        }

        const distance = MathUtils.distance(this.node.position, this._target.node.position);

        if (distance <= this._stats.attackRange) {
            // 进入攻击状态
            this._state = UnitState.ATTACKING;
            return;
        }

        // 向目标移动
        const currentPos = this.node.position;
        const direction = MathUtils.direction(currentPos, this._target.node.position);
        const moveDistance = this._stats.moveSpeed * dt;

        this.node.setPosition(
            currentPos.x + direction.x * moveDistance,
            currentPos.y + direction.y * moveDistance,
            currentPos.z
        );
    }

    protected performAttack(): void {
        if (!this._target || !this._target.isAlive) return;
        this._target.takeDamage(this._stats.attack, this);
    }

    protected onDeath(): void {
        // TODO: 播放死亡动画
    }
}
