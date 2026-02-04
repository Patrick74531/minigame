import { _decorator, Vec2, Vec3, Node, Component, RigidBody, CapsuleCollider, ITriggerEvent, PhysicsSystem, geometry, Color } from 'cc';
import { Unit, UnitType, UnitState } from './Unit';
import { GameManager } from '../../core/managers/GameManager';
import { WaveManager } from '../../core/managers/WaveManager';
import { GameConfig } from '../../data/GameConfig';
import { Coin } from '../economy/Coin';
import { HUDManager } from '../../ui/HUDManager';
import { RangedWeapon } from '../combat/weapons/RangedWeapon';

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
        
        // Initialize Weapon
        this._weapon = this.node.addComponent(RangedWeapon);
        this._weapon.damage = this._stats.attack;
        this._weapon.range = this._stats.attackRange;
        this._weapon.attackInterval = this._stats.attackInterval;
        this._weapon.projectileSpeed = 20; // Fast bullets for hero
        this._weapon.projectileColor = new Color(0, 255, 255, 255); // Cyan for Hero

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
        // console.log(`[Hero] Targeting check. Enemies: ${enemies.length}`); // Verbose log

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
                if (this._state !== UnitState.ATTACKING) {
                     console.log(`[Hero] Found target: ${nearest.name} at dist: ${minDist.toFixed(2)}`);
                }
                this.setTarget(unit);
                this._state = UnitState.ATTACKING;
            } else {
                this.setTarget(null);
                this._state = UnitState.IDLE;
            }
        } else {
            if (this._state === UnitState.ATTACKING) {
                // console.log(`[Hero] Lost target.`);
            }
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

        const speed = this._stats.moveSpeed;
        
        // Desired movement in World Space
        // Joystick Up (Y=1) is World Forward (-Z)
        const dx = this._inputVector.x * speed * dt;
        const dz = -this._inputVector.y * speed * dt;

        const currentPos = this.node.position.clone();
        const targetPos = new Vec3(currentPos.x + dx, currentPos.y, currentPos.z + dz);
        
        // Basic movement direction for sweep
        const moveVec = new Vec3(dx, 0, dz);
        const moveDist = moveVec.length();

        if (moveDist < 0.001) return;

        // Perform Sweep Test
        // limit Y to avoid floor sticking if we are slightly inside
        const col = this.node.getComponent(CapsuleCollider);
        const radius = col ? col.radius : 0.3;
        const centerY = col ? col.center.y : 0.75;

        // Origin should be the center of the capsule for the sphere sweep
        const sweepOrigin = new Vec3(currentPos.x, currentPos.y + centerY, currentPos.z);
        
        // Ray for sweep
        const ray = new geometry.Ray();
        Vec3.copy(ray.o, sweepOrigin);
        Vec3.normalize(ray.d, moveVec);

        // Sweep
        // mask: default (0xffffffff) or specific group?
        // Let's use default for now, can refine if we hit triggers
        const mask = 0xffffffff; 
        const maxDist = moveDist + 0.1; // Check slightly further

        let finalX = targetPos.x;
        let finalZ = targetPos.z;

        if (PhysicsSystem.instance.sweepSphereClosest(ray, radius, mask, maxDist, false)) {
            const result = PhysicsSystem.instance.sweepSphereClosestResult;
            
            // If we hit something (Physical Obstacle, since queryTrigger is false)
            if (result.collider) {
                // Determine if it's a wall or floor
                // Floor normal is usually (0, 1, 0)
                if (Math.abs(result.hitNormal.y) < 0.5) {
                    // It's a wall/obstacle (normal is mostly horizontal)
                    
                    // Simple slide: Remove velocity component along normal
                    // V_new = V - (V . N) * N
                    const dot = Vec3.dot(moveVec, result.hitNormal);
                    const slideVec = moveVec.clone().subtract(result.hitNormal.clone().multiplyScalar(dot));
                    
                    // Apply slide
                    finalX = currentPos.x + slideVec.x;
                    finalZ = currentPos.z + slideVec.z;
                }
            }
        }

        // Apply Position
        this.node.setPosition(finalX, currentPos.y, finalZ); // Keep Y strictly constant

        // Face movement
        if (moveLen > 0.1) {
             const lookTarget = new Vec3(
                 finalX + dx, // Look at "desired" direction slightly better feel
                 currentPos.y, 
                 finalZ + dz 
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
        // Use Weapon System
        if (!this._target || !this._target.isAlive) return;

        if (this._weapon) {
            this._weapon.tryAttack(this._target.node);
        }
    }
}
