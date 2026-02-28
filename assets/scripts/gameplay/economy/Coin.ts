import { _decorator, Vec3, BoxCollider, Node } from 'cc';
import { BaseComponent } from '../../core/base/BaseComponent';
import { EventManager } from '../../core/managers/EventManager';
import { GameEvents } from '../../data/GameEvents';
import { IPoolable } from '../../core/managers/PoolManager';
import { Tween } from 'cc';
// import { GameManager } from '../../core/managers/GameManager';
import { GameConfig } from '../../data/GameConfig';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import { HeroQuery } from '../../core/runtime/HeroQuery';
import { CoopBuildAuthority } from '../../core/runtime/CoopBuildAuthority';

const { ccclass, property } = _decorator;

/**
 * 金币组件
 * 包含动画、生命周期管理和物理触发
 */
@ccclass('Coin')
export class Coin extends BaseComponent implements IPoolable {
    private static readonly _activeCoins: Set<Coin> = new Set();

    @property
    public value: number = 5;
    @property
    public floatSpeed: number = GameConfig.ECONOMY.COIN_FLOAT_SPEED;
    @property
    public floatAmplitude: number = GameConfig.ECONOMY.COIN_FLOAT_AMPLITUDE;
    @property
    public enableLifetime: boolean = false;
    @property
    public lifetimeLimit: number = GameConfig.ECONOMY.COIN_LIFETIME;
    @property
    public floatPhase: number = 0;

    public startY: number = 0.5;
    private _lifetime: number = 0;
    private _isCollecting: boolean = false;
    private _initialPos: Vec3 = new Vec3();

    protected initialize(): void {
        // Initial setup if needed
        this._isCollecting = false;
        this._lifetime = 0;
        Coin._activeCoins.add(this);
    }

    protected cleanup(): void {
        // Cleanup if needed
        Coin._activeCoins.delete(this);
    }

    // Static reference to avoid circular dependency with GameManager
    public static HeroNode: Node | null = null;

    // ...

    public onSpawn(): void {
        // NOTE: For pooled coins, ensure state reset.
        this._isCollecting = false;
        this._lifetime = 0;
        this.enabled = true;
        Coin._activeCoins.add(this);

        const col = this.getComponent(BoxCollider);
        if (col) col.enabled = true;
    }

    public onDespawn(): void {
        this._isCollecting = false;
        Coin._activeCoins.delete(this);
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

        // Guest in coop mode: skip magnet entirely — coins just float.
        // Host handles all pickup; guest learns via COIN_PICKED network sync.
        if (CoopBuildAuthority.isGuest) {
            this._lifetime += dt;
            if (this.enableLifetime && this._lifetime >= this.lifetimeLimit) {
                this.collect(true);
                return;
            }
            const floatY =
                Math.sin(this._lifetime * this.floatSpeed + this.floatPhase) * this.floatAmplitude;
            this.node.setPosition(this.node.position.x, this.startY + floatY, this.node.position.z);
            return;
        }

        // Magnet Logic — attract only to local hero (prevents coins clustering
        // around remote hero avatar in coop mode)
        const hero =
            (CoopBuildAuthority.isCoopMode
                ? HeroQuery.getLocalHero()
                : HeroQuery.getNearestHero(this.node.worldPosition)) ?? Coin.HeroNode;
        let isAttracted = false;

        if (hero && hero.isValid) {
            // Using world position for accurate distance regardless of hierarchy
            const heroPos = hero.worldPosition;
            const myPos = this.node.worldPosition;
            const dist = Vec3.distance(heroPos, myPos);

            if (dist < GameConfig.ECONOMY.COIN_COLLECT_RANGE) {
                // Magnet Radius
                isAttracted = true;

                // Move towards hero
                const direction = new Vec3();
                Vec3.subtract(direction, heroPos, myPos);
                // Aim slightly higher (center of body)
                direction.y += GameConfig.ECONOMY.COIN_MAGNET_HEIGHT_OFFSET;
                direction.normalize();

                const speed = GameConfig.ECONOMY.COIN_MAGNET_SPEED;
                const moveStep = direction.multiplyScalar(speed * dt);

                const newPos = new Vec3();
                Vec3.add(newPos, myPos, moveStep);
                this.node.setWorldPosition(newPos);
            }
        }

        if (!isAttracted) {
            this._lifetime += dt;

            // Life Cycle
            if (this.enableLifetime && this._lifetime >= this.lifetimeLimit) {
                this.collect(true);
                return;
            }

            // Floating Animation
            const floatY =
                Math.sin(this._lifetime * this.floatSpeed + this.floatPhase) * this.floatAmplitude;
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
            this.eventManager.emit(GameEvents.COIN_COLLECTED, {
                amount: this.value,
            });
        }

        this.node.destroy();
    }

    public static consumeNearestAt(x: number, z: number, maxDistance: number = 1.25): boolean {
        if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
        if (!Number.isFinite(maxDistance) || maxDistance <= 0) return false;

        let best: Coin | null = null;
        let bestDistSq = maxDistance * maxDistance;

        for (const coin of Coin._activeCoins) {
            if (!coin || !coin.node || !coin.node.isValid || !coin.node.activeInHierarchy) continue;
            if (coin._isCollecting) continue;
            const pos = coin.node.worldPosition;
            const dx = pos.x - x;
            const dz = pos.z - z;
            const distSq = dx * dx + dz * dz;
            if (distSq <= bestDistSq) {
                best = coin;
                bestDistSq = distSq;
            }
        }

        if (!best) return false;
        best.onPickup();
        best.node.destroy();
        return true;
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }
}
