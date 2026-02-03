import { _decorator, Vec2 } from 'cc';
import { Unit, UnitState, UnitType } from './Unit';
import { GameConfig } from '../../data/GameConfig';
import { MathUtils } from '../../core/utils/MathUtils';

const { ccclass, property } = _decorator;

/**
 * 敌人单位
 * 从地图边缘向目标（基地/英雄）移动并攻击
 */
@ccclass('Enemy')
export class Enemy extends Unit {
    /** 目标位置（用于向基地移动） */
    private _targetPosition: Vec2 = new Vec2(0, 0);

    protected initialize(): void {
        super.initialize();
        this.unitType = UnitType.ENEMY;

        // 应用敌人默认属性
        this.initStats({
            maxHp: GameConfig.ENEMY.BASE_HP,
            attack: GameConfig.ENEMY.BASE_ATTACK,
            attackRange: GameConfig.ENEMY.ATTACK_RANGE,
            attackInterval: GameConfig.ENEMY.ATTACK_INTERVAL,
            moveSpeed: GameConfig.ENEMY.MOVE_SPEED,
        });
    }

    public onSpawn(): void {
        super.onSpawn();
        this._state = UnitState.MOVING;
    }

    /**
     * 设置移动目标位置
     * @param position 目标位置
     */
    public setTargetPosition(position: Vec2): void {
        this._targetPosition = position;
        this._state = UnitState.MOVING;
    }

    protected updateMovement(dt: number): void {
        if (!this.isAlive) return;

        // 检查是否有攻击目标
        if (this._target && this._target.isAlive) {
            const distance = MathUtils.distance(this.node.position, this._target.node.position);

            if (distance <= this._stats.attackRange) {
                // 进入攻击状态
                this._state = UnitState.ATTACKING;
                return;
            }

            // 向目标移动
            this.moveTowards(this._target.node.position.x, this._target.node.position.y, dt);
        } else {
            // 向目标位置移动
            this.moveTowards(this._targetPosition.x, this._targetPosition.y, dt);
        }
    }

    private moveTowards(targetX: number, targetY: number, dt: number): void {
        const currentPos = this.node.position;
        const direction = MathUtils.direction(currentPos, { x: targetX, y: targetY, z: 0 });

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
        // TODO: 播放死亡动画，掉落金币
        // 暂时直接禁用节点，等待 PoolManager 回收
    }
}
