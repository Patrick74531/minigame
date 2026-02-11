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
    /** 可选：显式击退方向（XZ），优先于速度向量 */
    public knockbackDirX: number = 0;
    public knockbackDirZ: number = 0;
    /** 已命中的敌人节点（穿透时避免重复伤害） */
    private _hitNodes: Set<Node> = new Set();

    // === Manual Hit Detection (替代物理触发，防隧穿 + 降开销) ===
    /** 启用手动碰撞检测（跳过 RigidBody/BoxCollider） */
    public useManualHitDetection: boolean = false;
    /** 敌人命中半径（手动检测用） */
    public hitRadius: number = 0.8;
    /** 上一帧位置（线段检测用） */
    private _prevPos: Vec3 = new Vec3();
    /** 上次命中火花时间戳（节流用） */
    private _lastHitSparkTime: number = 0;
    /** 手动碰撞检测节流累加器 */
    private _manualHitAccum: number = 0;
    /** 手动碰撞检测间隔（秒）— 高频子弹无需每帧检测 */
    private static readonly MANUAL_HIT_INTERVAL = 1 / 30;

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

    /** 设置子弹最大生存时间 */
    public set maxLifetime(v: number) {
        this._maxLifetime = v;
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
        this.knockbackDirX = 0;
        this.knockbackDirZ = 0;
        this._hitNodes.clear();
        this.useManualHitDetection = false;
        this.hitRadius = 0.8;
        this._prevPos.set(0, 0, 0);
        this._lastHitSparkTime = 0;
        this._manualHitAccum = 0;
        this._maxLifetime = 3;
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

    /** 禁用物理组件（手动检测模式下降低物理开销） */
    public disablePhysics(): void {
        const col = this.node.getComponent(BoxCollider);
        if (col) col.enabled = false;
        const rb = this.node.getComponent(RigidBody);
        if (rb) rb.enabled = false;
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
        // 保存上一帧位置用于线段碰撞检测
        this._prevPos.set(pos);

        const currentPos = Bullet._tmpPos;
        currentPos.set(
            pos.x + this._velocity.x * dt,
            pos.y + this._velocity.y * dt,
            pos.z + this._velocity.z * dt
        );
        this.node.setPosition(currentPos);

        // 手动碰撞检测（防隧穿，替代物理触发）— 节流以降低 CPU 开销
        if (this.useManualHitDetection) {
            this._manualHitAccum += dt;
            if (this._manualHitAccum >= Bullet.MANUAL_HIT_INTERVAL) {
                this._manualHitAccum = 0;
                this.checkManualHits();
            }
        }

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
            this.handleHit(unit);
        }
    }

    // ==================== 手动碰撞检测（防隧穿） ====================

    /** Unit 组件缓存（避免每次 getComponent 开销） */
    private static _unitCache: WeakMap<Node, Unit | null> = new WeakMap();
    private static getCachedUnit(node: Node): Unit | null {
        let u = Bullet._unitCache.get(node);
        if (u === undefined) {
            u = node.getComponent(Unit);
            Bullet._unitCache.set(node, u);
        }
        return u;
    }

    /** 线段(prevPos→currentPos)与敌人球体的碰撞检测 */
    private checkManualHits(): void {
        if (this._lifetime < 0.02) return;

        const enemies = EnemyQuery.getEnemies();
        const curPos = this.node.position;
        const rSq = this.hitRadius * this.hitRadius;

        // 预计算线段常量，避免在内层循环重复计算
        const ax = this._prevPos.x,
            az = this._prevPos.z;
        const abx = curPos.x - ax,
            abz = curPos.z - az;
        const abLenSq = abx * abx + abz * abz;

        for (let i = 0, len = enemies.length; i < len; i++) {
            const enemy = enemies[i];
            if (!enemy.isValid) continue;
            if (this.pierce && this._hitNodes.has(enemy)) continue;

            // 内联距离检测（避免函数调用开销）
            const ex = enemy.position.x;
            const ez = enemy.position.z;
            const apx = ex - ax;
            const apz = ez - az;

            let distSq: number;
            if (abLenSq < 0.0001) {
                distSq = apx * apx + apz * apz;
            } else {
                let t = (apx * abx + apz * abz) / abLenSq;
                if (t < 0) t = 0;
                else if (t > 1) t = 1;
                const cx = ax + abx * t - ex;
                const cz = az + abz * t - ez;
                distSq = cx * cx + cz * cz;
            }
            if (distSq >= rSq) continue;

            const unit = Bullet.getCachedUnit(enemy);
            if (!unit || !unit.isAlive || unit.unitType !== UnitType.ENEMY) continue;

            this.handleHit(unit);
            // 非穿透模式命中后立即退出
            if (!this.pierce) return;
        }
    }

    /** XZ 平面上点到线段的距离平方 */
    private segmentPointDistSqXZ(a: Vec3, b: Vec3, px: number, pz: number): number {
        const abx = b.x - a.x;
        const abz = b.z - a.z;
        const apx = px - a.x;
        const apz = pz - a.z;
        const abLenSq = abx * abx + abz * abz;

        if (abLenSq < 0.0001) {
            // 线段退化为点
            return apx * apx + apz * apz;
        }

        // 投影参数 t，钳制到 [0, 1]
        let t = (apx * abx + apz * abz) / abLenSq;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;

        const closestX = a.x + abx * t;
        const closestZ = a.z + abz * t;
        const dx = px - closestX;
        const dz = pz - closestZ;
        return dx * dx + dz * dz;
    }

    // ==================== 共享命中处理 ====================

    /** 处理命中单个敌人（物理触发和手动检测共用） */
    private handleHit(unit: Unit): void {
        const enemyNode = unit.node;

        // 记录已命中（穿透时避免重复伤害）
        this._hitNodes.add(enemyNode);

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
        if (this.knockbackForce > 0) {
            let dirX = this.knockbackDirX;
            let dirZ = this.knockbackDirZ;
            let lenXZ = Math.sqrt(dirX * dirX + dirZ * dirZ);

            // 回退到当前弹道方向
            if (lenXZ <= 0.0001) {
                dirX = this._velocity.x;
                dirZ = this._velocity.z;
                lenXZ = Math.sqrt(dirX * dirX + dirZ * dirZ);
            }

            // 仍无有效方向时，回退到"子弹 -> 目标"方向
            if (lenXZ <= 0.0001) {
                dirX = unit.node.position.x - this.node.position.x;
                dirZ = unit.node.position.z - this.node.position.z;
                lenXZ = Math.sqrt(dirX * dirX + dirZ * dirZ);
            }

            if (lenXZ > 0.0001) {
                unit.applyKnockback(
                    dirX / lenXZ,
                    dirZ / lenXZ,
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

    private handleChainBounce(currentHitNode: Node): void {
        // 即时链式弹射：隐藏子弹，依次对目标施加伤害 + 闪电特效
        // 每次弹射间隔 0.1s，形成清晰的视觉链条

        const parent = this.node.parent;
        if (!parent) {
            this.recycle();
            return;
        }

        // 隐藏子弹（不再物理飞行）
        this.node.active = false;

        // 收集所有链式目标
        const chainTargets: { node: Node; unit: Unit }[] = [];
        let fromPos = this.node.position.clone();
        let lastHitNode = currentHitNode;
        let remainingChains = this.chainCount;
        let chainDmg = this.damage;

        while (remainingChains > 0) {
            const next = this._findChainTargetFrom(fromPos, lastHitNode);
            if (!next) break;

            const unit = next.getComponent(Unit);
            if (!unit || !unit.isAlive) break;

            chainTargets.push({ node: next, unit });
            this._hitNodes.add(next);
            fromPos = next.position.clone();
            lastHitNode = next;
            remainingChains--;
        }

        if (chainTargets.length === 0) {
            this.createHitEffect();
            this.recycle();
            return;
        }

        // 依次播放闪电链
        const CHAIN_DELAY = 0.1; // 每次弹射间隔（秒）
        let prevPos = this.node.position.clone();

        for (let i = 0; i < chainTargets.length; i++) {
            const target = chainTargets[i];
            const startPos = prevPos.clone();
            const dmg = Math.floor(chainDmg);
            chainDmg *= 0.8; // 每次递减 20%

            this.scheduleOnce(() => {
                if (!target.node.isValid) return;

                // 绘制闪电
                if (parent.isValid) {
                    EffectFactory.createLightningBolt(parent, startPos, target.node.position);
                }

                // 造成伤害
                if (target.unit.isValid && target.unit.isAlive) {
                    target.unit.takeDamage(dmg);
                    if (this.slowPercent > 0) {
                        target.unit.applySlow(this.slowPercent, this.slowDuration);
                    }
                }

                // 击中特效
                if (parent.isValid) {
                    WeaponVFX.createHitSpark(parent, target.node.position.clone());
                }

                // 最后一个目标：回收子弹
                if (i === chainTargets.length - 1) {
                    this.recycle();
                }
            }, CHAIN_DELAY * (i + 1));

            prevPos = target.node.position.clone();
        }
    }

    /** 从指定位置搜索最近的链式目标（排除已命中的） */
    private _findChainTargetFrom(fromPos: Vec3, excludeNode: Node): Node | null {
        const enemies = EnemyQuery.getEnemies();
        let nearest: Node | null = null;
        let minDistSq = this.chainRange * this.chainRange;

        for (const enemy of enemies) {
            if (!enemy.isValid || enemy === excludeNode || this._hitNodes.has(enemy)) continue;
            const unit = enemy.getComponent(Unit);
            if (!unit || !unit.isAlive) continue;

            const dx = enemy.position.x - fromPos.x;
            const dz = enemy.position.z - fromPos.z;
            const distSqr = dx * dx + dz * dz;

            if (distSqr < minDistSq) {
                minDistSq = distSqr;
                nearest = enemy;
            }
        }
        return nearest;
    }

    private findNextChainTarget(excludeNode: Node): Node | null {
        // const { WaveManager } = require('../wave/WaveManager');
        const enemies = EnemyQuery.getEnemies();
        let nearest: Node | null = null;
        let minMsg = this.chainRange * this.chainRange;

        const myPos = this.node.position;

        for (const enemy of enemies) {
            if (!enemy.isValid || enemy === excludeNode || this._hitNodes.has(enemy)) continue;
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
        let isCrit = false;

        // 暴击判定
        if (this.critRate > 0 && Math.random() < this.critRate) {
            finalDamage = Math.floor(finalDamage * this.critDamage);
            isCrit = true;
        }

        unit.takeDamage(finalDamage, undefined, isCrit);
        if (this.slowPercent > 0) {
            unit.applySlow(this.slowPercent, this.slowDuration);
        }
    }

    private createHitEffect(): void {
        if (!this.node.parent) return;
        // 穿透 / 手动检测子弹：时间节流（最多每 0.1s 一次火花）
        if (this.pierce || this.useManualHitDetection) {
            if (this._lifetime - this._lastHitSparkTime < 0.1) return;
            this._lastHitSparkTime = this._lifetime;
        } else {
            // 普通子弹：90% 概率生成火花
            if (Math.random() > 0.9) return;
        }
        WeaponVFX.createHitSpark(this.node.parent, this.node.position.clone());
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }
}
