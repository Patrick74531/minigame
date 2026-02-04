import { _decorator, Vec2, Vec3, RigidBody } from 'cc';
import { Unit, UnitState, UnitType } from './Unit';
import { GameConfig } from '../../data/GameConfig';
import { EventManager } from '../../core/managers/EventManager';
import { GameEvents } from '../../data/GameEvents';

const { ccclass, property } = _decorator;

/**
 * 敌人单位
 * 自动向基地（原点）移动，到达后发送事件
 */
@ccclass('Enemy')
export class Enemy extends Unit {
    /** 到达基地的距离阈值 */
    private readonly ARRIVAL_DISTANCE = 0.6;

    protected initialize(): void {
        super.initialize();
        this.unitType = UnitType.ENEMY;

        this.initStats({
            maxHp: GameConfig.ENEMY.BASE_HP,
            attack: GameConfig.ENEMY.BASE_ATTACK,
            attackRange: GameConfig.ENEMY.ATTACK_RANGE,
            attackInterval: GameConfig.ENEMY.ATTACK_INTERVAL,
            moveSpeed: GameConfig.ENEMY.MOVE_SPEED,
        });
        
        // 敌人默认处于移动状态
        this._state = UnitState.MOVING;
        console.log(`[Enemy] 初始化完成, HP=${this._stats.currentHp}, state=${this._state}`);
    }

    public onSpawn(): void {
        super.onSpawn();
        this._state = UnitState.MOVING;
    }

    protected updateMovement(dt: number): void {
        if (!this.isAlive) return;

        const pos = this.node.position;
        // 3D: Distance to base (0,0,0) on XZ plane
        const distToBase = Math.sqrt(pos.x * pos.x + pos.z * pos.z);

        // 检查是否到达基地
        if (distToBase < this.ARRIVAL_DISTANCE) {
            this.onReachBase();
            return;
        }

        // 向原点（基地）移动
        const speed = this.moveSpeed; // Config speed matches physics units/sec now
        
        const dirX = -pos.x / distToBase;
        const dirZ = -pos.z / distToBase;

        const rb = this.node.getComponent('cc.RigidBody') as any; // Type casting or use logic
        // Use RigidBody directly if imported, else try generic
        // To be safe let's assume getComponent(RigidBody)
        // Since I can't guarantee import of RigidBody here without adding it, let's assume it's available or add import logic if needed. 
        // But to keep it simple and safe:
        
        // Use the component if available
        if (this.node.getComponent('cc.RigidBody')) {
             (this.node.getComponent('cc.RigidBody') as any).setLinearVelocity(new Vec3(dirX * speed, 0, dirZ * speed));
        } else {
            // Fallback (shouldn't happen with factory update)
             this.node.setPosition(
                pos.x + dirX * speed * dt, // If no physics, manual but might fail collisions
                0.5, // keep height
                pos.z + dirZ * speed * dt
            );
        }
        
        // Face base
        this.node.lookAt(new Vec3(0, 0, 0));
    }

    /**
     * 到达基地时调用
     */
    private onReachBase(): void {
        // 发送事件通知 GameController 处理基地伤害
        EventManager.instance.emit(GameEvents.ENEMY_REACHED_BASE, {
            enemy: this.node,
            damage: 10
        });
        
        // 敌人到达后销毁
        this._state = UnitState.DEAD;
        this.node.destroy();
    }

    protected performAttack(): void {
        if (!this._target || !this._target.isAlive) return;
        this._target.takeDamage(this._stats.attack, this);
    }

    protected onDeath(): void {
        // GameController 负责处理死亡和金币掉落，这里不再发送事件
        // 避免重复处理导致的 bug
    }
}

