import {
    _decorator,
    Vec2,
    Vec3,
    Node,
    Component,
    RigidBody,
    CapsuleCollider,
    ITriggerEvent,
    PhysicsSystem,
    geometry,
    Color,
} from 'cc';
import { Unit, UnitType, UnitState } from './Unit';
import { GameManager } from '../../core/managers/GameManager';
import { CombatService } from '../../core/managers/CombatService';
import { GameConfig } from '../../data/GameConfig';
import { Coin } from '../economy/Coin';
import { HUDManager } from '../../ui/HUDManager';
import { RangedWeapon } from '../combat/weapons/RangedWeapon';
import { CharacterMover } from '../../core/physics/CharacterMover';
import { StackVisualizer } from '../visuals/StackVisualizer';
import { EnemyQuery } from '../../core/managers/EnemyQuery';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import type { BuffCardEffect } from '../roguelike/BuffCardService';
import { HeroWeaponManager } from '../weapons/HeroWeaponManager';
import { WeaponBehaviorFactory } from '../weapons/WeaponBehaviorFactory';
import { getWeaponLevelStats } from '../weapons/WeaponTypes';

const { ccclass, property } = _decorator;

/**
 * 英雄单位
 * 玩家控制的角色，通过摇杆移动
 */
@ccclass('Hero')
export class Hero extends Unit {
    // 移动输入向量 (x, y) -1 ~ 1
    private _inputVector: Vec2 = new Vec2(0, 0);

    private _weapon: RangedWeapon | null = null;
    private _mover: CharacterMover | null = null;
    private _stackVisualizer: StackVisualizer | null = null;
    /** 空投武器冷却计时器 */
    private _customWeaponTimer: number = 0;

    public onDespawn(): void {
        if (this.gameManager.hero === this.node) {
            this.gameManager.hero = null;
        }
        super.onDespawn();
    }

    protected initialize(): void {
        super.initialize();
        this.unitType = UnitType.HERO;

        this.initStats({
            maxHp: GameConfig.HERO.BASE_HP,
            attack: GameConfig.HERO.BASE_ATTACK,
            attackRange: GameConfig.HERO.ATTACK_RANGE,
            attackInterval: GameConfig.HERO.ATTACK_INTERVAL,
            moveSpeed: GameConfig.HERO.MOVE_SPEED,
            critRate: GameConfig.HERO.CRIT_RATE,
            critDamage: GameConfig.HERO.CRIT_DAMAGE,
        });

        // Initialize Components
        this._weapon = this.node.getComponent(RangedWeapon);
        if (!this._weapon) {
            this._weapon = this.node.addComponent(RangedWeapon);
            this._weapon.projectileSpeed = 20;
            this._weapon.projectileColor = new Color(0, 255, 255, 255);
        }

        this._mover = this.node.getComponent(CharacterMover);
        if (!this._mover) {
            this._mover = this.node.addComponent(CharacterMover);
        }

        this._stackVisualizer = this.node.getComponent(StackVisualizer);
        if (!this._stackVisualizer) {
            this._stackVisualizer = this.node.addComponent(StackVisualizer);
        }

        // Physics Setup (Only Colliders now, Mover handles logic)
        // Note: Even though Mover handles movement, we need a RigidBody for Trigger Events to fire reliably
        let rb = this.node.getComponent(RigidBody);
        if (!rb) {
            rb = this.node.addComponent(RigidBody);
            rb.type = RigidBody.Type.KINEMATIC;
            rb.useGravity = false;
        }

        let col = this.node.getComponent(CapsuleCollider);
        if (!col) {
            col = this.node.addComponent(CapsuleCollider);
            col.cylinderHeight = 1.0;
            col.radius = 0.3;
            col.center = new Vec3(0, 0.75, 0);
            col.isTrigger = false;
        }

        col.setGroup(1 << 0);
        col.setMask(0xffffffff);

        this.syncRuntimeStats();
    }

    protected start(): void {
        this.gameManager.hero = this.node;
        Coin.HeroNode = this.node; // Set static reference for coins

        const col = this.node.getComponent(CapsuleCollider);
        if (col) {
            col.on('onTriggerEnter', this.onTriggerEnter, this);
        }
    }

    private onTriggerEnter(event: ITriggerEvent): void {
        const otherNode = event.otherCollider.node;

        // Check Coin
        const coin = otherNode.getComponent(Coin);
        if (coin) {
            this.addCoin(otherNode);
            coin.onPickup();
            this.hudManager.updateCoinDisplay(this.coinCount);
        }
    }

    public onSpawn(): void {
        super.onSpawn();
        this._state = UnitState.IDLE;
        this._inputVector.set(0, 0);
        this.gameManager.hero = this.node;
    }

    /**
     * 添加金币
     */
    public addCoin(coin: Node): void {
        if (this._stackVisualizer) {
            this._stackVisualizer.addToStack(coin);
        }

        // Disable coin logic
        const coinComp = coin.getComponent('Coin') as Component;
        if (coinComp) coinComp.enabled = false;
    }

    /**
     * 移除金币
     */
    public removeCoin(count: number = 1): number {
        if (!this._stackVisualizer) return 0;

        let removed = 0;
        const toRemove = Math.min(count, this._stackVisualizer.count);

        for (let i = 0; i < toRemove; i++) {
            const coin = this._stackVisualizer.popFromStack();
            if (coin) {
                coin.destroy();
                removed++;
            }
        }
        return removed;
    }

    public get coinCount(): number {
        return this._stackVisualizer ? this._stackVisualizer.count : 0;
    }

    /**
     * 设置移动输入
     */
    public setInput(input: Vec2): void {
        this._inputVector.set(input);
        this._state = input.lengthSqr() > 0.01 ? UnitState.MOVING : UnitState.IDLE;
    }

    protected update(dt: number): void {
        if (!this.isAlive) return;
        // 游戏暂停时不处理移动和攻击
        if (!this.gameManager.isPlaying) return;

        // 空投武器冷却
        if (this._customWeaponTimer > 0) {
            this._customWeaponTimer -= dt;
        }

        // 如果有输入，强制为移动状态
        if (this._inputVector.lengthSqr() > 0.01) {
            this._state = UnitState.MOVING;
        } else {
            // 否则尝试索敌
            this.updateTargeting();
        }

        // 自定义武器：绕过 Unit 基类的 _attackTimer，使用武器自身射速
        // Unit._attackTimer 默认以英雄基础攻击间隔（~1s）为节奏，会严重限制武器射速
        // 这里直接调用 performAttack()，内部有 _customWeaponTimer 控制实际射速
        const manager = HeroWeaponManager.instance;
        if (
            this._state === UnitState.ATTACKING &&
            manager.activeWeapon &&
            this._customWeaponTimer <= 0
        ) {
            this.performAttack();
        }

        super.update(dt);
    }

    /** 获取当前有效攻击范围（优先使用武器射程） */
    private getEffectiveRange(): number {
        const manager = HeroWeaponManager.instance;
        const active = manager.activeWeapon;
        if (active) {
            const def = manager.getWeaponDef(active.type);
            if (def) {
                const stats = getWeaponLevelStats(def, active.level);
                return stats.range ?? this._stats.attackRange;
            }
        }
        return this._stats.attackRange;
    }

    private updateTargeting(): void {
        let nearest: Node | null = null;
        const effectiveRange = this.getEffectiveRange();

        const provider = CombatService.provider;
        if (provider && provider.findEnemyInRange) {
            const result: any = provider.findEnemyInRange(this.node.position, effectiveRange);
            if (result?.node) {
                nearest = result.node;
            } else if (result?.isValid) {
                nearest = result as Node;
            }
        } else {
            const enemies = EnemyQuery.getEnemies();
            let minDist = effectiveRange;
            const myPos = this.node.position;

            for (const enemy of enemies) {
                if (!enemy.isValid) continue;
                // 跳过已死亡的敌人，避免锁定尸体导致无法转火
                const u = enemy.getComponent(Unit);
                if (!u || !u.isAlive) continue;
                const dx = enemy.position.x - myPos.x;
                const dz = enemy.position.z - myPos.z;
                const dist = Math.sqrt(dx * dx + dz * dz);

                if (dist < minDist) {
                    minDist = dist;
                    nearest = enemy;
                }
            }
        }

        if (nearest) {
            const unit = nearest.getComponent(Unit);
            if (unit && unit.isAlive) {
                this.setTarget(unit);
                this._state = UnitState.ATTACKING;
            } else {
                this.setTarget(null);
                this._state = UnitState.IDLE;
            }
        } else {
            this.setTarget(null);
            this._state = UnitState.IDLE;
        }
    }

    protected updateMovement(dt: number): void {
        if (!this.isAlive || !this._mover) return;

        if (this._inputVector.lengthSqr() > 0.01) {
            this._mover.move(this._inputVector, dt);
        }
    }

    protected performAttack(): void {
        if (!this._target || !this._target.isAlive) return;

        // 优先使用空投武器系统
        const manager = HeroWeaponManager.instance;
        const active = manager.activeWeapon;
        if (active) {
            const behavior = WeaponBehaviorFactory.get(active.type);
            const def = manager.getWeaponDef(active.type);
            if (behavior && def) {
                const stats = getWeaponLevelStats(def, active.level);
                if (this._customWeaponTimer <= 0) {
                    const parent = this.node.parent;
                    if (parent) {
                        behavior.fire(this.node, this._target.node, stats, active.level, parent);
                    }
                    this._customWeaponTimer = stats.attackInterval;
                }
                return;
            }
        }

        // 默认武器
        if (this._weapon) {
            this._weapon.tryAttack(this._target.node);
        }
    }

    /**
     * 应用肉鸽卡牌增益效果
     * 支持 multiply（乘算）和 add（加算）两种模式
     */
    public applyBuffCard(effects: BuffCardEffect): void {
        this.applyStat('attack', effects.attack);
        this.applyStat('attackInterval', effects.attackInterval, 0.2);
        this.applyStat('moveSpeed', effects.moveSpeed);
        this.applyStat('attackRange', effects.attackRange);
        this.applyStat('critRate', effects.critRate, undefined, 1.0);
        this.applyStat('critDamage', effects.critDamage);

        this.syncRuntimeStats();
        this.updateHealthBar();
    }

    private applyStat(
        key: 'attack' | 'attackInterval' | 'moveSpeed' | 'attackRange' | 'critRate' | 'critDamage',
        mod?: { multiply?: number; add?: number },
        min?: number,
        max?: number
    ): void {
        if (!mod) return;
        if (mod.multiply !== undefined) {
            this._stats[key] =
                key === 'attack'
                    ? Math.floor(this._stats[key] * mod.multiply)
                    : this._stats[key] * mod.multiply;
        }
        if (mod.add !== undefined) {
            this._stats[key] += mod.add;
        }
        if (min !== undefined) {
            this._stats[key] = Math.max(min, this._stats[key]);
        }
        if (max !== undefined) {
            this._stats[key] = Math.min(max, this._stats[key]);
        }
    }

    private syncRuntimeStats(): void {
        if (this._weapon) {
            this._weapon.damage = this._stats.attack;
            this._weapon.range = this._stats.attackRange;
            this._weapon.attackInterval = this._stats.attackInterval;
            this._weapon.critRate = this._stats.critRate;
            this._weapon.critDamage = this._stats.critDamage;
        }
        if (this._mover) {
            this._mover.moveSpeed = this._stats.moveSpeed;
        }
    }

    private get gameManager(): GameManager {
        return ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
    }

    private get hudManager(): HUDManager {
        return ServiceRegistry.get<HUDManager>('HUDManager') ?? HUDManager.instance;
    }
}
