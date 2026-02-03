import { _decorator, Vec2, Vec3, Node, Component } from 'cc';
import { Unit, UnitType, UnitState } from './Unit';
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
        console.log(`[Hero] addCoin 被调用, 当前栈长度: ${this._coinStack.length}`);
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

    protected updateMovement(dt: number): void {
        if (!this.isAlive) return;

        const moveLen = this._inputVector.length();
        if (moveLen < 0.01) {
            this._state = UnitState.IDLE;
            return;
        }

        // 转换配置速度到世界单位 (/60)
        const speed = this._stats.moveSpeed / 60;
        const moveDist = speed * dt;

        // 移动 (X, Y 对应 3D 场景的 X, Y)
        // 注意：如果摄像机是斜视角的，可能需要调整 Y 的移动比例以符合直觉
        // 但目前我们是正交顶视图或简单透视，直接映射即可

        const currentPos = this.node.position;
        this.node.setPosition(
            currentPos.x + this._inputVector.x * moveDist,
            currentPos.y + this._inputVector.y * moveDist,
            currentPos.z
        );

        // 简单的边界限制（防止跑出地图太远）
        this.clampPosition();
    }

    private clampPosition(): void {
        const pos = this.node.position;
        const limitX = 8; // 地图宽
        const limitY = 6; // 地图高

        let newX = pos.x;
        let newY = pos.y;

        if (pos.x > limitX) newX = limitX;
        if (pos.x < -limitX) newX = -limitX;
        if (pos.y > limitY) newY = limitY;
        if (pos.y < -limitY) newY = -limitY;

        if (newX !== pos.x || newY !== pos.y) {
            this.node.setPosition(newX, newY, pos.z);
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
