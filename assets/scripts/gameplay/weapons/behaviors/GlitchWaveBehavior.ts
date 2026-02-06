import { Node, Color } from 'cc';
import { WeaponBehavior } from '../WeaponBehavior';
import { WeaponType, WeaponLevelStats } from '../WeaponTypes';
import { WeaponVFX } from '../WeaponVFX';
import { GlitchOverlay } from '../vfx/GlitchOverlay';
import { ScreenShake } from '../vfx/ScreenShake';
import { EventManager } from '../../../core/managers/EventManager';
import { ServiceRegistry } from '../../../core/managers/ServiceRegistry';
import { GameEvents } from '../../../data/GameEvents';

/**
 * 模拟回音 — 故障扫描线能量波 (性能优化版)
 *
 * 核心优化：
 * - 用 UI 层扫描线覆盖代替多层 3D 扩散环（零 DrawCall 开销）
 * - 3D 层只保留 1 个池化冲击波环（视觉锚点）
 * - 去掉碎片生成、脉冲球等重开销 VFX
 * - 屏幕震动 + UI 故障闪屏 = 视觉冲击力更强，性能更低
 *
 * Lv.1: 1 个扩散环 + 轻微 UI 闪屏
 * Lv.2: 扩散环 + 中等 UI 闪屏 + 中心闪光
 * Lv.3: 扩散环 + 强 UI 闪屏 + 轻微屏幕震动
 * Lv.4: 扩散环 + 强 UI 闪屏 + 中等屏幕震动
 * Lv.5: 扩散环 + 超强 UI 故障 + 强屏幕震动 + 地面印记
 */
export class GlitchWaveBehavior extends WeaponBehavior {
    public readonly type = WeaponType.GLITCH_WAVE;

    private static _uiCanvas: Node | null = null;

    /** 绑定 UI 画布（在 UIBootstrap 中调用一次） */
    public static bindUICanvas(uiCanvas: Node): void {
        this._uiCanvas = uiCanvas;
    }

    private static readonly COLORS: Color[] = [
        new Color(0, 180, 255, 255),
        new Color(30, 210, 255, 255),
        new Color(80, 230, 255, 255),
        new Color(150, 245, 255, 255),
        new Color(220, 255, 255, 255),
    ];

    public fire(
        owner: Node,
        _target: Node,
        stats: WeaponLevelStats,
        level: number,
        parent: Node
    ): void {
        const center = owner.position.clone();
        center.y += 0.5;

        const waveRadius = (stats['waveRadius'] ?? 4) as number;
        const idx = Math.min(level - 1, 4);
        const color = GlitchWaveBehavior.COLORS[idx];

        // AOE 伤害事件
        const eventManager =
            ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
        eventManager.emit(GameEvents.APPLY_AOE_EFFECT, {
            center,
            radius: waveRadius,
            damage: stats.damage,
            slowPercent: 0,
            slowDuration: 0,
        });

        // === 3D 层：只需 1 个池化冲击波环作为视觉锚点 ===
        const ringColor = color.clone();
        ringColor.a = 180;
        WeaponVFX.createShockRing(parent, center, waveRadius, ringColor, 0.35, 0.06 + level * 0.01);

        // 中心闪光 (Lv.2+)
        if (level >= 2) {
            WeaponVFX.createMuzzleFlash(parent, center, color, 0.3 + level * 0.1);
        }

        // 地面印记 (Lv.5)
        if (level >= 5) {
            const burnColor = new Color(0, 150, 200, 100);
            WeaponVFX.createGroundBurn(parent, center, waveRadius * 0.6, burnColor, 1.0);
        }

        // === UI 层：故障扫描线覆盖（零 3D 开销） ===
        if (GlitchWaveBehavior._uiCanvas) {
            const intensity = 0.3 + level * 0.14; // Lv.1=0.44, Lv.5=1.0
            const duration = 0.25 + level * 0.06;
            GlitchOverlay.flash(
                GlitchWaveBehavior._uiCanvas,
                duration,
                Math.min(intensity, 1),
                color
            );
        }

        // === 屏幕震动 (Lv.3+) ===
        if (level >= 3) {
            ScreenShake.shake(0.1 + level * 0.06, 0.12 + level * 0.03);
        }
    }
}
