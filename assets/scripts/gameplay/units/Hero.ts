import { _decorator, Vec2, Vec3, Node, Component, RigidBody, CapsuleCollider, ITriggerEvent, PhysicsSystem } from 'cc';
import { Unit, UnitType, UnitState } from './Unit';
import { GameManager } from '../../core/managers/GameManager';
import { WaveManager } from '../../core/managers/WaveManager';
import { GameConfig } from '../../data/GameConfig';
import { Coin } from '../economy/Coin';
import { HUDManager } from '../../ui/HUDManager';

const { ccclass, property } = _decorator;

/**
 * 英雄单位
 * 玩家控制的角色，通过摇杆移动
 */
@ccclass('Hero')
export class Hero extends Unit {
    // 移动输入向量 (x, y) -1 ~ 1
    private _inputVector: Vec2 = new Vec2(0, 0);

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
        
        // 创建金币挂载点
        this._coinContainer = new Node('CoinStack');
        this.node.addChild(this._coinContainer);
        this._coinContainer.setPosition(0, 1.2, 0); // 头顶位置

        // Physics Setup
        let rb = this.node.getComponent(RigidBody);
        if (!rb) {
            rb = this.node.addComponent(RigidBody);
            rb.type = RigidBody.Type.KINEMATIC; // Restore Kinematic
            rb.useGravity = false; // No Gravity - manually strictly 2D on XZ
            // Damping/Factors don't apply to Kinematic same way, but safe to leave or clear
            // rb.linearDamping = 0.5; // Low damping for smooth movement
            // rb.angularFactor = new Vec3(0, 0, 0); 
            // rb.linearFactor = new Vec3(1, 0, 1); // Lock Y axis completely
        }

        let col = this.node.getComponent(CapsuleCollider);
        if (!col) {
            col = this.node.addComponent(CapsuleCollider);
            col.cylinderHeight = 1.0;
            col.radius = 0.3;
            col.center = new Vec3(0, 0.75, 0);
            col.isTrigger = false; // MUST be false for physical blocking
        }
        
        // Groups: Hero (1<<0)
        // Ensure we collide with Default (Walls), Coin (1<<1), Pad (1<<2)
        // 1<<0 is Default
        col.setGroup(1 << 0);
        col.setMask(0xffffffff); // Collide with everything
    }

    protected start(): void {
        // Ensure we are registered even if onSpawn wasn't called (e.g. initial creation)
        GameManager.instance.hero = this.node;

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
            // Commercial Grade: Disable logic but keep visual
            coin.onPickup(); 
            HUDManager.instance.updateCoinDisplay(this.coinCount);
        }
    }

    // === 金币堆叠系统 ===
    private _coinStack: Node[] = [];
    private _coinContainer: Node | null = null;

    public onSpawn(): void {
        super.onSpawn();
        this._state = UnitState.IDLE;
        this._inputVector.set(0, 0);
        this._coinStack = []; // 重置金币栈
        GameManager.instance.hero = this.node;
    }

    /**
     * 添加金币到堆叠
     */
    public addCoin(coin: Node): void {
        this._coinStack.push(coin);
        
        // 物理转移
        coin.removeFromParent();
        this._coinContainer!.addChild(coin);
        
        // 禁用金币组件逻辑
        const coinComp = coin.getComponent('Coin') as Component;
        if (coinComp) coinComp.enabled = false;

        // 重置变换
        coin.setPosition(0, this._coinStack.length * 0.1, 0); // 每个金币高 0.1
        coin.setRotationFromEuler(0, Math.random() * 360, 0); // 随机旋转增加自然感
        coin.setScale(0.5, 0.5, 0.5); // 稍微缩小一点
        
        // 停止之前的任何动画
        // (Coin 组件逻辑应该在被 pickup 后停止，或者被 GameController 移除后停止更新)
    }

    /**
     * 移除栈顶金币（用于消费）
     * @param count 要移除的金币数量，默认为 1
     * @returns 实际移除的金币数量
     */
    public removeCoin(count: number = 1): number {
        let removed = 0;
        const toRemove = Math.min(count, this._coinStack.length);
        
        for (let i = 0; i < toRemove; i++) {
            const coin = this._coinStack.pop();
            if (coin) {
                coin.destroy();
                removed++;
            }
        }
        return removed;
    }

    public get coinCount(): number {
        return this._coinStack.length;
    }

    // === 现有方法 ===
    
    /**
     * 设置移动输入
     * @param input 输入向量
     */
    public setInput(input: Vec2): void {
        this._inputVector.set(input);

        if (input.lengthSqr() > 0.01) {
            this._state = UnitState.MOVING;
        } else {
            this._state = UnitState.IDLE;
            // Immediately stop physics to prevent sliding
            const rb = this.node.getComponent(RigidBody);
            if (rb) {
                rb.setLinearVelocity(new Vec3(0, 0, 0));
            }
        }
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
        // 简单索敌：找最近的敌人
        const enemies = WaveManager.instance.enemies;
        let nearest: Node | null = null;
        let minDist = this._stats.attackRange; // 仅攻击范围内的

        const myPos = this.node.position;

        for (const enemy of enemies) {
            if (!enemy.isValid) continue;
            const dx = enemy.position.x - myPos.x;
            const dz = enemy.position.z - myPos.z; // 3D
            const dist = Math.sqrt(dx * dx + dz * dz);
            
            if (dist < minDist) {
                minDist = dist;
                nearest = enemy;
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
        if (!this.isAlive) return;

        const moveLen = this._inputVector.length();
        if (moveLen < 0.01) {
            this._state = UnitState.IDLE;
            return;
        }

        // Restore direct position control
        // Note: speed in GameConfig is low (e.g. 6.0), so * dt makes sense for movement per frame
        const speed = this._stats.moveSpeed;
        
        // Joystick Up (Y=1) should be World Forward (-Z)
        const dx = this._inputVector.x * speed * dt;
        const dz = -this._inputVector.y * speed * dt;

        const currentPos = this.node.position;
        // Directly set position (Kinematic style)
        // Note: This bypasses physics collision blocking unless we use sweep, 
        // but it restores the "moving" ability for sure.
        this.node.setPosition(currentPos.x + dx, currentPos.y, currentPos.z + dz);

        // Face movement
        if (moveLen > 0.1) {
             const lookTarget = new Vec3(
                 currentPos.x + dx, 
                 currentPos.y, 
                 currentPos.z + dz 
             );
             this.node.lookAt(lookTarget);
        }

        this.clampPosition();
    }

    private clampPosition(): void {
        const pos = this.node.position;
        // Widened limits to prevent "invisible wall" feel
        const limitX = 25; 
        const limitZ = 25; 

        let newX = pos.x;
        let newZ = pos.z;

        if (pos.x > limitX) newX = limitX;
        if (pos.x < -limitX) newX = -limitX;
        if (pos.z > limitZ) newZ = limitZ;
        if (pos.z < -limitZ) newZ = -limitZ;

        if (newX !== pos.x || newZ !== pos.z) {
            this.node.setPosition(newX, pos.y, newZ);
        }
    }

    protected performAttack(): void {
        // 英雄自动攻击附近的敌人 (Passive)
        // 具体的索敌逻辑可以在 UpdateAttack 中实现
        if (!this._target || !this._target.isAlive) return;

        // 只有当敌人真的很近时才攻击
        this._target.takeDamage(this._stats.attack, this);
    }
}
