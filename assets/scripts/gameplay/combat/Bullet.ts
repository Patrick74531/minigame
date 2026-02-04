import { _decorator, Component, Node, Vec3, BoxCollider, ITriggerEvent, RigidBody } from 'cc';
import { BaseComponent } from '../../core/base/BaseComponent';
import { Unit, UnitType } from '../units/Unit';
import { EventManager } from '../../core/managers/EventManager';
import { GameEvents } from '../../data/GameEvents';

const { ccclass, property } = _decorator;

/**
 * 子弹组件
 * 追踪目标，造成伤害
 */
@ccclass('Bullet')
export class Bullet extends BaseComponent {
    @property
    public speed: number = 5; // Slower for debug

    @property
    public damage: number = 10;

    private _target: Node | null = null;
    private _velocity: Vec3 = new Vec3();
    private _lifetime: number = 0;
    private _maxLifetime: number = 3; 

    // === Special Properties ===
    public explosionRadius: number = 0; // > 0 means AOE
    public slowPercent: number = 0;     // > 0 means Slow Effect
    public slowDuration: number = 0;

    public setTarget(target: Node): void {
        this._target = target;
        this.updateVelocity();
    }

    protected initialize(): void {
        console.log('[Bullet] Created/Initialized');
        this._lifetime = 0;
        
        // Force Layer to Default (1 << 0)
        this.node.layer = 1 << 0;

        // Ensure properties
        let rb = this.node.getComponent(RigidBody);
        if (!rb) {
            rb = this.node.addComponent(RigidBody);
            rb.type = RigidBody.Type.KINEMATIC;
        }

        // Ensure collider exists
        let col = this.node.getComponent(BoxCollider);
        if (!col) {
            col = this.node.addComponent(BoxCollider);
            col.isTrigger = true;
            col.size = new Vec3(0.5, 0.5, 0.5);
        }
        col.setGroup(1 << 4); 
        col.setMask(1 << 3);  
        
        col.on('onTriggerEnter', this.onTriggerEnter, this);
    }

    private _logTimer: number = 0;

    protected update(dt: number): void {
        this._lifetime += dt;
        this._logTimer += dt;

        if (this._logTimer > 1.0) {
            this._logTimer = 0;
            console.log(`[Bullet] Alive at: ${this.node.position} | Scale: ${this.node.scale}`);
        }

        if (this._lifetime > this._maxLifetime) {
            this.node.destroy();
            return;
        }

        if (this._target && this._target.isValid) {
            this.updateVelocity();
        } else if (this._velocity.lengthSqr() < 0.001) {
             this.node.destroy();
             return;
        }

        const currentPos = this.node.position.clone();
        const move = new Vec3();
        Vec3.multiplyScalar(move, this._velocity, dt);
        Vec3.add(currentPos, currentPos, move);
        this.node.setPosition(currentPos);
        
        // Face direction
        if (this._velocity.lengthSqr() > 0.1) {
             const lookAtPos = currentPos.clone().add(this._velocity);
             this.node.lookAt(lookAtPos);
        }
    }

    private updateVelocity(): void {
        if (!this._target) return;
        
        const myPos = this.node.position;
        const targetPos = this._target.position;
        
        // Direction
        Vec3.subtract(this._velocity, targetPos, myPos);
        this._velocity.normalize().multiplyScalar(this.speed);
    }

    private onTriggerEnter(event: ITriggerEvent): void {
        // Prevent instant collision on spawn
        if (this._lifetime < 0.1) return;

        const other = event.otherCollider.node;

        // Check if unit (Direct Hit)
        const unit = other.getComponent(Unit);
        
        if (unit && (unit.unitType === UnitType.ENEMY)) {
            
            // 1. AOE Logic
            if (this.explosionRadius > 0) {
                // Decoupled: Emit event for Manager to handle
                EventManager.instance.emit(GameEvents.APPLY_AOE_EFFECT, {
                    center: this.node.position.clone(),
                    radius: this.explosionRadius,
                    damage: this.damage,
                    slowPercent: this.slowPercent,
                    slowDuration: this.slowDuration
                });
            } else {
                // Single Target
                this.applyDamage(unit);
            }

            this.createHitEffect();
            this.node.destroy(); 
        }
    }

    private applyDamage(unit: Unit): void {
        unit.takeDamage(this.damage);
        if (this.slowPercent > 0) {
            unit.applySlow(this.slowPercent, this.slowDuration);
        }
    }
    
    private createHitEffect(): void {
        // TODO: Particle effect
    }
}
