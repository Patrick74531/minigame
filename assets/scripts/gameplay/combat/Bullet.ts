import { _decorator, Node, Vec3, BoxCollider, ITriggerEvent, RigidBody, Tween } from 'cc';
import { BaseComponent } from '../../core/base/BaseComponent';
import { Unit, UnitType } from '../units/Unit';
import { EventManager } from '../../core/managers/EventManager';
import { GameEvents } from '../../data/GameEvents';
import { EffectFactory } from '../effects/EffectFactory';
import { IPoolable } from '../../core/managers/PoolManager';
import { ProjectilePool } from '../weapons/vfx/ProjectilePool';
import { WeaponVFX } from '../weapons/WeaponVFX';
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

    // === Pierce & Knockback ===
    /** 穿透：子弹击中后继续飞行，伤害直线上所有敌人 */
    public pierce: boolean = false;
    /** 击退力度 */
    public knockbackForce: number = 0;
    /** 击退硬直时长（秒） */
    public knockbackStun: number = 0.1;
    /** 已命中的敌人节点（穿透时避免重复伤害） */
    private _hitNodes: Set<Node> = new Set();

    // === Pool Recycling ===
    /** 若非空，销毁时回收到 ProjectilePool 而非 destroy */
    public poolKey: string = '';
    /** 当为 true 时，用 +X 轴对齐速度方向（用于水平朝向的精灵贴图子弹） */
    public orientXAxis: boolean = false;

    /** 公开速度向量，供武器行为修改弹道 */
    public get velocity(): Vec3 {
        return this._velocity;
    }

    private static readonly _tmpPos = new Vec3();
    private static readonly _tmpLookAt = new Vec3();

    public setTarget(target: Node): void {
        this._target = target;
        this.updateVelocity();
    }

    public onSpawn(): void {
        // NOTE: For pooled bullets, ensure clean state on reuse.
        this.resetState();
    }

    public onDespawn(): void {
        // NOTE: Clear references to avoid leaking targets between pooled instances.
        this.resetState();
    }

    /** 重置子弹状态（对象池复用时调用） */
    public resetState(): void {
        this._lifetime = 0;
        this._target = null;
        this._velocity.set(0, 0, 0);
        this.explosionRadius = 0;
        this.slowPercent = 0;
        this.slowDuration = 0;
        this.chainCount = 0;
        this.chainRange = 0;
        this.critRate = 0;
        this.critDamage = 1.5;
        this.orientXAxis = false;
        this.pierce = false;
        this.knockbackForce = 0;
        this.knockbackStun = 0.1;
        this._hitNodes.clear();
    }

    /** 回收子弹：有 poolKey 则归池，否则 destroy */
    public recycle(): void {
        Tween.stopAllByTarget(this.node);
        if (this.poolKey) {
            const key = this.poolKey;
            this.poolKey = '';
            this.resetState();
            ProjectilePool.put(key, this.node);
        } else {
            this.node.destroy();
        }
    }

    protected initialize(): void {
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

    protected update(dt: number): void {
        this._lifetime += dt;

        if (this._lifetime > this._maxLifetime) {
            this.recycle();
            return;
        }

        if (this._target && this._target.isValid) {
            this.updateVelocity();
        } else if (this._velocity.lengthSqr() < 0.001) {
            this.recycle();
            return;
        }

        const pos = this.node.position;
        const currentPos = Bullet._tmpPos;
        currentPos.set(
            pos.x + this._velocity.x * dt,
            pos.y + this._velocity.y * dt,
            pos.z + this._velocity.z * dt
        );
        this.node.setPosition(currentPos);

        // Face direction
        if (this._velocity.lengthSqr() > 0.1) {
            if (this.orientXAxis) {
                // 精灵子弹：将 -X 轴对齐速度方向（贴图弹头朝左）
                const yDeg =
                    Math.atan2(-this._velocity.z, this._velocity.x) * (180 / Math.PI) + 180;
                this.node.setRotationFromEuler(0, yDeg, 0);
            } else {
                const lookAtPos = Bullet._tmpLookAt;
                lookAtPos.set(
                    currentPos.x + this._velocity.x,
                    currentPos.y + this._velocity.y,
                    currentPos.z + this._velocity.z
                );
                this.node.lookAt(lookAtPos);
            }
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
        // Prevent instant collision on spawn (1 frame at 60fps)
        if (this._lifetime < 0.02) return;

        const other = event.otherCollider.node;

        // 穿透模式：跳过已命中的敌人
        if (this.pierce && this._hitNodes.has(other)) return;

        // Check if unit (Direct Hit)
        const unit = other.getComponent(Unit);

        if (unit && unit.unitType === UnitType.ENEMY) {
            // 记录已命中（穿透时避免重复伤害）
            this._hitNodes.add(other);

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

            // 击退效果
            if (this.knockbackForce > 0 && this._velocity.lengthSqr() > 0.01) {
                const lenXZ = Math.sqrt(
                    this._velocity.x * this._velocity.x + this._velocity.z * this._velocity.z
                );
                if (lenXZ > 0.0001) {
                    unit.applyKnockback(
                        this._velocity.x / lenXZ,
                        this._velocity.z / lenXZ,
                        this.knockbackForce,
                        this.knockbackStun
                    );
                }
            }

            this.createHitEffect();

            // 穿透模式：不回收，继续飞行
            if (this.pierce) return;

            // 2. Chain Logic (Bounce)
            if (this.chainCount > 0 && this.chainRange > 0) {
                this.handleChainBounce(unit.node);
                // Do NOT destroy bullet if bouncing
                return;
            }

            this.recycle();
        }
    }

    private handleChainBounce(currentHitNode: Node): void {
        // Find nearest enemy excluding current one
        const nextTarget = this.findNextChainTarget(currentHitNode);

        if (nextTarget) {
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
            this.recycle();
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
        if (!this.node.parent) return;
        // Throttle: 90% of hits create sparks (performance on mobile)
        if (Math.random() > 0.9) return;
        WeaponVFX.createHitSpark(this.node.parent, this.node.position.clone());
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }
}
