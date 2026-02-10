import { Node, Color, Vec3 } from 'cc';
import { WeaponBehavior } from '../WeaponBehavior';
import { WeaponType, WeaponLevelStats } from '../WeaponTypes';
import { WeaponVFX } from '../WeaponVFX';
import { GlitchOverlay } from '../vfx/GlitchOverlay';
import { ScreenShake } from '../vfx/ScreenShake';
import { EventManager } from '../../../core/managers/EventManager';
import { ServiceRegistry } from '../../../core/managers/ServiceRegistry';
import { GameEvents } from '../../../data/GameEvents';

/**
 * 模拟回音 — 信号干扰波 (性能优化版)
 *
 * 核心优化：
 * - 用 UI 层干扰扫描覆盖代替大面积纯色块
 * - 3D 层使用短促干扰束替代大方块冲击波
 * - 保留低开销震屏与中心闪光
 * - 屏幕震动 + UI 故障闪屏 = 视觉冲击力更强，性能更低
 *
 * 机制定位：低伤害范围控场（主打减速）
 */
export class GlitchWaveBehavior extends WeaponBehavior {
    public readonly type = WeaponType.GLITCH_WAVE;

    private static _uiCanvas: Node | null = null;

    /** 绑定 UI 画布（在 UIBootstrap 中调用一次） */
    public static bindUICanvas(uiCanvas: Node): void {
        this._uiCanvas = uiCanvas;
    }

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
        parent: Node
    ): void {
        const center = owner.position.clone();
        center.y += 0.5;

        const waveRadius = (stats['waveRadius'] ?? 4) as number;
        const waveSpeed = (stats['waveSpeed'] ?? 8) as number;
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


        // === 3D 层：模拟回音主特效 ===
        // 核心旋转粒子效果 (Lv.1+)
        // 改为挂载在 owner (英雄) 下，跟随移动
        // y=0.1 贴近脚底
        // 视觉大小随等级提升 (Lv1=1.0, Lv5=1.6)
        const levelScale = 1.0 + (level - 1) * 0.15;
        WeaponVFX.createEchoWave(owner, new Vec3(0, 0.1, 0), {
            scale: waveRadius * 0.8 * levelScale, 
            color: color,
        });

        // === 3D 层：干扰束脉冲（次级细节） ===
        this.spawnInterferenceBurst(parent, center, waveRadius, waveSpeed, color, level);

        // 中心闪光 (Lv.2+)
        if (level >= 2) {
            WeaponVFX.createMuzzleFlash(parent, center, color, 0.22 + level * 0.06);
        }

        // === UI 层：故障扫描线覆盖 ===
        if (GlitchWaveBehavior._uiCanvas) {
            const intensity = Math.min(1, 0.36 + level * 0.11); // Lv.1=0.47, Lv.5=0.91
            const duration = 0.18 + level * 0.05;
            GlitchOverlay.flash(GlitchWaveBehavior._uiCanvas, duration, intensity, color);
        }

        // === 屏幕震动 (Lv.3+) ===
        if (level >= 3) {
            ScreenShake.shake(0.08 + level * 0.045, 0.1 + level * 0.025);
        }
    }

    /** 生成短促多束干扰线，做出“信号撕裂”感 */
    private spawnInterferenceBurst(
        parent: Node,
        center: Vec3,
        radius: number,
        waveSpeed: number,
        color: Color,
        level: number
    ): void {
        const beamCount = 3 + level;
        const duration = Math.max(0.06, 0.22 - waveSpeed * 0.01);
        const widthBase = 0.1 + level * 0.018;

        for (let i = 0; i < beamCount; i++) {
            const angle = (Math.PI * 2 * i) / beamCount + (Math.random() - 0.5) * 0.65;
            const innerR = Math.random() * radius * 0.25;
            const outerR = radius * (0.72 + Math.random() * 0.35);

            const start = new Vec3(
                center.x + Math.cos(angle) * innerR,
                center.y,
                center.z + Math.sin(angle) * innerR
            );
            const end = new Vec3(
                center.x + Math.cos(angle) * outerR,
                center.y,
                center.z + Math.sin(angle) * outerR
            );

            const beamColor = new Color(
                Math.min(255, color.r + 25),
                Math.min(255, color.g + 20),
                Math.max(0, color.b - 10),
                220
            );
            const coreColor = new Color(235, 255, 255, 235);

            WeaponVFX.createCodeBeam(parent, start, end, {
                width: widthBase + Math.random() * 0.04,
                duration: duration + Math.random() * 0.06,
                beamColor,
                coreColor,
                intensity: 1.8 + level * 0.35,
            });
        }
    }
}
