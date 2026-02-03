import { _decorator, Vec2, Vec3 } from 'cc';
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
    }

    public onSpawn(): void {
        super.onSpawn();
        this._state = UnitState.IDLE;
        this._inputVector.set(0, 0);
    }

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
