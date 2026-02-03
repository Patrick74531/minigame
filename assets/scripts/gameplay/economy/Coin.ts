import { _decorator, Component, Vec3, BoxCollider, ITriggerEvent } from 'cc';
import { BaseComponent } from '../../core/base/BaseComponent';
import { EventManager } from '../../core/managers/EventManager';
import { GameEvents } from '../../data/GameEvents';
import { IPoolable } from '../../core/managers/PoolManager';
import { GameConfig } from '../../data/GameConfig';

const { ccclass, property } = _decorator;

/**
 * 金币组件
 * 包含动画、生命周期管理和物理触发
 */
@ccclass('Coin')
export class Coin extends BaseComponent implements IPoolable {
    @property
    public value: number = 5;

    public startY: number = 0.5;
    private _lifetime: number = 0;
    private _isCollecting: boolean = false;
    private _initialPos: Vec3 = new Vec3();

    protected initialize(): void {
        // Initial setup if needed
        this._isCollecting = false;
        this._lifetime = 0;
    }

    protected cleanup(): void {
        // Cleanup if needed
    }

    protected start(): void {
        this._initialPos.set(this.node.position);
        this.startY = this.node.position.y;
    }

    protected update(dt: number): void {
        if (this._isCollecting) return;

        this._lifetime += dt;

        // Life Cycle
        if (this._lifetime >= GameConfig.ECONOMY.COIN_LIFETIME) {
            this.autoCollect();
            return;
        }

        // Floating Animation
        // y = startY + sin(t)
        const floatY = Math.sin(this._lifetime * 5) * 0.1;
        this.node.setPosition(this.node.position.x, this.startY + floatY, this.node.position.z);
    }

    // === IPoolable ===

    public onSpawn(): void {
        this.initialize();
        this.node.active = true;
        // Reset position logic handled in Factory or start()
        this._initialPos.set(this.node.position);
        this.startY = this.node.position.y;
    }

    public onDespawn(): void {
        this._isCollecting = false;
    }

    // === 逻辑 ===

    /**
     * 自动回收（超时）
     */
    private autoCollect(): void {
        this.collect(true);
    }

    /**
     * 被英雄拾取
     */
    public onPickup(): void {
        this._isCollecting = true;
        this.enabled = false; // Disable Logic
        
        // Disable Physics
        const rb = this.getComponent(BoxCollider);
        if (rb) rb.enabled = false;
        
        // Ensure lifecycle callbacks are stopped
        this.unscheduleAllCallbacks();
    }

    /**
     * 收集金币 (销毁)
     * @param auto whether it was auto-collected (expired)
     */
    public collect(auto: boolean = false): void {
        if (this._isCollecting) return;
        this._isCollecting = true;

        if (auto) {
            // Auto collect gives money to global?
            // For now, let's assume it just gives it.
            EventManager.instance.emit(GameEvents.COIN_COLLECTED, {
                value: this.value,
            });
        }
        
        this.node.destroy();
    }
}
