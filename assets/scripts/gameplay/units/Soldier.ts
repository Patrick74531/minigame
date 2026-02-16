import { _decorator, Component, Node, Vec3, RigidBody } from 'cc';
import { Unit, UnitState, UnitType } from './Unit';
import { GameConfig } from '../../data/GameConfig';
import { HealthBar } from '../../ui/HealthBar';
import { EnemyQuery } from '../../core/managers/EnemyQuery';
import { PoolManager } from '../../core/managers/PoolManager';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import { IAttackable } from '../../core/interfaces/IAttackable';

const { ccclass } = _decorator;

interface BarracksGrowthConfig {
    HP_LINEAR: number;
    HP_QUADRATIC: number;
    ATTACK_LINEAR: number;
    ATTACK_QUADRATIC: number;
    ATTACK_INTERVAL_DECAY_PER_LEVEL: number;
    ATTACK_INTERVAL_MIN_MULTIPLIER: number;
    ATTACK_RANGE_LINEAR: number;
    MOVE_SPEED_LINEAR: number;
    SIZE_LINEAR: number;
    SIZE_QUADRATIC: number;
    SIZE_MAX_MULTIPLIER: number;
}

/**
 * 士兵单位
 * 自动寻找并追击最近的敌人
 */
@ccclass('Soldier')
export class Soldier extends Unit {
    private static readonly BASE_MODEL_SCALE = 0.3;
    private static readonly BASE_HEALTH_BAR_Y_OFFSET = 1.2;
    private static readonly VISUAL_SIZE_GAIN = 1.65;
    private static readonly PROACTIVE_RETARGET_INTERVAL = 0.18;
    private static readonly RETARGET_SWITCH_BUFFER = 0.55;
    private static readonly ATTACK_CHASE_BUFFER = 0.15;
    private static readonly DEFAULT_GROWTH: BarracksGrowthConfig = {
        HP_LINEAR: 0.26,
        HP_QUADRATIC: 0.02,
        ATTACK_LINEAR: 0.18,
        ATTACK_QUADRATIC: 0.025,
        ATTACK_INTERVAL_DECAY_PER_LEVEL: 0.06,
        ATTACK_INTERVAL_MIN_MULTIPLIER: 0.62,
        ATTACK_RANGE_LINEAR: 0.04,
        MOVE_SPEED_LINEAR: 0.04,
        SIZE_LINEAR: 0.14,
        SIZE_QUADRATIC: 0.018,
        SIZE_MAX_MULTIPLIER: 2.2,
    };

    /** 当前追踪的敌人节点（外部可读取） */
    public currentTarget: Node | null = null;
    private _fallbackTimer: number = 0;
    /** 产兵所属建筑 UUID */
    public ownerBuildingId: string | null = null;
    /** 出生来源对象池名（用于死亡回池） */
    public spawnPoolName: string | null = null;
    /** 是否来自对象池 */
    public spawnedFromPool: boolean = false;
    /** 缓存 RigidBody 引用，避免每帧 getComponent */
    private _rbCached: RigidBody | null = null;
    private _rbLookedUp: boolean = false;
    /** 卡住检测（移动状态下长期位移过小则重置目标） */
    private _stuckTimer: number = 0;
    private _proactiveRetargetTimer: number = 0;
    private _lastPosX: number = 0;
    private _lastPosZ: number = 0;
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
        bar.yOffset = Soldier.BASE_HEALTH_BAR_Y_OFFSET;
        bar.width = 60;
        bar.height = 6;

        this._fallbackTimer = this.getFallbackReacquireInterval();
        this._proactiveRetargetTimer = 0;
        this.resetMotionTracking();
        this.applyBarracksLevel(1);
    }

    public onSpawn(): void {
        super.onSpawn();
        this._state = UnitState.IDLE;
        this.currentTarget = null;
        this.ownerBuildingId = null;
        this.spawnPoolName = null;
        this.spawnedFromPool = false;
        this._fallbackTimer = this.getFallbackReacquireInterval();
        this._proactiveRetargetTimer = 0;
        this.resetMotionTracking();
        this.applyBarracksLevel(1);
    }

    public setSpawnSource(poolName: string | null, fromPool: boolean): void {
        this.spawnPoolName = poolName;
        this.spawnedFromPool = fromPool;
    }

    /**
     * 根据兵营等级应用士兵成长（仅影响新生成的士兵）
     */
    public applyBarracksLevel(level: number): void {
        const safeLevel = Math.max(1, Math.floor(level || 1));
        const n = safeLevel - 1;
        const growth = this.getGrowthConfig();

        const hpMultiplier = this.curveMultiplier(n, growth.HP_LINEAR, growth.HP_QUADRATIC);
        const attackMultiplier = this.curveMultiplier(
            n,
            growth.ATTACK_LINEAR,
            growth.ATTACK_QUADRATIC
        );
        const attackIntervalMultiplier = Math.max(
            growth.ATTACK_INTERVAL_MIN_MULTIPLIER,
            1 - growth.ATTACK_INTERVAL_DECAY_PER_LEVEL * n
        );
        const attackRangeMultiplier = 1 + growth.ATTACK_RANGE_LINEAR * n;
        const moveSpeedMultiplier = 1 + growth.MOVE_SPEED_LINEAR * n;
        const sizeMultiplier = Math.min(
            growth.SIZE_MAX_MULTIPLIER,
            this.curveMultiplier(n, growth.SIZE_LINEAR, growth.SIZE_QUADRATIC)
        );

        this.initStats({
            maxHp: Math.round(GameConfig.SOLDIER.BASE_HP * hpMultiplier),
            attack: Math.round(GameConfig.SOLDIER.BASE_ATTACK * attackMultiplier),
            attackRange: GameConfig.SOLDIER.ATTACK_RANGE * attackRangeMultiplier,
            attackInterval: Math.max(
                0.25,
                GameConfig.SOLDIER.ATTACK_INTERVAL * attackIntervalMultiplier
            ),
            moveSpeed: GameConfig.SOLDIER.MOVE_SPEED * moveSpeedMultiplier,
        });

        this.applyModelScale(sizeMultiplier);
    }

    protected update(dt: number): void {
        if (!this.isAlive) return;
        if (!this.gameManager.isPlaying) return;

        // 调用父类更新
        super.update(dt);

        // Mirror target for external reads (CombatSystem assigns target)
        this.currentTarget = this.target ? this.target.node : null;

        // Clear dead targets early to allow re-acquisition
        if (
            this.target &&
            (!this.target.isAlive || !this.target.node || !this.target.node.isValid)
        ) {
            this.setTarget(null);
            this.currentTarget = null;
            this._state = UnitState.IDLE;
            this.stopMovement();
            this._fallbackTimer = this.getFallbackReacquireInterval();
            this._proactiveRetargetTimer = 0;
            this.tryAcquireTargetFallback();
        }

        // Fallback: ensure soldiers can still find targets if CombatSystem is missing or stalled
        if (!this.target) {
            if (this._state !== UnitState.IDLE) {
                this._state = UnitState.IDLE;
                this.stopMovement();
            }
            this._fallbackTimer += dt;
            if (this._fallbackTimer >= this.getFallbackReacquireInterval()) {
                this._fallbackTimer = 0;
                this.tryAcquireTargetFallback();
            }
        } else {
            this._fallbackTimer = 0;
            if (this._state === UnitState.IDLE) {
                this._state = UnitState.MOVING;
            }
            if (this._state !== UnitState.ATTACKING) {
                this._proactiveRetargetTimer += dt;
                if (this._proactiveRetargetTimer >= Soldier.PROACTIVE_RETARGET_INTERVAL) {
                    this._proactiveRetargetTimer = 0;
                    this.tryAcquireTargetFallback(true);
                }
            } else {
                this._proactiveRetargetTimer = 0;
            }
            if (
                this._state === UnitState.ATTACKING &&
                !this.isTargetWithinAttackWindow(this._target, Soldier.ATTACK_CHASE_BUFFER)
            ) {
                this._state = UnitState.MOVING;
            }
        }

        this.updateStuckState(dt);
    }

    /**
     * 由 CombatSystem 调用，设置并进入追击状态
     */
    public engageTarget(target: Unit): void {
        this.setTarget(target);
        this._state = UnitState.MOVING;
        this.currentTarget = target.node;
        this._stuckTimer = 0;
        this._proactiveRetargetTimer = 0;
    }

    protected updateMovement(dt: number): void {
        if (
            !this.isAlive ||
            !this._target ||
            !this._target.isAlive ||
            !this._target.node ||
            !this._target.node.isValid
        ) {
            this._state = UnitState.IDLE;
            this.currentTarget = null;
            this.setTarget(null);
            this.stopMovement();
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
            this.stopMovement();
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
        if (!this._target || !this._target.isAlive) {
            this.setTarget(null);
            this.currentTarget = null;
            this._state = UnitState.IDLE;
            this.stopMovement();
            return;
        }
        if (!this.isTargetWithinAttackWindow(this._target, Soldier.ATTACK_CHASE_BUFFER)) {
            this._state = UnitState.MOVING;
            return;
        }
        this._target.takeDamage(this._stats.attack, this);
    }

    protected onDeath(): void {
        this.stopMovement();
        this.currentTarget = null;
        const bar = this.node.getComponent(HealthBar);
        if (bar && bar.isValid) {
            bar.enabled = false;
        }
        if (!this.node || !this.node.isValid) return;

        if (this.spawnedFromPool && this.spawnPoolName) {
            this.poolManager.despawn(this.spawnPoolName, this.node);
            return;
        }
        this.node.destroy();
    }

    /**
     * Fallback targeting when CombatSystem is not running.
     * NOTE: Keep lightweight. This exists for safety only.
     */
    private tryAcquireTargetFallback(allowRetarget: boolean = false): void {
        const enemies = EnemyQuery.getEnemies();
        if (!enemies || enemies.length === 0) return;

        const myPos = this.node.position;
        let nearestUnit: Unit | null = null;
        let minDistSq = Infinity;

        for (const enemy of enemies) {
            if (!enemy || !enemy.isValid) continue;
            const unit = enemy.getComponent(Unit);
            if (!unit || !unit.isAlive) continue;
            const dx = enemy.position.x - myPos.x;
            const dz = enemy.position.z - myPos.z;
            const distSq = dx * dx + dz * dz;
            if (distSq < minDistSq) {
                minDistSq = distSq;
                nearestUnit = unit;
            }
        }

        if (!nearestUnit) return;
        if (!allowRetarget) {
            this.engageTarget(nearestUnit);
            return;
        }
        if (!this._target || !this._target.isAlive || !this._target.node?.isValid) {
            this.engageTarget(nearestUnit);
            return;
        }
        if (this._target === nearestUnit) return;

        const curDx = this._target.node.position.x - myPos.x;
        const curDz = this._target.node.position.z - myPos.z;
        const currentDistSq = curDx * curDx + curDz * curDz;
        const switchBufferSq = Soldier.RETARGET_SWITCH_BUFFER * Soldier.RETARGET_SWITCH_BUFFER;
        if (minDistSq + switchBufferSq < currentDistSq) {
            this.engageTarget(nearestUnit);
        }
    }

    private isTargetWithinAttackWindow(target: IAttackable | null, extraRange: number): boolean {
        if (!target || !target.isAlive || !target.node || !target.node.isValid) {
            return false;
        }
        const myPos = this.node.position;
        const targetPos = target.node.position;
        const dx = targetPos.x - myPos.x;
        const dz = targetPos.z - myPos.z;
        const distSq = dx * dx + dz * dz;
        const range = Math.max(0.05, this._stats.attackRange + Math.max(0, extraRange));
        return distSq <= range * range;
    }

    private get poolManager(): PoolManager {
        return ServiceRegistry.get<PoolManager>('PoolManager') ?? PoolManager.instance;
    }

    private getFallbackReacquireInterval(): number {
        return Math.min(0.2, GameConfig.COMBAT.TARGET_CHECK_INTERVAL);
    }

    private resetMotionTracking(): void {
        this._stuckTimer = 0;
        this._lastPosX = this.node.position.x;
        this._lastPosZ = this.node.position.z;
    }

    private updateStuckState(dt: number): void {
        const pos = this.node.position;
        const dx = pos.x - this._lastPosX;
        const dz = pos.z - this._lastPosZ;
        const movedSq = dx * dx + dz * dz;
        this._lastPosX = pos.x;
        this._lastPosZ = pos.z;

        if (
            this._state !== UnitState.MOVING ||
            !this._target ||
            !this._target.isAlive ||
            !this._target.node ||
            !this._target.node.isValid
        ) {
            this._stuckTimer = 0;
            return;
        }

        // If soldier keeps "moving" but hardly changes position, force a retarget.
        if (movedSq < 0.0004) {
            this._stuckTimer += dt;
            if (this._stuckTimer >= 0.45) {
                this.setTarget(null);
                this.currentTarget = null;
                this._state = UnitState.IDLE;
                this.stopMovement();
                this._fallbackTimer = this.getFallbackReacquireInterval();
                this._stuckTimer = 0;
                this._proactiveRetargetTimer = 0;
                this.tryAcquireTargetFallback();
            }
            return;
        }

        this._stuckTimer = 0;
    }

    private stopMovement(): void {
        if (!this._rbLookedUp) {
            this._rbCached = this.node.getComponent(RigidBody);
            this._rbLookedUp = true;
        }
        if (!this._rbCached || this._rbCached.type !== RigidBody.Type.DYNAMIC) return;
        Soldier._tmpVel.set(0, 0, 0);
        this._rbCached.setLinearVelocity(Soldier._tmpVel);
    }

    private curveMultiplier(levelOffset: number, linear: number, quadratic: number): number {
        return 1 + linear * levelOffset + quadratic * levelOffset * levelOffset;
    }

    private getGrowthConfig(): BarracksGrowthConfig {
        const growthRaw = (
            GameConfig.SOLDIER as unknown as { BARRACKS_GROWTH?: Partial<BarracksGrowthConfig> }
        ).BARRACKS_GROWTH;

        if (!growthRaw || typeof growthRaw !== 'object') {
            return Soldier.DEFAULT_GROWTH;
        }

        return {
            ...Soldier.DEFAULT_GROWTH,
            ...growthRaw,
        };
    }

    private applyModelScale(sizeMultiplier: number): void {
        const effectiveSize = Math.max(1, sizeMultiplier);
        const visualSizeMultiplier = 1 + (effectiveSize - 1) * Soldier.VISUAL_SIZE_GAIN;

        const bar = this.node.getComponent(HealthBar);
        if (bar) {
            bar.yOffset =
                Soldier.BASE_HEALTH_BAR_Y_OFFSET * Math.max(1, visualSizeMultiplier * 0.92);
        }

        const gooseAnimator = this.node.getComponent('SoldierGooseAnimator') as
            | (Component & { setModelScaleMultiplier?: (multiplier: number) => void })
            | null;
        if (gooseAnimator?.setModelScaleMultiplier) {
            gooseAnimator.setModelScaleMultiplier(visualSizeMultiplier);
            return;
        }

        // Fallback: if visual animator is missing, use node scale directly.
        const modelScale = Soldier.BASE_MODEL_SCALE * Math.max(0.8, visualSizeMultiplier);
        this.node.setScale(modelScale, modelScale, modelScale);
    }
}
