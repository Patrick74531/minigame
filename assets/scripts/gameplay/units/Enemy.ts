import { _decorator, Vec3, ICollisionEvent, BoxCollider } from 'cc';
import { Unit, UnitState, UnitType } from './Unit';
import { GameConfig } from '../../data/GameConfig';
import { EventManager } from '../../core/managers/EventManager';
import { GameManager } from '../../core/managers/GameManager';
import { GameEvents } from '../../data/GameEvents';
import { Building } from '../buildings/Building';

const { ccclass, property } = _decorator;

/**
 * Enemy Unit
 * Moves towards Base. Attacks Buildings (Walls) if path is blocked.
 */
@ccclass('Enemy')
export class Enemy extends Unit {
    /** Distance to Base to trigger "Reached Base" logic */
    private readonly ARRIVAL_DISTANCE = 0.6;
    
    // Target position (Base)
    private _targetPos: Vec3 = new Vec3(0, 0, 0);

    // Current blocking building (e.g., Wall)
    private _blockedTarget: Building | null = null;

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
        this._blockedTarget = null;
    }

    private setupPhysics(): void {
        const col = this.node.getComponent(BoxCollider);
        if (col) {
            col.on('onCollisionEnter', this.onCollisionEnter, this);
            col.on('onCollisionStay', this.onCollisionStay, this);
            col.on('onCollisionExit', this.onCollisionExit, this);
        }
    }

    public setTarget(target: Vec3): void {
        this._targetPos.set(target);
    }

    protected updateMovement(dt: number): void {
        if (!this.isAlive) return;

        // If blocked by a building, switch to ATTACKING
        if (this._blockedTarget) {
            if (this._blockedTarget.isAlive) {
                this._state = UnitState.ATTACKING;
                return;
            } else {
                // Target destroyed, resume moving
                this._blockedTarget = null;
                this._state = UnitState.MOVING;
            }
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
            0.5, 
            pos.z + dirZ * speed * dt
        );
        
        // Face target
        this.node.lookAt(new Vec3(this._targetPos.x, 0.5, this._targetPos.z));
    }

    private onCollisionEnter(event: ICollisionEvent): void {
        this.checkCollision(event);
    }

    private onCollisionStay(event: ICollisionEvent): void {
         if (!this._blockedTarget) {
             this.checkCollision(event);
         }
    }

    private checkCollision(event: ICollisionEvent): void {
        const other = event.otherCollider;
        
        // Check if it's a Building (Wall)
        const building = other.node.getComponent(Building);
        if (building && building.isAlive) {
            // Assume we are blocked if we hit a building
            // In a better physics system, we'd check if it's "blocking" our path.
            // For now, if we touch a wall, we attack it.
            this._blockedTarget = building;
            this._state = UnitState.ATTACKING;
        }
    }

    private onCollisionExit(event: ICollisionEvent): void {
        const other = event.otherCollider;
        const building = other.node.getComponent(Building);
        if (building && building === this._blockedTarget) {
            this._blockedTarget = null;
            this._state = UnitState.MOVING;
        }
    }

    /**
     * Arrived at Base
     */
    private onReachBase(): void {
        EventManager.instance.emit(GameEvents.ENEMY_REACHED_BASE, {
            enemy: this.node,
            damage: 10
        });
        
        this._state = UnitState.DEAD;
        this.node.destroy();
    }

    protected performAttack(): void {
        // Attack Blocked Building
        if (this._blockedTarget && this._blockedTarget.isAlive) {
            this._blockedTarget.takeDamage(this._stats.attack);
        } else if (this._target && this._target.isAlive) {
             // Default Unit Attack (if fighting soldiers)
             this._target.takeDamage(this._stats.attack, this);
        } else {
            // Nothing to attack
            this._state = UnitState.MOVING;
        }
    }

    // === Aggro Logic ===
    
    private readonly AGGRO_RANGE = 2.5;
    private _scanTimer: number = 0;

    protected update(dt: number): void {
        super.update(dt);
        if (!this.isAlive) return;

        // Scan for buildings periodically
        this._scanTimer += dt;
        if (this._scanTimer >= 0.2) { // 5 times a second
            this._scanTimer = 0;
            this.scanForBuildings();
        }
    }

    private scanForBuildings(): void {
        // If already attacking a building, check if it's still alive/valid
        if (this._blockedTarget) {
            if (!this._blockedTarget.isAlive) {
                this._blockedTarget = null;
                this._state = UnitState.MOVING;
            }
            return;
        }

        // Use GameManager (Cycle-free storage of active building nodes)
        // Ensure GameManager is imported
        if (!GameManager.instance) return;
        
        const buildingNodes = GameManager.instance.activeBuildings;
        if (!buildingNodes || buildingNodes.length === 0) return;

        const myPos = this.node.position;
        let nearest: Building | null = null;
        let minDistSq = this.AGGRO_RANGE * this.AGGRO_RANGE;

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
            console.log(`[Enemy] Aggro on Building: ${nearest.node.name}`);
            this._blockedTarget = nearest;
            this._state = UnitState.ATTACKING;
            // Face the target
            this.node.lookAt(new Vec3(nearest.node.position.x, 0.5, nearest.node.position.z));
        }
    }

    protected onDeath(): void {
        // Handled by manager
    }
}
