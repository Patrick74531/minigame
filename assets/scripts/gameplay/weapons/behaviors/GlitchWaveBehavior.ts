import { Node } from 'cc';
import { WeaponBehavior } from '../WeaponBehavior';
import { WeaponType, WeaponLevelStats } from '../WeaponTypes';
import { EventManager } from '../../../core/managers/EventManager';
import { ServiceRegistry } from '../../../core/managers/ServiceRegistry';
import { GameEvents } from '../../../data/GameEvents';
import { WhirlwindSlashEffect } from '../../effects/modules/WhirlwindSlashEffect';

/**
 * 电锯风暴武器
 * 持续型武器：攻击开始后动画循环播放，英雄随之自旋，直到目标离开射程。
 * 按 attackInterval 间隔结算一次 AOE 伤害 + 减速。
 */
export class GlitchWaveBehavior extends WeaponBehavior {
    public readonly type = WeaponType.GLITCH_WAVE;

    private _effectContainer: Node | null = null;
    private _dmgTimer: number = 0;
    /** 每次 stopFire 自增，使过期的 spawnPersistent 回调立即销毁所创建节点 */
    private _generation: number = 0;
    /** 是否有正在进行中的 spawnPersistent 回调，防止 prefab 加载期间多帧并发 spawn */
    private _spawning: boolean = false;

    public override get isContinuous(): boolean {
        return true;
    }

    public override get heroSpinDegreesPerSec(): number {
        return 900;
    }

    public fire(
        owner: Node,
        _target: Node,
        stats: WeaponLevelStats,
        _level: number,
        parent: Node,
        dt?: number
    ): void {
        const frameDt = dt ?? 0.016;
        const waveRadius = (stats['waveRadius'] ?? 4) as number;
        const effectParent = owner.parent ?? parent;
        const center = owner.worldPosition.clone();
        center.y = 0;

        // 维持持续特效节点，跟随英雄
        if (!this._effectContainer || !this._effectContainer.isValid) {
            this._effectContainer = null;
            // _spawning 防止 prefab 加载期间每帧重复调用 spawnPersistent，避免多个 ghost 节点
            if (!this._spawning) {
                this._spawning = true;
                const spawnGen = this._generation; // 捕获当前代次
                WhirlwindSlashEffect.spawnPersistent(
                    { parent: effectParent, position: center, radius: waveRadius },
                    node => {
                        this._spawning = false;
                        if (this._generation !== spawnGen) {
                            // stopFire 已在回调触发前调用 — 立即销毁以防 ghost
                            node.destroy();
                            return;
                        }
                        this._effectContainer = node;
                    }
                );
            }
        } else {
            this._effectContainer.setWorldPosition(center);
        }

        // 按攻击间隔结算 AOE 伤害 + 减速
        this._dmgTimer += frameDt;
        if (this._dmgTimer >= stats.attackInterval) {
            this._dmgTimer -= stats.attackInterval;
            const slowPercent = Math.max(
                0,
                Math.min(0.85, (stats['slowPercent'] ?? 0.3) as number)
            );
            const slowDuration = Math.max(0.2, (stats['slowDuration'] ?? 1.8) as number);
            const eventManager =
                ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
            eventManager.emit(GameEvents.APPLY_AOE_EFFECT, {
                center,
                radius: waveRadius,
                damage: stats.damage,
                slowPercent,
                slowDuration,
                effectType: 'glitch_interference',
            });
        }
    }

    public override stopFire(): void {
        this._generation++; // 使所有进行中的 spawnPersistent 回调失效
        this._spawning = false;
        if (this._effectContainer && this._effectContainer.isValid) {
            this._effectContainer.destroy();
        }
        this._effectContainer = null;
        this._dmgTimer = 0;
    }
}
