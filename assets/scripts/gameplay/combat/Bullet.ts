import { _decorator, Component, Node, Vec3, BoxCollider, ITriggerEvent, RigidBody } from 'cc';
import { BaseComponent } from '../../core/base/BaseComponent';
import { Unit, UnitType } from '../units/Unit';
import { EventManager } from '../../core/managers/EventManager';
import { GameEvents } from '../../data/GameEvents';
import { EffectFactory } from '../effects/EffectFactory';
import { IPoolable } from '../../core/managers/PoolManager';
import { EnemyQuery } from '../../core/managers/EnemyQuery';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';

const { ccclass, property } = _decorator;

/**
 * 子弹组件
 * 追踪目标，造成伤害
 */
@ccclass('Bullet')
export class Bullet extends BaseComponent implements IPoolable {
    @property
    public speed: number = 5; // Slower for debug

    @property
    public damage: number = 10;

    private _target: Node | null = null;
    /** 速度向量（武器行为可通过 velocity 访问器修改） */
    private _velocity: Vec3 = new Vec3();
    private _lifetime: number = 0;
    private _maxLifetime: number = 3;

    // === Special Properties ===
    public explosionRadius: number = 0; // > 0 means AOE
    public slowPercent: number = 0; // > 0 means Slow Effect
    public slowDuration: number = 0;

    public chainCount: number = 0;
    public chainRange: number = 0;

    // === Crit Properties ===
    public critRate: number = 0;
    public critDamage: number = 1.5;

    /** 公开速度向量，供武器行为修改弹道 */
    public get velocity(): Vec3 {
        return this._velocity;
    }

    public setTarget(target: Node): void {
        this._target = target;
        this.updateVelocity();
    }

    public onSpawn(): void {
        // NOTE: For pooled bullets, ensure clean state on reuse.
        this._lifetime = 0;
        this._logTimer = 0;
        this._target = null;
        this._velocity.set(0, 0, 0);
        this.critRate = 0;
        this.critDamage = 1.5;
    }

    public onDespawn(): void {
        // NOTE: Clear references to avoid leaking targets between pooled instances.
        this._target = null;
        this._velocity.set(0, 0, 0);
        this.critRate = 0;
        this.critDamage = 1.5;
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

        if (unit && unit.unitType === UnitType.ENEMY) {
            // 1. AOE Logic
            if (this.explosionRadius > 0) {
                // Decoupled: Emit event for Manager to handle
                this.eventManager.emit(GameEvents.APPLY_AOE_EFFECT, {
                    center: this.node.position.clone(),
                    radius: this.explosionRadius,
                    damage: this.damage,
                    slowPercent: this.slowPercent,
                    slowDuration: this.slowDuration,
                });
            } else {
                // Single Target
                this.applyDamage(unit);
            }

            // 2. Chain Logic (Bounce)
            if (this.chainCount > 0 && this.chainRange > 0) {
                this.handleChainBounce(unit.node);
                // Do NOT destroy bullet if bouncing
                return;
            }

            this.createHitEffect();
            this.node.destroy();
        }
    }

    private handleChainBounce(currentHitNode: Node): void {
        // Find nearest enemy excluding current one
        const nextTarget = this.findNextChainTarget(currentHitNode);

        if (nextTarget) {
            console.log(`[Bullet] Chaining to ${nextTarget.name}. Remaining: ${this.chainCount}`);
            this.chainCount--;

            // Visual Trail/Zap
            if (this.node.parent) {
                EffectFactory.createLightningBolt(
                    this.node.parent,
                    this.node.position,
                    nextTarget.position
                );
            }

            // Increase speed for bounce to make it look snappier
            this.speed *= 1.5;

            // Update Target
            this._target = nextTarget;
            this.updateVelocity();

            // Reset lifetime so it doesn't expire mid-bounce
            this._lifetime = 0;

            // Apply reduced damage on bounce? (Optional)
            this.damage = Math.floor(this.damage * 0.8);
        } else {
            // No target found, chain ends
            this.createHitEffect();
            this.node.destroy();
        }
    }

    private findNextChainTarget(excludeNode: Node): Node | null {
        // const { WaveManager } = require('../wave/WaveManager');
        const enemies = EnemyQuery.getEnemies();
        let nearest: Node | null = null;
        let minMsg = this.chainRange * this.chainRange;

        const myPos = this.node.position;

        for (const enemy of enemies) {
            if (!enemy.isValid || enemy === excludeNode) continue;
            const unit = enemy.getComponent(Unit);
            if (!unit || !unit.isAlive) continue;

            const dx = enemy.position.x - myPos.x;
            const dz = enemy.position.z - myPos.z;
            const distSqr = dx * dx + dz * dz;

            if (distSqr < minMsg) {
                minMsg = distSqr;
                nearest = enemy;
            }
        }
        return nearest;
    }

    private applyDamage(unit: Unit): void {
        let finalDamage = this.damage;

        // 暴击判定
        if (this.critRate > 0 && Math.random() < this.critRate) {
            finalDamage = Math.floor(finalDamage * this.critDamage);
        }

        unit.takeDamage(finalDamage);
        if (this.slowPercent > 0) {
            unit.applySlow(this.slowPercent, this.slowDuration);
        }
    }

    private createHitEffect(): void {
        // TODO: Particle effect
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }
}
