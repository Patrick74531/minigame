import { _decorator, Node, RigidBody, Vec3 } from 'cc';
import { Unit, UnitState, UnitType } from './Unit';
import { GameConfig } from '../../data/GameConfig';
import { WaveManager } from '../../core/managers/WaveManager';

const { ccclass, property } = _decorator;

/**
 * 士兵单位
 * 自动寻找并追击最近的敌人
 */
@ccclass('Soldier')
export class Soldier extends Unit {
    /** 索敌间隔（秒）*/
    private readonly SEEK_INTERVAL = 0.5;
    private _seekTimer: number = 0;

    /** 当前追踪的敌人节点（外部可读取） */
    public currentTarget: Node | null = null;

    protected initialize(): void {
        super.initialize();
        this.unitType = UnitType.SOLDIER;

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
        this.currentTarget = null;
    }

    protected update(dt: number): void {
        if (!this.isAlive) return;

        // 周期性索敌
        this._seekTimer += dt;
        if (this._seekTimer >= this.SEEK_INTERVAL) {
            this._seekTimer = 0;
            this.findAndChaseTarget();
        }

        // 调用父类更新
        super.update(dt);
    }

    /**
     * 查找并追踪最近的敌人
     */
    private findAndChaseTarget(): void {
        // 如果当前目标还有效，继续追踪
        if (this.currentTarget?.isValid && this._target?.isAlive) {
            return;
        }

        // 从 WaveManager 获取敌人列表
        const enemies = WaveManager.instance.enemies;
        if (enemies.length === 0) {
            this._state = UnitState.IDLE;
            this.currentTarget = null;
            this._target = null;
            return;
        }

        // 找最近的敌人
        let nearest: Node | null = null;
        let minDist = Infinity;
        const myPos = this.node.position;

        for (const enemy of enemies) {
            if (!enemy.isValid) continue;
            const dx = enemy.position.x - myPos.x;
            const dz = enemy.position.z - myPos.z; // 3D
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < minDist) {
                minDist = dist;
                nearest = enemy;
            }
        }

        if (nearest) {
            this.currentTarget = nearest;
            const enemyUnit = nearest.getComponent(Unit);
            if (enemyUnit) {
                this.setTarget(enemyUnit);
                this._state = UnitState.MOVING;
            }
        }
    }

    protected updateMovement(dt: number): void {
        if (!this.isAlive || !this._target || !this._target.isAlive) {
            this._state = UnitState.IDLE;
            this.currentTarget = null;
            return;
        }

        const myPos = this.node.position;
        const targetPos = this._target.node.position;
        const dx = targetPos.x - myPos.x;
        const dz = targetPos.z - myPos.z; // 3D
        const distance = Math.sqrt(dx * dx + dz * dz);

        if (distance <= this._stats.attackRange) {
            // e.g. 0.6
            this._state = UnitState.ATTACKING;
            return;
        }

        // 向目标移动
        const speed = this._stats.moveSpeed;
        const dirX = dx / distance;
        const dirZ = dz / distance;

        if (this.node.getComponent('cc.RigidBody')) {
            (this.node.getComponent('cc.RigidBody') as any).setLinearVelocity(
                new Vec3(dirX * speed, 0, dirZ * speed)
            );
        } else {
            this.node.setPosition(myPos.x + dirX * speed * dt, 0.5, myPos.z + dirZ * speed * dt);
        }

        // Face target
        this.node.lookAt(new Vec3(targetPos.x, 0, targetPos.z));
    }

    protected performAttack(): void {
        if (!this._target || !this._target.isAlive) return;
        this._target.takeDamage(this._stats.attack, this);
    }

    protected onDeath(): void {
        this.currentTarget = null;
    }
}
