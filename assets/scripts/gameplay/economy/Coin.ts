import { _decorator, Component, Sprite, Color, UITransform, Vec3 } from 'cc';
import { BaseComponent } from './core/base/BaseComponent';
import { EventManager } from './core/managers/EventManager';
import { GameEvents } from './data/GameEvents';
import { GameConfig } from './data/GameConfig';
import { IPoolable } from './core/managers/PoolManager';

const { ccclass, property } = _decorator;

/**
 * 金币组件
 * 敌人死亡后掉落，玩家点击或自动收集
 */
@ccclass('Coin')
export class Coin extends BaseComponent implements IPoolable {
    @property
    public value: number = 5;

    @property
    public autoCollectDelay: number = 1.5;

    @property
    public flySpeed: number = 800;

    private _isCollecting: boolean = false;
    private _collectTimer: number = 0;

    protected initialize(): void {
        this._isCollecting = false;
        this._collectTimer = 0;
    }

    protected cleanup(): void {
        this.unscheduleAllCallbacks();
    }

    // === IPoolable ===

    public onSpawn(): void {
        this._isCollecting = false;
        this._collectTimer = 0;
        this.node.active = true;
    }

    public onDespawn(): void {
        this._isCollecting = false;
        this.unscheduleAllCallbacks();
    }

    // === 更新循环 ===

    protected update(dt: number): void {
        if (this._isCollecting) return;

        // 自动收集计时
        this._collectTimer += dt;
        if (this._collectTimer >= this.autoCollectDelay) {
            this.collect();
        }
    }

    // === 收集逻辑 ===

    /**
     * 收集金币
     */
    public collect(): void {
        if (this._isCollecting) return;
        this._isCollecting = true;

        // 发送收集事件
        EventManager.instance.emit(GameEvents.COIN_COLLECTED, {
            amount: this.value,
            position: this.node.position.clone(),
        });

        // 简单的消失效果 (后续可添加飞向 HUD 的动画)
        this.scheduleOnce(() => {
            this.node.active = false;
        }, 0.1);
    }

    /**
     * 点击收集（用于触摸事件）
     */
    public onTouchCollect(): void {
        this.collect();
    }
}
