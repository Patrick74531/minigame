import { _decorator, Component, Node, Vec3, RigidBody } from 'cc';
import { Unit, UnitState, UnitType } from './Unit';
import { GameConfig } from '../../data/GameConfig';
import { HealthBar } from '../../ui/HealthBar';
import { EnemyQuery } from '../../core/managers/EnemyQuery';
import { PoolManager } from '../../core/managers/PoolManager';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import { EffectFactory } from '../effects/EffectFactory';

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
    private static readonly RETARGET_INTERVAL = 0.1;
    private static readonly EXPLOSION_TRIGGER_DISTANCE = 0.95;
    private static readonly EXPLOSION_DAMAGE_MULTIPLIER = 1.35;
    private static readonly EXPLOSION_TOWER_DAMAGE_FACTOR = 2.0;
    private static readonly EXPLOSION_VFX_LEVEL_GAIN = 0.2;
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
    private _retargetTimer: number = Soldier.RETARGET_INTERVAL;
    /** 产兵所属建筑 UUID */
    public ownerBuildingId: string | null = null;
    /** 出生来源对象池名（用于死亡回池） */
    public spawnPoolName: string | null = null;
    /** 是否来自对象池 */
    public spawnedFromPool: boolean = false;
    /** 缓存 RigidBody 引用，避免每帧 getComponent */
    private _rbCached: RigidBody | null = null;
    private _rbLookedUp: boolean = false;
    private _hasExploded: boolean = false;
    private _barracksLevel: number = 1;
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

        this._retargetTimer = Soldier.RETARGET_INTERVAL;
        this.applyBarracksLevel(1);
    }

    public onSpawn(): void {
        super.onSpawn();
        this._state = UnitState.IDLE;
        this.currentTarget = null;
        this.ownerBuildingId = null;
        this.spawnPoolName = null;
        this.spawnedFromPool = false;
        this._hasExploded = false;
        // CRITICAL: Reset RigidBody cache — stale references from previous lifecycle
        // cause setLinearVelocity to silently fail ("ghost soldier" bug)
        this._rbCached = null;
        this._rbLookedUp = false;
        this._retargetTimer = Soldier.RETARGET_INTERVAL;
        this._barracksLevel = 1;
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
        this._barracksLevel = safeLevel;
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

        // Simplified control loop:
        // periodic global retarget -> if target exists, move/explode; otherwise idle.
        this._retargetTimer += dt;
        if (this._retargetTimer >= Soldier.RETARGET_INTERVAL) {
            this._retargetTimer = 0;
            this.refreshNearestTarget();
        }

        if (!this.hasValidTarget()) {
            this.setTarget(null);
            this.currentTarget = null;
            this._state = UnitState.IDLE;
            this.stopMovement();
            return;
        }

        this.currentTarget = this._target!.node;
        this._state = UnitState.MOVING;
        super.update(dt);
    }

    /**
     * 由 CombatSystem 调用，设置并进入追击状态
     */
    public engageTarget(target: Unit): void {
        if (!target || !target.isAlive || !target.node || !target.node.isValid) return;
        this.setTarget(target);
        this._state = UnitState.MOVING;
        this.currentTarget = target.node;
        this._retargetTimer = 0;
    }

    protected updateMovement(dt: number): void {
        if (!this.hasValidTarget()) {
            this._state = UnitState.IDLE;
            this.currentTarget = null;
            this.setTarget(null);
            this.stopMovement();
            return;
        }

        const target = this._target;
        if (!target || !target.node || !target.node.isValid) {
            this._state = UnitState.IDLE;
            this.currentTarget = null;
            this.setTarget(null);
            this.stopMovement();
            return;
        }

        const myPos = this.node.position;
        const targetPos = target.node.position;
        const dx = targetPos.x - myPos.x;
        const dz = targetPos.z - myPos.z; // 3D
        const distSq = dx * dx + dz * dz;
        const triggerRangeSq =
            Soldier.EXPLOSION_TRIGGER_DISTANCE * Soldier.EXPLOSION_TRIGGER_DISTANCE;
        if (distSq <= triggerRangeSq) {
            this.explode();
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
        // Soldier combat is movement-driven; keep this as safe fallback.
        this.explode();
    }

    protected onDeath(): void {
        this.stopMovement();
        this.currentTarget = null;
        this.setTarget(null);
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

    private refreshNearestTarget(): void {
        const nearest = this.findNearestEnemyUnit();
        if (!nearest) {
            this.setTarget(null);
            return;
        }
        if (this._target !== nearest) {
            this.setTarget(nearest);
        }
    }

    private findNearestEnemyUnit(): Unit | null {
        const enemies = EnemyQuery.getEnemies();
        if (!enemies || enemies.length <= 0) return null;

        const myPos = this.node.position;
        let nearestUnit: Unit | null = null;
        let minDistSq = Number.POSITIVE_INFINITY;

        for (const enemy of enemies) {
            if (!enemy || !enemy.isValid || !enemy.activeInHierarchy) continue;
            const unit = enemy.getComponent(Unit);
            if (!unit || !unit.isAlive || !unit.node || !unit.node.isValid) continue;

            const dx = enemy.position.x - myPos.x;
            const dz = enemy.position.z - myPos.z;
            const distSq = dx * dx + dz * dz;
            if (distSq < minDistSq) {
                minDistSq = distSq;
                nearestUnit = unit;
            }
        }

        return nearestUnit;
    }

    private hasValidTarget(): boolean {
        return !!(
            this._target &&
            this._target.isAlive &&
            this._target.node &&
            this._target.node.isValid &&
            this._target.node.activeInHierarchy
        );
    }

    private get poolManager(): PoolManager {
        return ServiceRegistry.get<PoolManager>('PoolManager') ?? PoolManager.instance;
    }

    private explode(): void {
        if (this._hasExploded || !this.isAlive) return;
        this._hasExploded = true;
        this.stopMovement();

        const radius = this.resolveExplosionRadius();
        const radiusSq = radius * radius;
        const damage = this.resolveExplosionDamage();
        const myPos = this.node.position;

        this.playExplosionVfx(myPos, radius);

        const enemies = EnemyQuery.getEnemies();
        for (const enemy of enemies) {
            if (!enemy || !enemy.isValid || !enemy.activeInHierarchy) continue;
            const unit = enemy.getComponent(Unit);
            if (!unit || !unit.isAlive || !unit.node || !unit.node.isValid) continue;

            const dx = unit.node.position.x - myPos.x;
            const dz = unit.node.position.z - myPos.z;
            const distSq = dx * dx + dz * dz;
            if (distSq <= radiusSq) {
                unit.takeDamage(damage, this);
            }
        }

        this.setTarget(null);
        this.currentTarget = null;
        this.die();
    }

    private resolveExplosionRadius(): number {
        return Math.max(0.8, Math.min(2.4, this._stats.attackRange * 0.9));
    }

    private resolveExplosionDamage(): number {
        const scaledBySelf = Math.max(
            1,
            Math.floor(this._stats.attack * Soldier.EXPLOSION_DAMAGE_MULTIPLIER)
        );
        const towerSingleHit = this.resolveTowerSingleHitDamage();
        const minByTower = Math.ceil(towerSingleHit * Soldier.EXPLOSION_TOWER_DAMAGE_FACTOR);
        return Math.max(scaledBySelf, minByTower);
    }

    private resolveTowerSingleHitDamage(): number {
        const rawDamage = (
            GameConfig.BUILDING as unknown as {
                TYPES?: {
                    tower?: {
                        stats?: {
                            attackDamage?: number;
                        };
                    };
                };
            }
        ).TYPES?.tower?.stats?.attackDamage;

        if (typeof rawDamage === 'number' && Number.isFinite(rawDamage) && rawDamage > 0) {
            return rawDamage;
        }

        return 1;
    }

    private playExplosionVfx(origin: Vec3, gameplayRadius: number): void {
        const parent = this.node.parent ?? this.node;
        EffectFactory.createGooseExplosion(
            parent,
            origin.clone(),
            this.resolveExplosionVfxRadius(gameplayRadius)
        );
    }

    private resolveExplosionVfxRadius(gameplayRadius: number): number {
        const levelBonus = Math.max(0, this._barracksLevel - 1);
        const levelScale = 1 + levelBonus * Soldier.EXPLOSION_VFX_LEVEL_GAIN;
        return Math.max(0.8, gameplayRadius * levelScale);
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
