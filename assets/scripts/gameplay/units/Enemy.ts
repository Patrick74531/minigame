import { _decorator, Vec3, ICollisionEvent, BoxCollider, RigidBody } from 'cc';
import { Unit, UnitState, UnitType } from './Unit';
import { GameConfig } from '../../data/GameConfig';
import { EventManager } from '../../core/managers/EventManager';
import { GameManager } from '../../core/managers/GameManager';
import { GameEvents } from '../../data/GameEvents';
import { Building } from '../buildings/Building';
import { IAttackable } from '../../core/interfaces/IAttackable';
import { CombatService } from '../../core/managers/CombatService';
import { Soldier } from './Soldier';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';

const { ccclass, property } = _decorator;

/**
 * Enemy Unit
 * Moves towards Base. Attacks Buildings (Walls) if path is blocked.
 */
@ccclass('Enemy')
export class Enemy extends Unit {
    /** Distance to Base to trigger "Reached Base" logic */
    private readonly ARRIVAL_DISTANCE = 0.6;
    private static readonly _tmpLookAt = new Vec3();

    // Target position (Base)
    private _targetPos: Vec3 = new Vec3(0, 0, 0);
    private _isElite: boolean = false;
    private _coinDropMultiplier: number = 1;

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
        this._coinDropMultiplier = 1;
    }

    private setupPhysics(): void {
        const col = this.node.getComponent(BoxCollider);
        if (col) {
            col.on('onCollisionEnter', this.onCollisionEnter, this);
            col.on('onCollisionStay', this.onCollisionStay, this);
            col.on('onCollisionExit', this.onCollisionExit, this);
        }
    }

    public setTargetPosition(target: Vec3): void {
        this._targetPos.set(target);
    }

    public setVariant(config: { isElite?: boolean; coinDropMultiplier?: number }): void {
        this._isElite = config.isElite ?? false;
        this._coinDropMultiplier = config.coinDropMultiplier ?? 1;
    }

    public get isElite(): boolean {
        return this._isElite;
    }

    public get coinDropMultiplier(): number {
        return this._coinDropMultiplier;
    }

    protected updateMovement(dt: number): void {
        if (!this.isAlive) return;

        // 清除 RigidBody 残余速度，避免物理引擎干扰 setPosition 移动
        const rb = this.node.getComponent(RigidBody);
        if (rb && rb.type === RigidBody.Type.DYNAMIC) {
            rb.setLinearVelocity(Vec3.ZERO);
        }

        // If Attacking, Don't move
        if (
            this._state === UnitState.ATTACKING ||
            (this._target && this.isTargetInRange(this._target))
        ) {
            return;
        }

        const pos = this.node.position;
        // 3D: Distance to target on XZ plane
        const dx = this._targetPos.x - pos.x;
        const dz = this._targetPos.z - pos.z;
        const distToTarget = Math.sqrt(dx * dx + dz * dz);

        // Check if reached Base
        if (distToTarget < this.ARRIVAL_DISTANCE) {
            this.onReachBase();
            return;
        }

        // Move towards Base
        const speed = this.moveSpeed;
        const dirX = dx / distToTarget;
        const dirZ = dz / distToTarget;

        // Simple movement (Kinematic or manual)
        this.node.setPosition(
            pos.x + dirX * speed * dt,
            GameConfig.PHYSICS.ENEMY_Y,
            pos.z + dirZ * speed * dt
        );

        // Face target (paper-doll enemy uses billboard visuals, so root rotation is unnecessary).
        if (!this.usesPaperDollVisual()) {
            Enemy._tmpLookAt.set(this._targetPos.x, GameConfig.PHYSICS.ENEMY_Y, this._targetPos.z);
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
            this._state = UnitState.ATTACKING;
            return;
        }

        // Check if it's an Attackable Building involved in collision
        const building = other.node.getComponent(Building);
        if (building && building.isAlive) {
            this.setTarget(building);
            this._state = UnitState.ATTACKING;
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
        this.eventManager.emit(GameEvents.ENEMY_REACHED_BASE, {
            enemy: this.node,
            damage: 10,
        });

        this._state = UnitState.DEAD;
        this.node.destroy();
    }

    protected performAttack(): void {
        if (this._target && this._target.isAlive) {
            // Deal damage
            this._target.takeDamage(this._stats.attack, this);
            // console.log(`[Enemy] Attacked ${this._target.node.name}`);
        } else {
            // Nothing to attack
            this._state = UnitState.MOVING;
            this._target = null;
        }
    }

    // === Aggro Logic ===

    private readonly AGGRO_RANGE = 3.0;
    private _scanTimer: number = 0;

    protected update(dt: number): void {
        super.update(dt);
        if (!this.isAlive) return;

        // Check if current target is dead or invalid
        if (this._target) {
            if (!this._target.isAlive || !this._target.node.isValid) {
                this._target = null;
                this._state = UnitState.MOVING;
            } else {
                // If we have a target, check if it is still in range
                if (this.isTargetInRange(this._target)) {
                    this._state = UnitState.ATTACKING;
                    // Face the target for non-paper visuals.
                    if (!this.usesPaperDollVisual()) {
                        const targetPos = this._target.getWorldPosition();
                        Enemy._tmpLookAt.set(targetPos.x, GameConfig.PHYSICS.ENEMY_Y, targetPos.z);
                        this.node.lookAt(Enemy._tmpLookAt);
                    }
                } else {
                    // Chase target? Or give up?
                    // For now, if out of range, resume moving to Base (ignore chasing for simple enemies)
                    // Or we could implement chasing logic here.
                    // Let's stick to "Move to Base, but attack if blocked/close"
                    this._target = null;
                    this._state = UnitState.MOVING;
                }
            }
        }

        // Scan for new targets periodically if not attacking
        if (this._state !== UnitState.ATTACKING) {
            this._scanTimer += dt;
            if (this._scanTimer >= 0.2) {
                // 5 times a second
                this._scanTimer = 0;
                this.scanForTargets();
            }
        }
    }

    protected isTargetInRange(target: IAttackable): boolean {
        const myPos = this.node.position;
        const targetPos = target.node.position;
        const dx = targetPos.x - myPos.x;
        const dz = targetPos.z - myPos.z;
        const distSq = dx * dx + dz * dz;
        // Check overlap or generic attack range.
        // For walls (buildings), we might want collision check, but distance matches AGGRO_RANGE logic.
        return distSq <= this.AGGRO_RANGE * this.AGGRO_RANGE;
    }

    /**
     * Scan for Soldiers or Buildings to attack
     */
    protected scanForTargets(): void {
        const myPos = this.node.position;
        const aggroSq = this.AGGRO_RANGE * this.AGGRO_RANGE;

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
                    this._state = UnitState.ATTACKING;
                    return;
                }
            }
        }

        // 2. Check for nearby Soldiers
        const provider = CombatService.provider;
        if (provider && provider.findSoldierInRange) {
            const soldier = provider.findSoldierInRange(myPos, this.AGGRO_RANGE) as Soldier | null;
            if (soldier && soldier.isAlive) {
                this.setTarget(soldier);
                this._state = UnitState.ATTACKING;
                return;
            }
        }

        // 3. Check for nearby Buildings
        const buildingNodes = this.gameManager.activeBuildings;
        if (buildingNodes && buildingNodes.length > 0) {
            let nearest: Building | null = null;
            let minDistSq = aggroSq;

            for (const bNode of buildingNodes) {
                if (!bNode.isValid) continue;

                const dx = bNode.position.x - myPos.x;
                const dz = bNode.position.z - myPos.z;
                const distSq = dx * dx + dz * dz;

                if (distSq < minDistSq) {
                    const bComp = bNode.getComponent(Building);
                    if (bComp && bComp.isAlive) {
                        minDistSq = distSq;
                        nearest = bComp;
                    }
                }
            }

            if (nearest) {
                this.setTarget(nearest);
                this._state = UnitState.ATTACKING;
            }
        }
    }

    // Override setTarget to handle state change?
    // public setTarget(...): void { super.setTarget(...); ... }

    protected onDeath(): void {
        // Handled by manager
    }

    private usesPaperDollVisual(): boolean {
        return !!this.node.getChildByName('EnemyPaperRoot');
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }

    private get gameManager(): GameManager {
        return ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
    }
}
