import { _decorator } from 'cc';
import { BaseComponent } from '../../core/base/BaseComponent';
import { EventManager } from '../../core/managers/EventManager';
import { GameManager } from '../../core/managers/GameManager';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import { GameEvents } from '../../data/GameEvents';
import { IPoolable } from '../../core/managers/PoolManager';
import { IAttackable } from '../../core/interfaces/IAttackable';
import { Vec3, RigidBody } from 'cc';
import { HealthBar } from '../../ui/HealthBar';
import { DamageNumberFactory, type DamageNumberStyle } from '../effects/DamageNumberFactory';

const { ccclass, property } = _decorator;

/** 单位类型 */
export enum UnitType {
    SOLDIER = 'soldier',
    ENEMY = 'enemy',
    HERO = 'hero',
}

/** 单位状态 */
export enum UnitState {
    IDLE = 0,
    MOVING = 1,
    ATTACKING = 2,
    DEAD = 3,
}

/** 单位属性接口 */
export interface UnitStats {
    maxHp: number;
    currentHp: number;
    attack: number;
    attackRange: number;
    attackInterval: number;
    moveSpeed: number;
    /** 暴击率 (0~1)，默认 0 */
    critRate: number;
    /** 暴击伤害倍率，默认 1.5 (即 150%) */
    critDamage: number;
}

/**
 * 单位基类
 * 所有战斗单位（士兵、敌人、英雄）的基类
 */
@ccclass('Unit')
export class Unit extends BaseComponent implements IPoolable, IAttackable {
    @property
    public unitType: UnitType = UnitType.SOLDIER;

    protected _stats: UnitStats = {
        maxHp: 100,
        currentHp: 100,
        attack: 10,
        attackRange: 30,
        attackInterval: 1,
        moveSpeed: 100,
        critRate: 0,
        critDamage: 1.5,
    };

    protected _state: UnitState = UnitState.IDLE;
    protected _target: IAttackable | null = null;
    protected _attackTimer: number = 0;
    private _gameManagerRef: GameManager | null = null;

    // === 访问器 ===

    protected _speedModifier: number = 1.0;
    protected _slowTimer: number = 0;
    /** 击退硬直计时器：> 0 时单位无法自主移动 */
    protected _stunTimer: number = 0;
    /** 击退速度向量（硬直期间用于手动位移） */
    protected _knockbackVel: Vec3 = new Vec3();
    /** 复用临时向量（避免每帧 GC） */
    private static readonly _tmpKbVec = new Vec3();
    /** 缓存 RigidBody（避免每帧 getComponent） */
    private _rbCachedUnit: RigidBody | null = null;
    private _rbUnitLookedUp: boolean = false;
    /** 缓存 HealthBar（避免每次受伤时 getComponent） */
    private _healthBarCached: HealthBar | null = null;

    public get stats(): UnitStats {
        return this._stats;
    }

    // Effective speed
    public get moveSpeed(): number {
        return this._stats.moveSpeed * this._speedModifier;
    }

    public get state(): UnitState {
        return this._state;
    }

    public get isAlive(): boolean {
        return this._stats.currentHp > 0 && this._state !== UnitState.DEAD;
    }

    public get target(): IAttackable | null {
        return this._target;
    }

    // === IAttackable Implementation ===

    public getWorldPosition(): Vec3 {
        return this.node.worldPosition;
    }

    // === 生命周期 ===

    protected initialize(): void {
        this.resetUnit();
    }

    protected cleanup(): void {
        this._target = null;
    }

    // === IPoolable 实现 ===

    public onSpawn(): void {
        this.resetUnit();
    }

    public onDespawn(): void {
        this._target = null;
        this._state = UnitState.IDLE;
        this.clearKnockbackState();
    }

    // === 公共方法 ===

    /**
     * 初始化单位属性
     * @param stats 属性配置
     */
    public initStats(stats: Partial<UnitStats>): void {
        Object.assign(this._stats, stats);
        this._stats.currentHp = this._stats.maxHp;
        this.updateHealthBar();
    }

    /**
     * 设置目标
     * @param target 目标单位
     */
    public setTarget(target: IAttackable | null): void {
        this._target = target;
    }

    /**
     * 受到伤害
     * @param damage 伤害值
     * @param attacker 攻击者
     * @param isCrit 是否暴击
     */
    public takeDamage(damage: number, _attacker?: any, isCrit: boolean = false): void {
        if (!this.isAlive) return;

        damage = Math.floor(damage);
        this._stats.currentHp = Math.max(0, this._stats.currentHp - damage);
        this.updateHealthBar();

        // 显示浮动伤害数字
        const style: DamageNumberStyle =
            _attacker && _attacker.unitType === UnitType.ENEMY ? 'enemyHit' : 'default';
        this.showDamageNumber(damage, isCrit, style);

        this.eventManager.emit(GameEvents.UNIT_DAMAGED, {
            node: this.node,
            damage,
            currentHp: this._stats.currentHp,
        });

        if (this._stats.currentHp <= 0) {
            this.die();
        }
    }

    /**
     * 恢复生命值
     * @param amount 治疗量
     * @param showNumber 是否显示飘字
     * @returns 实际恢复值
     */
    public heal(amount: number, showNumber: boolean = true): number {
        if (!this.isAlive) return 0;

        amount = Math.floor(amount);
        if (amount <= 0) return 0;

        const before = this._stats.currentHp;
        this._stats.currentHp = Math.min(this._stats.maxHp, this._stats.currentHp + amount);
        const healed = this._stats.currentHp - before;
        if (healed <= 0) return 0;

        this.updateHealthBar();

        if (showNumber) {
            this.showHealNumber(healed);
        }

        return healed;
    }

    /** 显示浮动伤害数字 */
    private showDamageNumber(
        damage: number,
        isCrit: boolean,
        style: DamageNumberStyle = 'default'
    ): void {
        const parent = this.node.parent;
        if (!parent) return;
        DamageNumberFactory.show(parent, this.node.worldPosition, damage, isCrit, this.node, style);
    }

    /** 显示浮动治疗数字 */
    private showHealNumber(heal: number): void {
        const parent = this.node.parent;
        if (!parent) return;
        DamageNumberFactory.show(parent, this.node.worldPosition, heal, false, undefined, 'heal');
    }

    /**
     * 死亡
     */
    public die(): void {
        if (this._state === UnitState.DEAD) return;

        this._state = UnitState.DEAD;
        this.setHealthBarEnabled(false);

        this.eventManager.emit(GameEvents.UNIT_DIED, {
            unitType: this.unitType,
            node: this.node,
            position: this.node.position.clone(),
        });

        // 子类可重写此方法添加死亡动画
        this.onDeath();
    }

    /**
     * 重置单位状态
     */
    public resetUnit(): void {
        this._stats.currentHp = this._stats.maxHp;
        this._state = UnitState.IDLE;
        this._target = null;
        this._attackTimer = 0;
        this._speedModifier = 1.0;
        this._slowTimer = 0;
        this.clearKnockbackState();
        this.setHealthBarEnabled(true);
        this.updateHealthBar();
    }

    protected updateHealthBar(): void {
        if (!this._healthBarCached || !this._healthBarCached.isValid) {
            this._healthBarCached = this.node.getComponent(HealthBar);
        }
        if (this._healthBarCached) {
            this._healthBarCached.updateHealth(this._stats.currentHp, this._stats.maxHp);
        }
    }

    private setHealthBarEnabled(enabled: boolean): void {
        if (!this._healthBarCached || !this._healthBarCached.isValid) {
            this._healthBarCached = this.node.getComponent(HealthBar);
        }
        if (this._healthBarCached && this._healthBarCached.enabled !== enabled) {
            this._healthBarCached.enabled = enabled;
        }
    }

    // === 子类重写 ===

    /**
     * 死亡时调用，子类重写添加死亡表现
     */
    protected onDeath(): void {
        // 子类实现
    }

    protected get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }

    /**
     * 攻击时调用，子类重写添加攻击逻辑
     */
    protected performAttack(): void {
        // 子类实现
    }

    /**
     * 移动逻辑，子类重写
     * @param dt 帧间隔时间
     */
    protected updateMovement(_dt: number): void {
        // 子类实现
    }

    // === 更新循环 ===

    // === Status Effects ===

    public applySlow(percent: number, duration: number): void {
        this._speedModifier = 1.0 - percent; // e.g. 0.4 slow = 0.6 speed
        this._slowTimer = duration;
        // console.log(`[Unit] Slowed! Mod: ${this._speedModifier}`);
    }

    /**
     * 击退效果：记录击退速度 + 短暂硬直
     * 硬直期间通过 setPosition 推移，避免依赖刚体速度带来的不稳定性
     */
    public applyKnockback(
        dirX: number,
        dirZ: number,
        force: number,
        stunDuration: number = 0.15
    ): void {
        if (!this.isAlive) return;
        if (force <= 0) return;
        const dirLen = Math.sqrt(dirX * dirX + dirZ * dirZ);
        if (dirLen <= 0.0001) return;

        const nx = dirX / dirLen;
        const nz = dirZ / dirLen;

        // 叠加击退速度（单位/秒）
        this._knockbackVel.x += nx * force;
        this._knockbackVel.z += nz * force;

        // 命中当帧立即推开（小幅位移，主要靠速度衰减体现击退）
        const impactDistance = Math.min(0.15, Math.max(0.02, force * 0.012));
        const pos = this.node.position;
        this.node.setPosition(pos.x + nx * impactDistance, pos.y, pos.z + nz * impactDistance);

        // 叠加硬直：取较大值避免短硬直覆盖长硬直
        if (stunDuration > 0) {
            this._stunTimer = Math.max(this._stunTimer, stunDuration);
        }
    }

    private updateStatusEffects(dt: number): void {
        if (this._stunTimer > 0) {
            this._stunTimer -= dt;
        }
        if (this._slowTimer > 0) {
            this._slowTimer -= dt;
            if (this._slowTimer <= 0) {
                this._speedModifier = 1.0;
            }
        }
    }

    // === 更新循环 ===

    protected update(dt: number): void {
        if (!this.isAlive) return;
        if (!this.gameManager.isPlaying) return;

        this.updateStatusEffects(dt);

        // 击退硬直优先于所有状态（MOVING / ATTACKING / IDLE 都被打断）
        if (this._stunTimer > 0) {
            this.applyKnockbackMovement(dt);
            return;
        }

        // 硬直刚结束：清除残余击退状态，避免物理速度干扰正常移动
        if (this._knockbackVel.lengthSqr() > 0.001) {
            this.clearKnockbackState();
        }

        switch (this._state) {
            case UnitState.MOVING:
                this.updateMovement(dt);
                break;
            case UnitState.ATTACKING:
                this.updateAttack(dt);
                break;
        }
    }

    /** 获取缓存的 RigidBody */
    private getCachedRb(): RigidBody | null {
        if (!this._rbUnitLookedUp) {
            this._rbCachedUnit = this.node.getComponent(RigidBody);
            this._rbUnitLookedUp = true;
        }
        return this._rbCachedUnit;
    }

    /** 硬直期间：直接位移（setPosition）驱动击退，每帧衰减 */
    private applyKnockbackMovement(dt: number): void {
        // 先位移再衰减：确保低帧率下第一帧也有可见击退
        if (this._knockbackVel.lengthSqr() > 0.0001) {
            const pos = this.node.position;
            this.node.setPosition(
                pos.x + this._knockbackVel.x * dt,
                pos.y,
                pos.z + this._knockbackVel.z * dt
            );
        }

        // 60fps 基准衰减，按 dt 折算，避免帧率越高衰减越快
        const damping = Math.pow(0.88, dt * 60);
        this._knockbackVel.x *= damping;
        this._knockbackVel.z *= damping;

        // 若有刚体，清掉线速度，避免和手动位移互相干扰
        const rb = this.getCachedRb();
        if (rb && rb.type === RigidBody.Type.DYNAMIC) {
            Unit._tmpKbVec.set(0, 0, 0);
            rb.setLinearVelocity(Unit._tmpKbVec);
        }
    }

    /** 清除击退状态：归零速度向量和 RigidBody 线速度 */
    private clearKnockbackState(): void {
        this._stunTimer = 0;
        this._knockbackVel.set(0, 0, 0);
        const rb = this.getCachedRb();
        if (rb && rb.type === RigidBody.Type.DYNAMIC) {
            Unit._tmpKbVec.set(0, 0, 0);
            rb.setLinearVelocity(Unit._tmpKbVec);
        }
    }

    private updateAttack(dt: number): void {
        this._attackTimer += dt;

        if (this._attackTimer >= this._stats.attackInterval) {
            this._attackTimer = 0;

            if (this._target && this._target.isAlive) {
                this.performAttack();
            } else {
                this._target = null;
                this._state = UnitState.IDLE;
            }
        }
    }

    protected get gameManager(): GameManager {
        if (!this._gameManagerRef) {
            this._gameManagerRef =
                ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
        }
        return this._gameManagerRef;
    }
}
