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
import { getWeaponLevelStats, type WeaponLevelStats } from '../weapons/WeaponTypes';
import { HeroLevelSystem } from './HeroLevelSystem';
import { GameEvents } from '../../data/GameEvents';
import { EventManager } from '../../core/managers/EventManager';

const { ccclass, property } = _decorator;

/**
 * 英雄单位
 * 玩家控制的角色，通过摇杆移动
 */
@ccclass('Hero')
export class Hero extends Unit {
    // 移动输入向量 (x, y) -1 ~ 1
    private _inputVector: Vec2 = new Vec2(0, 0);
    private _facingDir: Vec3 = new Vec3();
    private _hasFacingDir: boolean = false;

    private _weapon: RangedWeapon | null = null;
    private _mover: CharacterMover | null = null;
    private _stackVisualizer: StackVisualizer | null = null;
    /** 空投武器冷却计时器 */
    private _customWeaponTimer: number = 0;

    /** 基础属性快照（用于成长计算） */
    private _baseStats = {
        maxHp: 0,
        attack: 0,
        attackRange: 0,
        attackInterval: 0,
        moveSpeed: 0,
        critRate: 0,
        critDamage: 0,
    };
    /** buff 卡片累计倍率 / 加算（分层叠加） */
    private _buffMultipliers: Record<string, number> = {};
    private _buffAdditives: Record<string, number> = {};
    private static readonly _tmpLookAt = new Vec3();

    public onDespawn(): void {
        if (this.gameManager.hero === this.node) {
            this.gameManager.hero = null;
        }
        super.onDespawn();
    }

    protected initialize(): void {
        super.initialize();
        this.unitType = UnitType.HERO;

        // 存储基础属性快照
        this._baseStats = {
            maxHp: GameConfig.HERO.BASE_HP,
            attack: GameConfig.HERO.BASE_ATTACK,
            attackRange: GameConfig.HERO.ATTACK_RANGE,
            attackInterval: GameConfig.HERO.ATTACK_INTERVAL,
            moveSpeed: GameConfig.HERO.MOVE_SPEED,
            critRate: GameConfig.HERO.CRIT_RATE,
            critDamage: GameConfig.HERO.CRIT_DAMAGE,
        };
        this._buffMultipliers = {};
        this._buffAdditives = {};

        this.initStats({ ...this._baseStats });

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
        this._mover.rotateWithMovement = false;

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

        // 监听升级事件
        this._eventMgr.on(GameEvents.HERO_LEVEL_UP, this.onLevelUp, this);
    }

    protected onDestroy(): void {
        this._eventMgr.off(GameEvents.HERO_LEVEL_UP, this.onLevelUp, this);
    }

    private get _eventMgr(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
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
        this._hasFacingDir = false;
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

        const isMoving = this._inputVector.lengthSqr() > 0.01;

        // 始终索敌（移动时也能锁定目标并开火）
        this.updateTargeting();
        this.updateFacingDirection();

        // 移动输入覆盖状态，但保留目标用于射击
        if (isMoving) {
            this._state = UnitState.MOVING;
        }

        // 只要有目标 + 武器就绪，无论移动还是静止都开火
        const manager = HeroWeaponManager.instance;
        if (this._target && manager.activeWeapon && this._customWeaponTimer <= 0) {
            this.performAttack();
        }

        super.update(dt);
        this.applyFacingDirection();
    }

    /** 获取当前有效攻击范围（优先使用武器射程） */
    private getEffectiveRange(): number {
        const manager = HeroWeaponManager.instance;
        const active = manager.activeWeapon;
        if (active) {
            const def = manager.getWeaponDef(active.type);
            if (def) {
                const rawStats = getWeaponLevelStats(def, active.level);
                const effectiveStats = this.getEffectiveWeaponStats(rawStats);
                return effectiveStats.range ?? this._stats.attackRange;
            }
        }
        return this._stats.attackRange;
    }

    private getEffectiveWeaponStats(base: WeaponLevelStats): WeaponLevelStats {
        const baseRange = Math.max(0.0001, this._baseStats.attackRange);
        const baseInterval = Math.max(0.0001, this._baseStats.attackInterval);
        const rangeMultiplier = this._stats.attackRange / baseRange;
        const intervalMultiplier = this._stats.attackInterval / baseInterval;
        return {
            ...base,
            range: Math.max(0.1, base.range * rangeMultiplier),
            attackInterval: Math.max(0.05, base.attackInterval * intervalMultiplier),
        };
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
            let minDistSq = effectiveRange * effectiveRange;
            const myPos = this.node.position;

            for (const enemy of enemies) {
                if (!enemy.isValid) continue;
                // 跳过已死亡的敌人，避免锁定尸体导致无法转火
                const u = enemy.getComponent(Unit);
                if (!u || !u.isAlive) continue;
                const dx = enemy.position.x - myPos.x;
                const dz = enemy.position.z - myPos.z;
                const distSq = dx * dx + dz * dz;

                if (distSq < minDistSq) {
                    minDistSq = distSq;
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

    private updateFacingDirection(): void {
        // 优先：有射击目标时朝目标
        if (this._target && this._target.isAlive) {
            const myPos = this.node.position;
            const targetPos = this._target.node.position;
            const dx = targetPos.x - myPos.x;
            const dz = targetPos.z - myPos.z;
            const len = Math.sqrt(dx * dx + dz * dz);
            if (len > 0.0001) {
                this._facingDir.set(dx / len, 0, dz / len);
                this._hasFacingDir = true;
                return;
            }
        }

        // 回退：没在射击目标时，朝摇杆移动方向
        const moveLenSq = this._inputVector.lengthSqr();
        if (moveLenSq > 0.01) {
            const dx = this._inputVector.x;
            const dz = -this._inputVector.y;
            const len = Math.sqrt(dx * dx + dz * dz);
            if (len > 0.0001) {
                this._facingDir.set(dx / len, 0, dz / len);
                this._hasFacingDir = true;
            }
        }
    }

    private applyFacingDirection(): void {
        if (!this._hasFacingDir) return;
        const pos = this.node.position;
        const lookAt = Hero._tmpLookAt;
        lookAt.set(pos.x + this._facingDir.x, pos.y, pos.z + this._facingDir.z);
        this.node.lookAt(lookAt);
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
                const stats = this.getEffectiveWeaponStats(getWeaponLevelStats(def, active.level));
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

    // === 升级处理 ===

    private onLevelUp(data: { level: number; heroNode: Node }): void {
        if (data.heroNode !== this.node) return;
        this.recalcStats();
        // 升级回满血
        this._stats.currentHp = this._stats.maxHp;
        this.updateHealthBar();
    }

    /**
     * 重算属性：base * levelGrowth * buffMultiplier + levelAdd + buffAdd
     * 分层叠加，避免升级与 buff 累计影响
     */
    private recalcStats(): void {
        const levelSys = HeroLevelSystem.instance;
        const keys = [
            'maxHp',
            'attack',
            'attackRange',
            'attackInterval',
            'moveSpeed',
            'critRate',
            'critDamage',
        ] as const;

        for (const key of keys) {
            const base = this._baseStats[key];
            const growth = levelSys.getStatGrowth(key, levelSys.level);
            const buffMul = this._buffMultipliers[key] ?? 1;
            const buffAdd = this._buffAdditives[key] ?? 0;

            let value = base * growth.multiplier * buffMul + growth.additive + buffAdd;

            // 上限约束
            if (growth.cap !== undefined) {
                value = Math.min(value, growth.cap);
            }
            // attack 取整
            if (key === 'attack' || key === 'maxHp') {
                value = Math.floor(value);
            }
            // attackInterval 下限
            if (key === 'attackInterval') {
                value = Math.max(0.2, value);
            }

            this._stats[key] = value;
        }

        this.syncRuntimeStats();
    }

    /**
     * 应用肉鸽卡牌增益效果
     * 支持 multiply（乘算）和 add（加算）两种模式
     */
    public applyBuffCard(effects: BuffCardEffect): void {
        this.applyBuffStat('attack', effects.attack);
        this.applyBuffStat('attackInterval', effects.attackInterval);
        this.applyBuffStat('moveSpeed', effects.moveSpeed);
        this.applyBuffStat('attackRange', effects.attackRange);
        this.applyBuffStat('critRate', effects.critRate);
        this.applyBuffStat('critDamage', effects.critDamage);

        this.recalcStats();
        this.updateHealthBar();
    }

    private applyBuffStat(key: string, mod?: { multiply?: number; add?: number }): void {
        if (!mod) return;
        if (mod.multiply !== undefined) {
            this._buffMultipliers[key] = (this._buffMultipliers[key] ?? 1) * mod.multiply;
        }
        if (mod.add !== undefined) {
            this._buffAdditives[key] = (this._buffAdditives[key] ?? 0) + mod.add;
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

    protected get gameManager(): GameManager {
        return ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
    }

    private get hudManager(): HUDManager {
        return ServiceRegistry.get<HUDManager>('HUDManager') ?? HUDManager.instance;
    }
}
