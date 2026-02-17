import { Node, Color, Vec3 } from 'cc';
import { WeaponBehavior } from '../WeaponBehavior';
import { WeaponType, WeaponLevelStats } from '../WeaponTypes';
import { WeaponVFX } from '../WeaponVFX';
import { EventManager } from '../../../core/managers/EventManager';
import { ServiceRegistry } from '../../../core/managers/ServiceRegistry';
import { GameEvents } from '../../../data/GameEvents';
import { GameConfig } from '../../../data/GameConfig';

/**
 * 模拟回音 — 信号干扰波
 * 视觉表现：仅保留脚下旋转光环（随等级放大）
 * 机制定位：低伤害范围控场（主打减速）
 */
export class GlitchWaveBehavior extends WeaponBehavior {
    public readonly type = WeaponType.GLITCH_WAVE;

    private static readonly COLORS: Color[] = [
        new Color(70, 210, 255, 255),
        new Color(90, 240, 255, 255),
        new Color(120, 255, 245, 255),
        new Color(170, 255, 235, 255),
        new Color(220, 255, 245, 255),
    ];

    public fire(
        owner: Node,
        _target: Node,
        stats: WeaponLevelStats,
        level: number,
        _parent: Node
    ): void {
        const center = owner.position.clone();
        center.y += 0.5;

        const waveRadius = (stats['waveRadius'] ?? 4) as number;
        const slowPercent = Math.max(0, Math.min(0.85, (stats['slowPercent'] ?? 0.3) as number));
        const slowDuration = Math.max(0.2, (stats['slowDuration'] ?? 1.8) as number);
        const idx = Math.min(level - 1, 4);
        const color = GlitchWaveBehavior.COLORS[idx];

        // AOE：低伤害 + 减速
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

        // 仅保留旋转光环：挂在英雄脚下并显著增大等级成长
        // Lv1 基础更大，Lv5 增幅更明显
        const levelScale = 1.0 + (level - 1) * 0.28;
        // 英雄根节点默认在离地约 HERO_Y 位置；按世界缩放换算到局部偏移，避免光环浮到腰部。
        const ownerWorldScaleY = Math.max(0.001, Math.abs(owner.worldScale.y));
        const haloGroundLiftWorld = 0.05;
        const haloLocalYOffset =
            (-GameConfig.PHYSICS.HERO_Y + haloGroundLiftWorld) / ownerWorldScaleY;
        WeaponVFX.createEchoWave(owner, new Vec3(0, haloLocalYOffset, 0), {
            scale: waveRadius * 1.4 * levelScale,
            color: color,
        });
    }
}
