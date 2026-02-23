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
import { CoinFactory } from '../economy/CoinFactory';
import { HUDManager } from '../../ui/HUDManager';
import { RangedWeapon } from '../combat/weapons/RangedWeapon';
import { CharacterMover } from '../../core/physics/CharacterMover';
import { StackVisualizer } from '../visuals/StackVisualizer';
import { EnemyQuery } from '../../core/managers/EnemyQuery';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import type { BuffCardEffect } from '../roguelike/BuffCardService';
import { HeroWeaponManager } from '../weapons/HeroWeaponManager';
import { WeaponBehaviorFactory } from '../weapons/WeaponBehaviorFactory';
import { WeaponSFXManager } from '../weapons/WeaponSFXManager';
import { getWeaponLevelStats, type WeaponLevelStats } from '../weapons/WeaponTypes';
import { HeroLevelSystem } from './HeroLevelSystem';
import { GameEvents } from '../../data/GameEvents';
import { EventManager } from '../../core/managers/EventManager';
import { Building } from '../buildings/Building';
import { HitFeedback } from '../visuals/HitFeedback';

const { ccclass, property } = _decorator;
const PHYSICS_GROUP_WALL = 1 << 5;

/**
 * 英雄单位
 * 玩家控制的角色，通过摇杆移动
 */
@ccclass('Hero')
export class Hero extends Unit {
    private static readonly RESPAWN_DELAY_SECONDS = 10;

    // 移动输入向量 (x, y) -1 ~ 1
    private _inputVector: Vec2 = new Vec2(0, 0);
    private _facingDir: Vec3 = new Vec3();
    private _hasFacingDir: boolean = false;
    private _respawning: boolean = false;
    private _respawnRemainingSeconds: number = 0;

    private _weapon: RangedWeapon | null = null;
    private _mover: CharacterMover | null = null;
    private _stackVisualizer: StackVisualizer | null = null;
    /** 空投武器冷却计时器 */
    private _customWeaponTimer: number = 0;
    /** 上一帧 dt（供持续型武器使用） */
    private _lastDt: number = 0;
    /** 电锯风暴自旋累积角度（度） */
    private _spinYAngle: number = 0;
    /** 上一帧是否处于自旋状态（用于首帧初始化） */
    private _wasSpinning: boolean = false;
    /** 上一帧激活的武器类型，用于检测切换并停止旧 behavior */
    private _prevWeaponType: string | null = null;

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
    private _appliedBaseUpgradeLevel: number = 1;
    private static readonly _tmpLookAt = new Vec3();

    // --- Hit Feedback Component ---
    private _hitFeedback: HitFeedback | null = null;

    public onDespawn(): void {
        this.unschedule(this.tickRespawnCountdown);
        this.unschedule(this.finishRespawn);
        this._stopCurrentWeapon();
        WeaponSFXManager.stopAllLoops(this.node);
        this._respawning = false;
        this._respawnRemainingSeconds = 0;
        this.hudManager.hideHeroRespawnCountdown();
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
        this._appliedBaseUpgradeLevel = 1;

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
        col.setMask(0xffffffff & ~PHYSICS_GROUP_WALL);

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
        this._eventMgr.on(GameEvents.BASE_UPGRADE_READY, this.onBaseUpgradeReady, this);
    }

    protected onDestroy(): void {
        this._eventMgr.off(GameEvents.HERO_LEVEL_UP, this.onLevelUp, this);
        this._eventMgr.off(GameEvents.BASE_UPGRADE_READY, this.onBaseUpgradeReady, this);
        this.unschedule(this.tickRespawnCountdown);
        this.unschedule(this.finishRespawn);
        WeaponSFXManager.stopAllLoops(this.node);
        this.hudManager.hideHeroRespawnCountdown();
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
        // Rotate coin flat (Horizontal) for stacking
        coin.setRotationFromEuler(90, 0, 0);

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
     * 从存档恢复英雄手持金币（用于建造消耗）。
     */
    public restoreCoinCount(targetCount: number): void {
        const safeCount = Math.max(0, Math.floor(targetCount));

        if (!this._stackVisualizer) {
            this.hudManager.updateCoinDisplay(0);
            return;
        }

        // Clear existing carried coins first to avoid duplication on repeated restore calls.
        while (this._stackVisualizer.count > 0) {
            const existing = this._stackVisualizer.popFromStack();
            if (existing && existing.isValid) {
                existing.destroy();
            }
        }

        const parent = this.node.parent ?? this.node;
        const p = this.node.position;
        for (let i = 0; i < safeCount; i++) {
            const coinNode = CoinFactory.createCoin(parent, p.x, p.z, 1);
            const coinComp = coinNode.getComponent(Coin);
            if (coinComp) {
                coinComp.onPickup();
            }
            this.addCoin(coinNode);
        }

        this.hudManager.updateCoinDisplay(this.coinCount);
    }

    // === Hit Feedback ===

    public override takeDamage(damage: number, attacker?: any, isCrit: boolean = false): void {
        const hpBefore = this._stats.currentHp;
        super.takeDamage(damage, attacker, isCrit);

        // Only trigger feedback if actual damage was taken and still alive
        if (hpBefore > this._stats.currentHp) {
            this.playHitFeedback();
        }
    }

    private playHitFeedback(): void {
        if (!this._hitFeedback) {
            const modelNode = this.node.getChildByName('HeroModel');
            if (modelNode) {
                this._hitFeedback = modelNode.getComponent(HitFeedback);
                if (!this._hitFeedback) {
                    this._hitFeedback = modelNode.addComponent(HitFeedback);
                }
            }
        }

        if (this._hitFeedback) {
            this._hitFeedback.playHitFeedback();
        }
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

        this._lastDt = dt;

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
        // 持续型武器每帧触发，离散型武器按冷却间隔
        const manager = HeroWeaponManager.instance;
        // 武器切换检测：停止旧 behavior 的持续特效，防止残留
        const curWeaponType = manager.activeWeapon?.type ?? null;
        if (curWeaponType !== this._prevWeaponType) {
            if (this._prevWeaponType) {
                const oldBehavior = WeaponBehaviorFactory.get(this._prevWeaponType as any);
                oldBehavior?.stopFire?.();
            }
            this._prevWeaponType = curWeaponType;
        }
        if (manager.activeWeapon) {
            const behavior = WeaponBehaviorFactory.get(manager.activeWeapon.type);
            const shouldFire =
                this._target && (behavior?.isContinuous || this._customWeaponTimer <= 0);
            WeaponSFXManager.syncLoopState(
                this.node,
                manager.activeWeapon.type,
                Boolean(this._target && this._target.isAlive)
            );
            if (shouldFire) {
                this.performAttack();
            } else if (!this._target) {
                // 无目标时停止持续型武器
                this._stopCurrentWeapon();
            }
        } else {
            WeaponSFXManager.syncLoopState(this.node, null, false);
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
                const effectiveStats = this.getEffectiveWeaponStats(rawStats, active.type);
                return effectiveStats.range ?? this._stats.attackRange;
            }
        }
        return this._stats.attackRange;
    }

    private getEffectiveWeaponStats(base: WeaponLevelStats, weaponType?: string): WeaponLevelStats {
        const baseRange = Math.max(0.0001, this._baseStats.attackRange);
        const baseInterval = Math.max(0.0001, this._baseStats.attackInterval);
        const rangeMultiplier = this._stats.attackRange / baseRange;
        const intervalMultiplier = this._stats.attackInterval / baseInterval;
        const heroSkill = GameConfig.BALANCE.HERO_SKILL;
        const typeScaleMap = heroSkill.WEAPON_TYPE_DAMAGE_SCALE;
        const typeDamageScale =
            weaponType === 'machine_gun'
                ? typeScaleMap.MACHINE_GUN
                : weaponType === 'flamethrower'
                  ? typeScaleMap.FLAMETHROWER
                  : weaponType === 'cannon'
                    ? typeScaleMap.CANNON
                    : weaponType === 'glitch_wave'
                      ? typeScaleMap.GLITCH_WAVE
                      : 1;
        return {
            ...base,
            damage: Math.max(1, base.damage * heroSkill.WEAPON_DAMAGE_MULTIPLIER * typeDamageScale),
            range: Math.max(0.1, base.range * rangeMultiplier * heroSkill.WEAPON_RANGE_MULTIPLIER),
            attackInterval: Math.max(
                0.05,
                base.attackInterval *
                    intervalMultiplier *
                    heroSkill.WEAPON_ATTACK_INTERVAL_MULTIPLIER
            ),
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
        const manager = HeroWeaponManager.instance;
        const behavior = manager.activeWeapon
            ? WeaponBehaviorFactory.get(manager.activeWeapon.type)
            : null;
        const spinDps = behavior?.heroSpinDegreesPerSec ?? 0;

        if (spinDps > 0 && this._target) {
            if (!this._wasSpinning) {
                // 首帧：从当前朝向角度起旋，避免跳变
                this._spinYAngle = this.node.eulerAngles.y;
                this._wasSpinning = true;
            }
            this._spinYAngle += spinDps * this._lastDt;
            this.node.setRotationFromEuler(0, this._spinYAngle, 0);
            return;
        }

        this._wasSpinning = false;
        if (!this._hasFacingDir) return;
        const pos = this.node.position;
        const lookAt = Hero._tmpLookAt;
        lookAt.set(pos.x + this._facingDir.x, pos.y, pos.z + this._facingDir.z);
        this.node.lookAt(lookAt);
    }

    protected performAttack(): void {
        if (!this._target || !this._target.isAlive) {
            this._stopCurrentWeapon();
            return;
        }

        // 优先使用空投武器系统
        const manager = HeroWeaponManager.instance;
        const active = manager.activeWeapon;
        if (active) {
            const behavior = WeaponBehaviorFactory.get(active.type);
            const def = manager.getWeaponDef(active.type);
            if (behavior && def) {
                const stats = this.getEffectiveWeaponStats(
                    getWeaponLevelStats(def, active.level),
                    active.type
                );
                const parent = this.node.parent;
                if (!parent) return;

                if (behavior.isContinuous) {
                    // 持续型武器（喷火器）：每帧 fire，传入 dt
                    const dt = this._lastDt > 0 ? this._lastDt : 0.016;
                    behavior.fire(this.node, this._target.node, stats, active.level, parent, dt);
                    // 不使用 _customWeaponTimer，持续触发
                } else {
                    // 离散型武器（机枪、大炮等）：按冷却间隔
                    if (this._customWeaponTimer <= 0) {
                        behavior.fire(this.node, this._target.node, stats, active.level, parent);
                        this._customWeaponTimer = stats.attackInterval;
                    }
                }
                return;
            }
        }

        // 默认武器
        if (this._weapon) {
            this._weapon.tryAttack(this._target.node);
        }
    }

    /** 停止当前持续型武器的效果 */
    private _stopCurrentWeapon(): void {
        const manager = HeroWeaponManager.instance;
        const active = manager.activeWeapon;
        if (active) {
            const behavior = WeaponBehaviorFactory.get(active.type);
            if (behavior?.stopFire) {
                behavior.stopFire();
            }
        }
        WeaponSFXManager.stopAllLoops(this.node);
    }

    // === 升级处理 ===

    private onLevelUp(data: { level: number; heroNode: Node }): void {
        if (data.heroNode !== this.node) return;
        this.recalcStats();
        // 升级回满血
        this._stats.currentHp = this._stats.maxHp;
        this.updateHealthBar();
    }

    private onBaseUpgradeReady(data: { baseLevel: number }): void {
        const targetLevel = Math.max(1, Math.floor(data?.baseLevel ?? 1));
        if (targetLevel <= this._appliedBaseUpgradeLevel) return;

        const buff = GameConfig.BUILDING.BASE_UPGRADE.HERO_BUFF;
        for (let level = this._appliedBaseUpgradeLevel + 1; level <= targetLevel; level++) {
            this._buffMultipliers.maxHp = (this._buffMultipliers.maxHp ?? 1) * buff.HP_MULTIPLIER;
            this._buffMultipliers.attack =
                (this._buffMultipliers.attack ?? 1) * buff.ATTACK_MULTIPLIER;
            this._buffMultipliers.attackInterval =
                (this._buffMultipliers.attackInterval ?? 1) * buff.ATTACK_INTERVAL_MULTIPLIER;
            this._buffMultipliers.moveSpeed =
                (this._buffMultipliers.moveSpeed ?? 1) * buff.MOVE_SPEED_MULTIPLIER;
            this._buffAdditives.attackRange =
                (this._buffAdditives.attackRange ?? 0) + buff.ATTACK_RANGE_BONUS;
        }

        this._appliedBaseUpgradeLevel = targetLevel;
        this.recalcStats();
        const healAmount = Math.floor(this._stats.maxHp * buff.HEAL_PERCENT);
        this.heal(Math.max(1, healAmount), false);
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

            // attack 取整
            if (key === 'attack' || key === 'maxHp') {
                value = Math.floor(value);
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

    protected onDeath(): void {
        this.startRespawnCountdown();
    }

    private startRespawnCountdown(): void {
        if (this._respawning) return;

        this._respawning = true;
        this._respawnRemainingSeconds = Hero.RESPAWN_DELAY_SECONDS;
        this._inputVector.set(0, 0);
        this._hasFacingDir = false;
        this._target = null;
        this._stopCurrentWeapon();
        this.setHeroCollisionEnabled(false);

        this.hudManager.showHeroRespawnCountdown(this._respawnRemainingSeconds);

        this.unschedule(this.tickRespawnCountdown);
        this.unschedule(this.finishRespawn);
        this.schedule(this.tickRespawnCountdown, 1, Hero.RESPAWN_DELAY_SECONDS - 1, 1);
        this.scheduleOnce(this.finishRespawn, Hero.RESPAWN_DELAY_SECONDS);
    }

    private tickRespawnCountdown(): void {
        if (!this._respawning) return;
        this._respawnRemainingSeconds = Math.max(0, this._respawnRemainingSeconds - 1);
        if (this._respawnRemainingSeconds > 0) {
            this.hudManager.updateHeroRespawnCountdown(this._respawnRemainingSeconds);
        }
    }

    private finishRespawn(): void {
        if (!this.node || !this.node.isValid) return;

        this._respawning = false;
        this._respawnRemainingSeconds = 0;

        const respawnPos = this.resolveRespawnPosition();
        this.node.setWorldPosition(respawnPos.x, GameConfig.PHYSICS.HERO_Y, respawnPos.z);

        this.resetUnit();
        this._state = UnitState.IDLE;
        this._target = null;
        this._inputVector.set(0, 0);
        this._hasFacingDir = false;
        this.setHeroCollisionEnabled(true);

        this.hudManager.showHeroRespawnReadyPrompt();
    }

    private resolveRespawnPosition(): Vec3 {
        const basePos = this.findBuildingWorldPosition('base');
        const spaPos = this.findBuildingWorldPosition('spa');

        if (basePos && spaPos) {
            return new Vec3(
                (basePos.x + spaPos.x) * 0.5,
                GameConfig.PHYSICS.HERO_Y,
                (basePos.z + spaPos.z) * 0.5
            );
        }

        if (basePos) {
            return new Vec3(
                basePos.x + GameConfig.MAP.HERO_SPAWN_OFFSET.x,
                GameConfig.PHYSICS.HERO_Y,
                basePos.z + GameConfig.MAP.HERO_SPAWN_OFFSET.z
            );
        }

        return new Vec3(
            GameConfig.MAP.BASE_SPAWN.x + GameConfig.MAP.HERO_SPAWN_OFFSET.x,
            GameConfig.PHYSICS.HERO_Y,
            GameConfig.MAP.BASE_SPAWN.z + GameConfig.MAP.HERO_SPAWN_OFFSET.z
        );
    }

    private findBuildingWorldPosition(typeId: string): Vec3 | null {
        for (const node of this.gameManager.activeBuildings) {
            if (!node || !node.isValid) continue;
            const building = node.getComponent(Building);
            if (!building || building.buildingTypeId !== typeId) continue;
            return node.getWorldPosition(new Vec3());
        }
        return null;
    }

    private setHeroCollisionEnabled(enabled: boolean): void {
        const collider = this.node.getComponent(CapsuleCollider);
        if (collider && collider.isValid) {
            collider.enabled = enabled;
        }
    }

    protected get gameManager(): GameManager {
        return ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
    }

    private get hudManager(): HUDManager {
        return ServiceRegistry.get<HUDManager>('HUDManager') ?? HUDManager.instance;
    }
}
