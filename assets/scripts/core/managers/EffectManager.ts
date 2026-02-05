import { _decorator, Node, Vec3 } from 'cc';
import { EventManager } from '../../core/managers/EventManager';
import { GameEvents } from '../../data/GameEvents';
import { EffectFactory } from '../../gameplay/effects/EffectFactory';
import { ServiceRegistry } from './ServiceRegistry';

const { ccclass, property } = _decorator;

/**
 * 特效管理器
 * 监听游戏事件并生成对应的视觉特效
 */
@ccclass('EffectManager')
export class EffectManager {
    private static _instance: EffectManager | null = null;
    private _container: Node | null = null;

    public static get instance(): EffectManager {
        if (!this._instance) {
            this._instance = new EffectManager();
        }
        return this._instance;
    }

    public initialize(container: Node): void {
        this._container = container;
        this.setupListeners();
        console.log('[EffectManager] Initialized');
    }

    public cleanup(): void {
        this.eventManager.off(GameEvents.APPLY_AOE_EFFECT, this.onApplyAoE, this);
    }

    private setupListeners(): void {
        this.eventManager.on(GameEvents.APPLY_AOE_EFFECT, this.onApplyAoE, this);
    }

    private onApplyAoE(data: {
        center: Vec3;
        radius: number;
        damage: number;
        slowPercent: number;
        slowDuration: number;
    }): void {
        if (!this._container) return;

        // Determine Effect Type based on data
        // If slowPercent > 0, it's a Frost effect
        if (data.slowPercent > 0) {
            EffectFactory.createFrostExplosion(this._container, data.center, data.radius);
            console.log(`[EffectManager] Playing Frost Explosion at ${data.center}`);
        } else {
            // Default Explosion
            // EffectFactory.createExplosion(...)
        }
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }
}
