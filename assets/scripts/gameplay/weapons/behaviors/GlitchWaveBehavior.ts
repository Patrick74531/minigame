import { Node, Vec3, Color, tween } from 'cc';
import { WeaponBehavior } from '../WeaponBehavior';
import { WeaponType, WeaponLevelStats } from '../WeaponTypes';
import { WeaponVFX } from '../WeaponVFX';
import { EventManager } from '../../../core/managers/EventManager';
import { ServiceRegistry } from '../../../core/managers/ServiceRegistry';
import { GameEvents } from '../../../data/GameEvents';

/**
 * 模拟回音 — 故障扫描线能量波
 *
 * Lv.1: 单个青色扩散环
 * Lv.2: 双层环（外环 + 内环），颜色更亮
 * Lv.3: 三层环 + 中心爆闪 + 碎片
 * Lv.4: 环变宽变亮，碎片更多，地面印记
 * Lv.5: 四层渐变环 + 大量碎片 + 中心脉冲球 + 地面灼痕
 */
export class GlitchWaveBehavior extends WeaponBehavior {
    public readonly type = WeaponType.GLITCH_WAVE;

    // 每级环的数量
    private static readonly RING_COUNT = [1, 2, 3, 3, 4];
    // 环颜色（从深青到亮白）
    private static readonly RING_COLORS: Color[] = [
        new Color(0, 180, 255, 180),
        new Color(30, 210, 255, 200),
        new Color(80, 230, 255, 220),
        new Color(150, 245, 255, 235),
        new Color(220, 255, 255, 250),
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

        // 发射 AOE 伤害事件
        const eventManager =
            ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
        eventManager.emit(GameEvents.APPLY_AOE_EFFECT, {
            center,
            radius: waveRadius,
            damage: stats.damage,
            slowPercent: 0,
            slowDuration: 0,
        });

        // 多层扩散环
        const ringCount = GlitchWaveBehavior.RING_COUNT[idx];
        for (let i = 0; i < ringCount; i++) {
            const delay = i * 0.06;
            const radiusMult = 1 - i * 0.15; // 内环更小
            const ringColor = GlitchWaveBehavior.RING_COLORS[Math.min(idx + i, 4)].clone();
            ringColor.a = Math.max(100, ringColor.a - i * 30);
            const ringHeight = 0.06 + level * 0.015 - i * 0.01;
            const duration = 0.3 + level * 0.04;

            // 延迟生成每层环
            if (delay > 0) {
                const capturedRadius = waveRadius * radiusMult;
                const capturedColor = ringColor;
                const capturedHeight = Math.max(0.03, ringHeight);
                const capturedDuration = duration;
                const capturedCenter = center.clone();
                tween(parent)
                    .delay(delay)
                    .call(() => {
                        WeaponVFX.createShockRing(
                            parent,
                            capturedCenter,
                            capturedRadius,
                            capturedColor,
                            capturedDuration,
                            capturedHeight
                        );
                    })
                    .start();
            } else {
                WeaponVFX.createShockRing(
                    parent,
                    center,
                    waveRadius * radiusMult,
                    ringColor,
                    duration,
                    Math.max(0.03, ringHeight)
                );
            }
        }

        // 中心爆闪 (Lv.2+)
        if (level >= 2) {
            const flashSize = 0.3 + level * 0.1;
            const flashColor = GlitchWaveBehavior.RING_COLORS[idx].clone();
            flashColor.a = 220;
            WeaponVFX.createMuzzleFlash(parent, center, flashColor, flashSize);
        }

        // 碎片粒子 (Lv.3+)
        if (level >= 3) {
            const debrisCount = 4 + level * 2;
            const debrisColor = new Color(100, 220, 255, 255);
            WeaponVFX.createDebris(
                parent,
                center,
                debrisCount,
                debrisColor,
                3 + level * 0.5,
                0.06 + level * 0.015
            );
        }

        // 中心脉冲球 (Lv.4+)
        if (level >= 4) {
            this.createPulseSphere(parent, center, level);
        }

        // 地面印记 (Lv.5)
        if (level >= 5) {
            const burnColor = new Color(0, 150, 200, 100);
            WeaponVFX.createGroundBurn(parent, center, waveRadius * 0.7, burnColor, 1.2);
        }
    }

    private createPulseSphere(parent: Node, center: Vec3, level: number): void {
        const node = new Node('PulseSphere');
        node.layer = 1 << 0;
        parent.addChild(node);
        node.setPosition(center);

        const size = 0.4 + level * 0.1;
        const color = new Color(150, 240, 255, 150);
        WeaponVFX.addBoxMesh(node, size, size, size, WeaponVFX.createGlowMat(color));

        // 快速膨胀后消失
        node.setScale(0.2, 0.2, 0.2);
        const peak = size * 3;
        tween(node)
            .to(0.1, { scale: new Vec3(peak, peak, peak) }, { easing: 'expoOut' })
            .to(0.2, { scale: new Vec3(0, 0, 0) }, { easing: 'quadIn' })
            .call(() => node.destroy())
            .start();
    }
}
