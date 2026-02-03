import { _decorator, Vec2, Vec3, Node, Component } from 'cc';
import { Unit, UnitType, UnitState } from './Unit';
import { WaveManager } from '../../core/managers/WaveManager';
import { GameConfig } from '../../data/GameConfig';

const { ccclass, property } = _decorator;

/**
 * 英雄单位
 * 玩家控制的角色，通过摇杆移动
 */
@ccclass('Hero')
export class Hero extends Unit {
    // 移动输入向量 (x, y) -1 ~ 1
    private _inputVector: Vec2 = new Vec2(0, 0);

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
        
        // 创建金币挂载点 - 在 initialize 中创建，确保已有 node
        this._coinContainer = new Node('CoinStack');
        this.node.addChild(this._coinContainer);
        this._coinContainer.setPosition(0, 1.2, 0); // 头顶位置
    }

    // === 金币堆叠系统 ===
    private _coinStack: Node[] = [];
    private _coinContainer: Node | null = null;

    public onSpawn(): void {
        super.onSpawn();
        this._state = UnitState.IDLE;
        this._inputVector.set(0, 0);
        this._coinStack = []; // 重置金币栈
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
            // updateTargeting 会接管
            return;
        }

        // 转换配置速度到世界单位 (/60)
        const speed = this._stats.moveSpeed / 60;
        const moveDist = speed * dt;

        const currentPos = this.node.position;
        // Joystick Y maps to World Z (Inverted: Up -> -Z)
        const newX = currentPos.x + this._inputVector.x * moveDist;
        const newZ = currentPos.z - this._inputVector.y * moveDist; // Inverted

        this.node.setPosition(newX, currentPos.y, newZ);

        // 面向移动方向
        if (moveLen > 0.1) {
             // Look at target point
             const lookTarget = new Vec3(
                 newX + this._inputVector.x, 
                 currentPos.y, 
                 newZ - this._inputVector.y // Inverted
             );
             this.node.lookAt(lookTarget);
        }

        this.clampPosition();
    }

    private clampPosition(): void {
        const pos = this.node.position;
        const limitX = 8; // 地图宽
        const limitZ = 6; // 地图高 (Z axis)

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
