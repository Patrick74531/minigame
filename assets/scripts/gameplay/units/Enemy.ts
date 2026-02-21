import { _decorator, Vec3, ICollisionEvent, BoxCollider, RigidBody, Node } from 'cc';
import { Unit, UnitState, UnitType } from './Unit';
import { GameConfig } from '../../data/GameConfig';
import { EventManager } from '../../core/managers/EventManager';
import { GameManager } from '../../core/managers/GameManager';
import { GameEvents } from '../../data/GameEvents';
import { Building, BuildingType } from '../buildings/Building';
import { IAttackable } from '../../core/interfaces/IAttackable';
import { CombatService } from '../../core/managers/CombatService';
import { Soldier } from './Soldier';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import { EnemyVisualEvents } from '../visuals/EnemyVisualEvents';
import { EnemyProjectile, EnemyProjectileVisualStyle } from '../combat/EnemyProjectile';
import { EnemyQuery } from '../../core/managers/EnemyQuery';

const { ccclass } = _decorator;
type RouteLane = 'top' | 'mid' | 'bottom';
type EnemySpawnType = 'regular' | 'elite' | 'boss';

/**
 * Enemy Unit
 * Moves towards Base. Attacks Buildings (Walls) if path is blocked.
 */
@ccclass('Enemy')
export class Enemy extends Unit {
    /** Distance to Base to trigger "Reached Base" logic */
    private readonly ARRIVAL_DISTANCE = 0.6;
    private static readonly _tmpLookAt = new Vec3();
    private static readonly _tmpMoveVelocity = new Vec3();
    private static readonly _tmpSeparation = new Vec3();
    private static readonly NEAR_LOGIC_STEP = 1 / 24;
    private static readonly FAR_LOGIC_STEP = 1 / 12;
    private static readonly FAR_LOGIC_DIST_SQ = 18 * 18;
    private static readonly MIN_ATTACK_RANGE = 0.3;
    private static readonly RANGED_PROJECTILE_SPEED =
        GameConfig.ENEMY.FLYING_RANGED.PROJECTILE_SPEED;
    private static readonly RANGED_PROJECTILE_LIFETIME =
        GameConfig.ENEMY.FLYING_RANGED.PROJECTILE_LIFETIME;
    private static readonly RANGED_PROJECTILE_HIT_RADIUS =
        GameConfig.ENEMY.FLYING_RANGED.PROJECTILE_HIT_RADIUS;
    private static readonly RANGED_PROJECTILE_SPAWN_OFFSET_Y =
        GameConfig.ENEMY.FLYING_RANGED.PROJECTILE_SPAWN_OFFSET_Y;

    // Target position (Base)
    private _targetPos: Vec3 = new Vec3(0, 0, 0);
    private _isElite: boolean = false;
    private _spawnType: EnemySpawnType = 'regular';
    private _isAttackVisualActive: boolean = false;
    private _logicAccum: number = 0;
    private _aggroRange: number = GameConfig.ENEMY.AGGRO_RANGE;
    private _routeLane: RouteLane = 'mid';
    /** 缓存 paper-doll 视觉判断（避免每 tick getChildByName） */
    private _usesPaperDoll: boolean | null = null;
    /** 缓存 RigidBody（避免每 tick getComponent） */
    private _rbCachedEnemy: RigidBody | null = null;
    private _rbEnemyLookedUp: boolean = false;
    /** 缓存 GameManager / EventManager 引用 */
    private _gmRef: GameManager | null = null;
    private _emRef: EventManager | null = null;

    /** Attack Type: 'standard' (melee), 'ram' (move & collide) or 'ranged' (projectile) */
    public attackType: 'standard' | 'ram' | 'ranged' = 'standard';
    public rangedProjectileStyle: EnemyProjectileVisualStyle = 'default';
    private _crowdSeparationRadius: number = 1.0;
    private _crowdSeparationWeight: number = 1.05;
    private _ramAttackTimer: number = 0;

    protected initialize(): void {
        super.initialize();
        this.unitType = UnitType.ENEMY;

        this.initStats({
            maxHp: GameConfig.ENEMY.BASE_HP,
            attack: GameConfig.ENEMY.BASE_ATTACK,
            attackRange: GameConfig.ENEMY.ATTACK_RANGE,
            attackInterval: GameConfig.ENEMY.ATTACK_INTERVAL,
            moveSpeed: GameConfig.ENEMY.MOVE_SPEED,
        });

        this._state = UnitState.MOVING;
        this.setupPhysics();
    }

    public onSpawn(): void {
        super.onSpawn();
        this._state = UnitState.MOVING;
        this._target = null;
        this._isElite = false;
        this._spawnType = 'regular';
        this._aggroRange = GameConfig.ENEMY.AGGRO_RANGE;
        this._routeLane = 'mid';
        this._scanTimer = 0;
        this._logicAccum = Math.random() * Enemy.NEAR_LOGIC_STEP;
        this._ramAttackTimer = 0;
        this.rangedProjectileStyle = 'default';
        this.resetAttackVisualState();
    }

    private setupPhysics(): void {
        const col = this.node.getComponent(BoxCollider);
        if (col) {
            col.on('onCollisionEnter', this.onCollisionEnter, this);
            col.on('onCollisionStay', this.onCollisionStay, this);
            col.on('onCollisionExit', this.onCollisionExit, this);
        }
    }

    private fireRangedProjectile(target: IAttackable): void {
        const parent = this.node.parent;
        if (!parent || !parent.isValid) return;

        const spawnPos = this.node.position.clone();
        spawnPos.y += Enemy.RANGED_PROJECTILE_SPAWN_OFFSET_Y;

        const targetPos = target.getWorldPosition();
        const direction = new Vec3(targetPos.x - spawnPos.x, 0, targetPos.z - spawnPos.z);
        if (direction.lengthSqr() <= 0.0001) return;

        const projectileNode = new Node('EnemyProjectile');
        projectileNode.setPosition(spawnPos);
        parent.addChild(projectileNode);

        const projectile = projectileNode.addComponent(EnemyProjectile);
        projectile.setVisualStyle(this.rangedProjectileStyle);
        projectile.speed = Enemy.RANGED_PROJECTILE_SPEED;
        projectile.damage = this._stats.attack;
        projectile.maxLifetime = Enemy.RANGED_PROJECTILE_LIFETIME;
        projectile.hitRadius = Enemy.RANGED_PROJECTILE_HIT_RADIUS;
        projectile.launch(direction, this);
    }

    public setRangedProjectileStyle(style: EnemyProjectileVisualStyle): void {
        this.rangedProjectileStyle = style;
    }

    public setCrowdSeparationProfile(config: { radius?: number; weight?: number }): void {
        if (config.radius !== undefined) {
            this._crowdSeparationRadius = Math.max(0, config.radius);
        }
        if (config.weight !== undefined) {
            this._crowdSeparationWeight = Math.max(0, config.weight);
        }
    }

    public setTargetPosition(target: Vec3): void {
        this._targetPos.set(target);
    }

    public setVariant(config: { isElite?: boolean; spawnType?: EnemySpawnType }): void {
        this._isElite = config.isElite ?? false;
        this._spawnType = config.spawnType ?? (this._isElite ? 'elite' : 'regular');
    }

    public setCombatProfile(config: { aggroRange?: number; attackRange?: number }): void {
        if (config.aggroRange !== undefined) {
            this._aggroRange = Math.max(Enemy.MIN_ATTACK_RANGE, config.aggroRange);
        }
        if (config.attackRange !== undefined) {
            this._stats.attackRange = Math.max(Enemy.MIN_ATTACK_RANGE, config.attackRange);
        }
    }

    public setRouteLane(lane: RouteLane): void {
        this._routeLane = lane;
    }

    public get routeLane(): RouteLane {
        return this._routeLane;
    }

    public get isElite(): boolean {
        return this._isElite;
    }

    public get spawnType(): EnemySpawnType {
        return this._spawnType;
    }

    protected updateMovement(dt: number): void {
        if (!this.isAlive) return;

        if (!this._rbEnemyLookedUp) {
            this._rbCachedEnemy = this.node.getComponent(RigidBody);
            this._rbEnemyLookedUp = true;
        }

        // If Attacking, Don't move (unless it's a 'ram' type enemy)
        if (this._state === UnitState.ATTACKING && this.attackType !== 'ram') {
            this.stopMovement();
            return;
        }

        // For Standard enemies: if target is in range, stop moving (handled by state transition usually, but double check here)
        if (this.attackType !== 'ram' && this._target && this.isTargetInRange(this._target)) {
            this.stopMovement();
            return;
        }

        const pos = this.node.position;
        const targetNode = this._target && this._target.isAlive ? this._target.node : null;
        const movingToBase = !targetNode;
        const moveTargetX = targetNode ? targetNode.position.x : this._targetPos.x;
        const moveTargetZ = targetNode ? targetNode.position.z : this._targetPos.z;

        // 3D: Distance to target on XZ plane
        const dx = moveTargetX - pos.x;
        const dz = moveTargetZ - pos.z;
        const distToTarget = Math.sqrt(dx * dx + dz * dz);

        // Check if reached Base
        if (movingToBase && distToTarget < this.ARRIVAL_DISTANCE) {
            this.stopMovement();
            this.onReachBase();
            return;
        }
        if (distToTarget <= 0.0001) {
            this.stopMovement();
            return;
        }

        // Move towards Base
        const speed = this.moveSpeed;
        const dirX = dx / distToTarget;
        const dirZ = dz / distToTarget;
        let desiredX = dirX;
        let desiredZ = dirZ;
        this.computeCrowdSeparation(pos, Enemy._tmpSeparation);
        if (Enemy._tmpSeparation.lengthSqr() > 0.0001 && this._crowdSeparationWeight > 0.001) {
            desiredX += Enemy._tmpSeparation.x * this._crowdSeparationWeight;
            desiredZ += Enemy._tmpSeparation.z * this._crowdSeparationWeight;
            const desiredLenSq = desiredX * desiredX + desiredZ * desiredZ;
            if (desiredLenSq > 0.0001) {
                const inv = 1 / Math.sqrt(desiredLenSq);
                desiredX *= inv;
                desiredZ *= inv;
            } else {
                desiredX = dirX;
                desiredZ = dirZ;
            }
        }

        // Use physics velocity so enemy-enemy collision separation can work.
        if (this._rbCachedEnemy && this._rbCachedEnemy.type === RigidBody.Type.DYNAMIC) {
            Enemy._tmpMoveVelocity.set(desiredX * speed, 0, desiredZ * speed);
            this._rbCachedEnemy.setLinearVelocity(Enemy._tmpMoveVelocity);
        } else {
            this.node.setPosition(
                pos.x + desiredX * speed * dt,
                GameConfig.PHYSICS.ENEMY_Y,
                pos.z + desiredZ * speed * dt
            );
        }

        // Face target (paper-doll enemy uses billboard visuals, so root rotation is unnecessary).
        if (!this.isPaperDoll()) {
            Enemy._tmpLookAt.set(moveTargetX, GameConfig.PHYSICS.ENEMY_Y, moveTargetZ);
            this.node.lookAt(Enemy._tmpLookAt);
        }
    }

    private onCollisionEnter(event: ICollisionEvent): void {
        this.checkCollision(event);
    }

    private onCollisionStay(event: ICollisionEvent): void {
        // If not already targeting something, check collision
        if (!this._target) {
            this.checkCollision(event);
        }
    }

    private checkCollision(event: ICollisionEvent): void {
        const other = event.otherCollider;

        // Check if it's the Hero
        const heroUnit = other.node.getComponent(Unit);
        if (heroUnit && heroUnit.unitType === UnitType.HERO && heroUnit.isAlive) {
            this.setTarget(heroUnit);
            this._state = this.isTargetInRange(heroUnit) ? UnitState.ATTACKING : UnitState.MOVING;
            return;
        }

        // Check if it's an Attackable Building involved in collision
        const building = other.node.getComponent(Building);
        if (building && building.isAlive) {
            this.setTarget(building);
            this._state = this.isTargetInRange(building) ? UnitState.ATTACKING : UnitState.MOVING;
        }
    }

    private onCollisionExit(event: ICollisionEvent): void {
        const other = event.otherCollider;
        const building = other.node.getComponent(Building);
        if (building && building === this._target) {
            // Target left collision?
            // If it's still in "Aggro Range" we might keep attacking.
            // But if we relied on collision to attack, we might lose it here.
            // For now, let Aggro Logic handle keeping target if close.
            // But if it was a blocking wall we passed?
            // Let's rely on update loop to clear target if out of range.
        }
    }

    /**
     * Arrived at Base
     */
    private onReachBase(): void {
        this.stopMovement();
        this.resetAttackVisualState();
        this.eventManager.emit(GameEvents.ENEMY_REACHED_BASE, {
            enemy: this.node,
            damage: GameConfig.ENEMY.BASE_REACH_DAMAGE,
        });

        this._state = UnitState.DEAD;
        this.node.destroy();
    }

    protected performAttack(): void {
        if (this._target && this._target.isAlive) {
            const damage = this._stats.attack;
            if (this.attackType === 'ranged') {
                this.fireRangedProjectile(this._target);
            } else {
                this._target.takeDamage(damage, this);
            }
            this.node.emit(EnemyVisualEvents.ATTACK_PERFORMED, {
                attackInterval: this._stats.attackInterval,
                damage,
            });
            // console.log(`[Enemy] Attacked ${this._target.node.name}`);
        } else {
            // Nothing to attack
            this._state = UnitState.MOVING;
            this._target = null;
        }
    }

    // === Aggro Logic ===

    private _scanTimer: number = 0;

    protected update(dt: number): void {
        if (!this.gameManager.isPlaying) return;
        const logicStep = this.resolveLogicStep();
        this._logicAccum += dt;
        if (this._logicAccum < logicStep) {
            return;
        }
        const tickDt = Math.min(this._logicAccum, logicStep * 2);
        this._logicAccum = 0;

        super.update(tickDt);
        if (!this.isAlive) return;

        // Check if current target is dead or invalid
        if (this._target) {
            if (!this._target.isAlive || !this._target.node.isValid) {
                this._target = null;
                this._state = UnitState.MOVING;
            } else {
                if (!this.isTargetInAggroRange(this._target)) {
                    this._target = null;
                    this._state = UnitState.MOVING;
                } else if (this.isTargetInRange(this._target)) {
                    // If we have a target, check if it is still in attack range
                    this._state = UnitState.ATTACKING;
                    // Face the target for non-paper visuals.
                    if (!this.isPaperDoll()) {
                        const targetPos = this._target.getWorldPosition();
                        Enemy._tmpLookAt.set(targetPos.x, GameConfig.PHYSICS.ENEMY_Y, targetPos.z);
                        this.node.lookAt(Enemy._tmpLookAt);
                    }
                } else {
                    this._state = UnitState.MOVING;
                }
            }
        }

        // Scan for new targets periodically if not attacking
        if (this._state !== UnitState.ATTACKING) {
            this._scanTimer += tickDt;
            if (this._scanTimer >= 0.2) {
                // 5 times a second
                this._scanTimer = 0;
                this.scanForTargets();
            }
        }

        this.syncAttackVisualState();

        // --- Ram Attack Logic ---
        if (this.attackType === 'ram' && this._state === UnitState.ATTACKING) {
            this._ramAttackTimer += tickDt;
            if (this._ramAttackTimer >= this._stats.attackInterval) {
                this._ramAttackTimer = 0;
                this.performAttack();
            }
        }
    }

    protected isTargetInRange(target: IAttackable): boolean {
        const myPos = this.node.position;
        const targetPos = target.node.position;
        const dx = targetPos.x - myPos.x;
        const dz = targetPos.z - myPos.z;
        const distSq = dx * dx + dz * dz;
        return distSq <= this.getAttackRangeSq();
    }

    private getAttackRangeSq(): number {
        const attackRange = Math.max(Enemy.MIN_ATTACK_RANGE, this._stats.attackRange);
        return attackRange * attackRange;
    }

    private isTargetInAggroRange(target: IAttackable): boolean {
        const myPos = this.node.position;
        const targetPos = target.node.position;
        const dx = targetPos.x - myPos.x;
        const dz = targetPos.z - myPos.z;
        const distSq = dx * dx + dz * dz;
        let aggroRange = Math.max(Enemy.MIN_ATTACK_RANGE, this._aggroRange);

        if (target instanceof Building && target.tauntRange > 0) {
            aggroRange = Math.max(aggroRange, target.tauntRange);
        }

        return distSq <= aggroRange * aggroRange;
    }

    /**
     * Scan for Soldiers or Buildings to attack
     */
    protected scanForTargets(): void {
        const myPos = this.node.position;
        const aggroSq = this._aggroRange * this._aggroRange;

        // 1. Check for nearby Hero (highest priority melee target)
        const heroNode = this.gameManager.hero;
        if (heroNode && heroNode.isValid) {
            const heroUnit = heroNode.getComponent(Unit);
            if (heroUnit && heroUnit.isAlive) {
                const dx = heroNode.position.x - myPos.x;
                const dz = heroNode.position.z - myPos.z;
                const distSq = dx * dx + dz * dz;
                if (distSq < aggroSq) {
                    this.setTarget(heroUnit);
                    this._state = this.isTargetInRange(heroUnit)
                        ? UnitState.ATTACKING
                        : UnitState.MOVING;
                    return;
                }
            }
        }

        // 2. 防御建筑嘲讽（仅对敌人生效）
        const tauntBuilding = this.findNearestBuildingInAggro(myPos, aggroSq, true);
        if (tauntBuilding) {
            this.setTarget(tauntBuilding);
            this._state = this.isTargetInRange(tauntBuilding)
                ? UnitState.ATTACKING
                : UnitState.MOVING;
            return;
        }

        // 3. Check for nearby Soldiers (ranged flying enemies ignore soldiers)
        if (this.attackType !== 'ranged') {
            const provider = CombatService.provider;
            if (provider && provider.findSoldierInRange) {
                const soldier = provider.findSoldierInRange(
                    myPos,
                    this._aggroRange
                ) as Soldier | null;
                if (soldier && soldier.isAlive) {
                    this.setTarget(soldier);
                    this._state = this.isTargetInRange(soldier)
                        ? UnitState.ATTACKING
                        : UnitState.MOVING;
                    return;
                }
            }
        }

        // 4. Check for nearby Buildings
        const nearestBuilding = this.findNearestBuildingInAggro(myPos, aggroSq, false);
        if (nearestBuilding) {
            this.setTarget(nearestBuilding);
            this._state = this.isTargetInRange(nearestBuilding)
                ? UnitState.ATTACKING
                : UnitState.MOVING;
        }
    }

    private findNearestBuildingInAggro(
        myPos: Vec3,
        aggroSq: number,
        defensiveOnly: boolean
    ): Building | null {
        const buildingNodes = this.gameManager.activeBuildings;
        if (!buildingNodes || buildingNodes.length <= 0) return null;

        let nearest: Building | null = null;
        let minDistSq = Number.MAX_VALUE;

        for (const bNode of buildingNodes) {
            if (!bNode || !bNode.isValid) continue;
            const bComp = bNode.getComponent(Building);
            if (!bComp || !bComp.isAlive) continue;
            if (defensiveOnly && !this.isDefensiveTauntBuilding(bComp)) continue;

            const dx = bNode.position.x - myPos.x;
            const dz = bNode.position.z - myPos.z;
            const distSq = dx * dx + dz * dz;

            // Use larger of Enemy Aggro or Building Taunt Range
            const buildingTauntSq = bComp.tauntRange ? bComp.tauntRange * bComp.tauntRange : 0;
            const checkRangeSq = Math.max(aggroSq, buildingTauntSq);

            if (distSq < checkRangeSq) {
                if (distSq < minDistSq) {
                    minDistSq = distSq;
                    nearest = bComp;
                }
            }
        }

        return nearest;
    }

    private isDefensiveTauntBuilding(building: Building): boolean {
        return (
            building.buildingType === BuildingType.TOWER ||
            building.buildingType === BuildingType.WALL ||
            building.buildingType === BuildingType.BASE
        );
    }

    // Override setTarget to handle state change?
    // public setTarget(...): void { super.setTarget(...); ... }

    protected onDeath(): void {
        this.stopMovement();
        this.resetAttackVisualState();
        // 延迟销毁节点，让金币掉落/视觉事件有时间处理
        // 避免死亡敌人节点及其 HealthBarRoot 永久残留在场景中
        this.scheduleOnce(() => {
            if (this.node && this.node.isValid) {
                this.node.destroy();
            }
        }, 0.1);
    }

    private resolveLogicStep(): number {
        if (this._state === UnitState.ATTACKING || (this._target && this._target.isAlive)) {
            return Enemy.NEAR_LOGIC_STEP;
        }

        const heroNode = this.gameManager.hero;
        if (!heroNode || !heroNode.isValid) {
            return Enemy.NEAR_LOGIC_STEP;
        }

        const myPos = this.node.position;
        const dx = heroNode.position.x - myPos.x;
        const dz = heroNode.position.z - myPos.z;
        const distSq = dx * dx + dz * dz;
        return distSq > Enemy.FAR_LOGIC_DIST_SQ ? Enemy.FAR_LOGIC_STEP : Enemy.NEAR_LOGIC_STEP;
    }

    private syncAttackVisualState(): void {
        const isAttacking =
            this._state === UnitState.ATTACKING && !!this._target && this._target.isAlive;
        if (isAttacking === this._isAttackVisualActive) {
            return;
        }
        this._isAttackVisualActive = isAttacking;
        this.node.emit(EnemyVisualEvents.ATTACK_STATE_CHANGED, {
            isAttacking,
            attackInterval: this._stats.attackInterval,
        });
    }

    private resetAttackVisualState(): void {
        this._isAttackVisualActive = false;
        this.node.emit(EnemyVisualEvents.ATTACK_STATE_CHANGED, {
            isAttacking: false,
            attackInterval: this._stats.attackInterval,
        });
    }

    private isPaperDoll(): boolean {
        if (this._usesPaperDoll === true) {
            return true;
        }

        const hasPaperVisual =
            !!this.node.getChildByName('EnemyPaperRoot') ||
            !!this.node.getChildByName('EnemyVacuumRoot');
        this._usesPaperDoll = hasPaperVisual;
        return this._usesPaperDoll;
    }

    private stopMovement(): void {
        if (this._rbCachedEnemy && this._rbCachedEnemy.type === RigidBody.Type.DYNAMIC) {
            this._rbCachedEnemy.setLinearVelocity(Vec3.ZERO);
        }
    }

    private computeCrowdSeparation(myPos: Vec3, out: Vec3): void {
        out.set(0, 0, 0);
        const radius = this._crowdSeparationRadius;
        if (radius <= 0.0001) return;

        const radiusSq = radius * radius;
        const enemies = EnemyQuery.getEnemies();
        for (const enemy of enemies) {
            if (!enemy || !enemy.isValid || enemy === this.node) continue;

            const dx = myPos.x - enemy.position.x;
            const dz = myPos.z - enemy.position.z;
            const distSq = dx * dx + dz * dz;
            if (distSq <= 0.0001 || distSq >= radiusSq) continue;

            const dist = Math.sqrt(distSq);
            const push = (radius - dist) / radius;
            out.x += (dx / dist) * push;
            out.z += (dz / dist) * push;
        }

        const lenSq = out.x * out.x + out.z * out.z;
        if (lenSq > 0.0001) {
            const inv = 1 / Math.sqrt(lenSq);
            out.x *= inv;
            out.z *= inv;
        }
    }

    protected get eventManager(): EventManager {
        if (!this._emRef) {
            this._emRef =
                ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
        }
        return this._emRef;
    }

    protected get gameManager(): GameManager {
        if (!this._gmRef) {
            this._gmRef = ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
        }
        return this._gmRef;
    }
}
