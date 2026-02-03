import { _decorator, Vec2 } from 'cc';
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
        const distToBase = Math.sqrt(pos.x * pos.x + pos.y * pos.y);

        // 检查是否到达基地
        if (distToBase < this.ARRIVAL_DISTANCE) {
            this.onReachBase();
            return;
        }

        // 向原点（基地）移动
        const speed = this._stats.moveSpeed / 60; // 转换为世界单位
        const dirX = -pos.x / distToBase;
        const dirY = -pos.y / distToBase;

        this.node.setPosition(
            pos.x + dirX * speed * dt,
            pos.y + dirY * speed * dt,
            pos.z
        );
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

