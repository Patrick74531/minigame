import { _decorator } from 'cc';
import { BaseComponent } from '../../core/base/BaseComponent';
import { EventManager } from '../../core/managers/EventManager';
import { GameEvents } from '../../data/GameEvents';
import { IPoolable } from '../../core/managers/PoolManager';

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
}

/**
 * 单位基类
 * 所有战斗单位（士兵、敌人、英雄）的基类
 */
@ccclass('Unit')
export class Unit extends BaseComponent implements IPoolable {
    @property
    public unitType: UnitType = UnitType.SOLDIER;

    protected _stats: UnitStats = {
        maxHp: 100,
        currentHp: 100,
        attack: 10,
        attackRange: 30,
        attackInterval: 1,
        moveSpeed: 100,
    };

    protected _state: UnitState = UnitState.IDLE;
    protected _target: Unit | null = null;
    protected _attackTimer: number = 0;

    // === 访问器 ===

    protected _speedModifier: number = 1.0;
    protected _slowTimer: number = 0;

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

    public get target(): Unit | null {
        return this._target;
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
    }

    // === 公共方法 ===

    /**
     * 初始化单位属性
     * @param stats 属性配置
     */
    public initStats(stats: Partial<UnitStats>): void {
        Object.assign(this._stats, stats);
        this._stats.currentHp = this._stats.maxHp;
    }

    /**
     * 设置目标
     * @param target 目标单位
     */
    public setTarget(target: Unit | null): void {
        this._target = target;
    }

    /**
     * 受到伤害
     * @param damage 伤害值
     * @param attacker 攻击者
     */
    public takeDamage(damage: number, _attacker?: Unit): void {
        if (!this.isAlive) return;

        this._stats.currentHp = Math.max(0, this._stats.currentHp - damage);

        EventManager.instance.emit(GameEvents.UNIT_DAMAGED, {
            node: this.node,
            damage,
            currentHp: this._stats.currentHp,
        });

        if (this._stats.currentHp <= 0) {
            this.die();
        }
    }

    /**
     * 死亡
     */
    public die(): void {
        if (this._state === UnitState.DEAD) return;

        this._state = UnitState.DEAD;

        EventManager.instance.emit(GameEvents.UNIT_DIED, {
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
    }

    // === 子类重写 ===

    /**
     * 死亡时调用，子类重写添加死亡表现
     */
    protected onDeath(): void {
        // 子类实现
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

    private updateStatusEffects(dt: number): void {
        if (this._slowTimer > 0) {
            this._slowTimer -= dt;
            if (this._slowTimer <= 0) {
                this._speedModifier = 1.0;
                // console.log(`[Unit] Slow ended.`);
            }
        }
    }

    // === 更新循环 ===

    protected update(dt: number): void {
        if (!this.isAlive) return;

        this.updateStatusEffects(dt);

        switch (this._state) {
            case UnitState.MOVING:
                this.updateMovement(dt);
                break;
            case UnitState.ATTACKING:
                this.updateAttack(dt);
                break;
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
}
