import { _decorator, Node, Vec3, RigidBody } from 'cc';
import { Unit, UnitState, UnitType } from './Unit';
import { GameConfig } from '../../data/GameConfig';
import { HealthBar } from '../../ui/HealthBar';
import { EnemyQuery } from '../../core/managers/EnemyQuery';

const { ccclass, property } = _decorator;

/**
 * 士兵单位
 * 自动寻找并追击最近的敌人
 */
@ccclass('Soldier')
export class Soldier extends Unit {
    /** 当前追踪的敌人节点（外部可读取） */
    public currentTarget: Node | null = null;
    private _fallbackTimer: number = 0;
    /** 产兵所属建筑 UUID */
    public ownerBuildingId: string | null = null;
    /** 缓存 RigidBody 引用，避免每帧 getComponent */
    private _rbCached: RigidBody | null = null;
    private _rbLookedUp: boolean = false;
    /** 复用临时向量 */
    private static readonly _tmpVel = new Vec3();
    private static readonly _tmpLookAt = new Vec3();

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

        // Add health bar for soldiers
        let bar = this.node.getComponent(HealthBar);
        if (!bar) {
            bar = this.node.addComponent(HealthBar);
        }
        bar.yOffset = 1.2;
        bar.width = 60;
        bar.height = 6;
    }

    public onSpawn(): void {
        super.onSpawn();
        this._state = UnitState.IDLE;
        this.currentTarget = null;
        this.ownerBuildingId = null;
    }

    protected update(dt: number): void {
        if (!this.isAlive) return;
        if (!this.gameManager.isPlaying) return;

        // 调用父类更新
        super.update(dt);

        // Mirror target for external reads (CombatSystem assigns target)
        this.currentTarget = this.target ? this.target.node : null;

        // Clear dead targets early to allow re-acquisition
        if (this.target && !this.target.isAlive) {
            this.setTarget(null);
            this.currentTarget = null;
        }

        // Fallback: ensure soldiers can still find targets if CombatSystem is missing or stalled
        if (!this.target) {
            this._fallbackTimer += dt;
            if (this._fallbackTimer >= GameConfig.COMBAT.TARGET_CHECK_INTERVAL) {
                this._fallbackTimer = 0;
                this.tryAcquireTargetFallback();
            }
        } else {
            this._fallbackTimer = 0;
        }
    }

    /**
     * 由 CombatSystem 调用，设置并进入追击状态
     */
    public engageTarget(target: Unit): void {
        this.setTarget(target);
        this._state = UnitState.MOVING;
        this.currentTarget = target.node;
    }

    protected updateMovement(dt: number): void {
        if (!this.isAlive || !this._target || !this._target.isAlive) {
            this._state = UnitState.IDLE;
            this.currentTarget = null;
            this.setTarget(null);
            return;
        }

        const myPos = this.node.position;
        const targetPos = this._target.node.position;
        const dx = targetPos.x - myPos.x;
        const dz = targetPos.z - myPos.z; // 3D
        const distSq = dx * dx + dz * dz;
        const rangeSq = this._stats.attackRange * this._stats.attackRange;

        if (distSq <= rangeSq) {
            this._state = UnitState.ATTACKING;
            return;
        }

        // 向目标移动
        const distance = Math.sqrt(distSq);
        const speed = this._stats.moveSpeed;
        const dirX = dx / distance;
        const dirZ = dz / distance;

        // 缓存 RigidBody 查找
        if (!this._rbLookedUp) {
            this._rbCached = this.node.getComponent(RigidBody);
            this._rbLookedUp = true;
        }

        if (this._rbCached) {
            const vel = Soldier._tmpVel;
            vel.set(dirX * speed, 0, dirZ * speed);
            this._rbCached.setLinearVelocity(vel);
        } else {
            this.node.setPosition(
                myPos.x + dirX * speed * dt,
                GameConfig.PHYSICS.SOLDIER_Y,
                myPos.z + dirZ * speed * dt
            );
        }

        // Face target（复用静态向量）
        Soldier._tmpLookAt.set(targetPos.x, 0, targetPos.z);
        this.node.lookAt(Soldier._tmpLookAt);
    }

    protected performAttack(): void {
        if (!this._target || !this._target.isAlive) return;
        this._target.takeDamage(this._stats.attack, this);
    }

    protected onDeath(): void {
        this.currentTarget = null;
    }

    /**
     * Fallback targeting when CombatSystem is not running.
     * NOTE: Keep lightweight. This exists for safety only.
     */
    private tryAcquireTargetFallback(): void {
        const enemies = EnemyQuery.getEnemies();
        if (!enemies || enemies.length === 0) return;

        const myPos = this.node.position;
        let nearest: Node | null = null;
        let minDist = Infinity;

        for (const enemy of enemies) {
            if (!enemy || !enemy.isValid) continue;
            const dx = enemy.position.x - myPos.x;
            const dz = enemy.position.z - myPos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < minDist) {
                minDist = dist;
                nearest = enemy;
            }
        }

        if (nearest) {
            const unit = nearest.getComponent(Unit);
            if (unit && unit.isAlive) {
                this.engageTarget(unit);
            }
        }
    }
}
