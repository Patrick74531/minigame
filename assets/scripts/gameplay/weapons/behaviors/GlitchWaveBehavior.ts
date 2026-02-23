import { Node } from 'cc';
import { WeaponBehavior } from '../WeaponBehavior';
import { WeaponType, WeaponLevelStats } from '../WeaponTypes';
import { WeaponSFXManager } from '../WeaponSFXManager';
import { EventManager } from '../../../core/managers/EventManager';
import { ServiceRegistry } from '../../../core/managers/ServiceRegistry';
import { GameEvents } from '../../../data/GameEvents';
import { EffectFactory } from '../../effects/EffectFactory';

/**
 * 旋风斩武器 — 信号干扰波
 * 视觉表现：旋风斩动画（daoguang_skill_2.anim）
 * 机制定位：范围伤害 + 减速
 */
export class GlitchWaveBehavior extends WeaponBehavior {
    public readonly type = WeaponType.GLITCH_WAVE;

    public fire(
        owner: Node,
        _target: Node,
        stats: WeaponLevelStats,
        _level: number,
        _parent: Node
    ): void {
        WeaponSFXManager.playAttackOneShot(this.type);

        const center = owner.worldPosition.clone();
        center.y = 0;

        const waveRadius = (stats['waveRadius'] ?? 4) as number;
        const slowPercent = Math.max(0, Math.min(0.85, (stats['slowPercent'] ?? 0.3) as number));
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

        // 旋风斩视觉效果
        const effectParent = owner.parent ?? owner;
        EffectFactory.createGlitchInterference(effectParent, center, waveRadius);
    }
}
