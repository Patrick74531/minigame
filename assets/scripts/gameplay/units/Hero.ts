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

    public onDespawn(): void {
        if (GameManager.instance.hero === this.node) {
            GameManager.instance.hero = null;
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
        });

        // Initialize Components
        this._weapon = this.node.getComponent(RangedWeapon);
        if (!this._weapon) {
            this._weapon = this.node.addComponent(RangedWeapon);
            this._weapon.damage = this._stats.attack;
            this._weapon.range = this._stats.attackRange;
            this._weapon.attackInterval = this._stats.attackInterval;
            this._weapon.projectileSpeed = 20;
            this._weapon.projectileColor = new Color(0, 255, 255, 255);
        }

        this._mover = this.node.getComponent(CharacterMover);
        if (!this._mover) {
            this._mover = this.node.addComponent(CharacterMover);
            this._mover.moveSpeed = this._stats.moveSpeed;
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
    }

    protected start(): void {
        GameManager.instance.hero = this.node;
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
            HUDManager.instance.updateCoinDisplay(this.coinCount);
        }
    }

    public onSpawn(): void {
        super.onSpawn();
        this._state = UnitState.IDLE;
        this._inputVector.set(0, 0);
        GameManager.instance.hero = this.node;
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

        // 如果有输入，强制为移动状态
        if (this._inputVector.lengthSqr() > 0.01) {
            this._state = UnitState.MOVING;
        } else {
            // 否则尝试索敌
            this.updateTargeting();
        }

        super.update(dt);
    }

    private updateTargeting(): void {
        let nearest: Node | null = null;

        const provider = CombatService.provider;
        if (provider && provider.findEnemyInRange) {
            const result: any = provider.findEnemyInRange(this.node.position, this._stats.attackRange);
            if (result?.node) {
                nearest = result.node;
            } else if (result?.isValid) {
                nearest = result as Node;
            }
        } else {
            const enemies = EnemyQuery.getEnemies();
            let minDist = this._stats.attackRange;
            const myPos = this.node.position;

            for (const enemy of enemies) {
                if (!enemy.isValid) continue;
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
                if (this._state !== UnitState.ATTACKING) {
                    // console.log(`[Hero] Targeting ${nearest.name}`);
                }
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

        if (this._weapon) {
            this._weapon.tryAttack(this._target.node);
        }
    }
}
