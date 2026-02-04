import { _decorator, Component, Vec3, BoxCollider, Node } from 'cc';
import { BaseComponent } from '../../core/base/BaseComponent';
import { EventManager } from '../../core/managers/EventManager';
import { GameEvents } from '../../data/GameEvents';
import { IPoolable } from '../../core/managers/PoolManager';
import { tween, Tween } from 'cc';
// import { GameManager } from '../../core/managers/GameManager';
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

    // Static reference to avoid circular dependency with GameManager
    public static HeroNode: Node | null = null;

    // ...

    public onSpawn(): void {
        // NOTE: For pooled coins, ensure state reset.
        this._isCollecting = false;
        this._lifetime = 0;
        this.enabled = true;

        const col = this.getComponent(BoxCollider);
        if (col) col.enabled = true;
    }

    public onDespawn(): void {
        this._isCollecting = false;
    }

    protected start(): void {
        this._initialPos.set(this.node.position);
        this.startY = this.node.position.y;

        // Ensure collider is Trigger
        const col = this.getComponent(BoxCollider);
        if (col) col.isTrigger = true;
    }

    protected update(dt: number): void {
        if (this._isCollecting) return;

        // Magnet Logic
        const hero = Coin.HeroNode;
        let isAttracted = false;

        if (hero && hero.isValid) {
            // Using world position for accurate distance regardless of hierarchy
            const heroPos = hero.worldPosition;
            const myPos = this.node.worldPosition;
            const dist = Vec3.distance(heroPos, myPos);

            if (dist < 2.5) {
                // Magnet Radius
                isAttracted = true;

                // Move towards hero
                const direction = new Vec3();
                Vec3.subtract(direction, heroPos, myPos);
                // Aim slightly higher (center of body)
                direction.y += 0.5;
                direction.normalize();

                const speed = 15.0; // Magnet Speed
                const moveStep = direction.multiplyScalar(speed * dt);

                const newPos = new Vec3();
                Vec3.add(newPos, myPos, moveStep);
                this.node.setWorldPosition(newPos);
            }
        }

        if (!isAttracted) {
            this._lifetime += dt;

            // Life Cycle
            if (this._lifetime >= GameConfig.ECONOMY.COIN_LIFETIME) {
                this.collect(true);
                return;
            }

            // Floating Animation
            const floatY = Math.sin(this._lifetime * 5) * 0.1;
            this.node.setPosition(this.node.position.x, this.startY + floatY, this.node.position.z);
        }
    }

    // ...

    /**
     * 被英雄拾取
     */
    public onPickup(): void {
        this._isCollecting = true;
        this.enabled = false; // Disable Logic

        // Disable Physics
        const rb = this.getComponent(BoxCollider);
        if (rb) rb.enabled = false;

        // Stop all animations/tweens
        this.unscheduleAllCallbacks();
        Tween.stopAllByTarget(this.node);
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
                amount: this.value,
            });
        }

        this.node.destroy();
    }
}
