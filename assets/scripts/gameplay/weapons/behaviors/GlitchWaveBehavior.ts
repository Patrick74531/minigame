import { Node, Vec3, Color, MeshRenderer, primitives, utils, Material, tween } from 'cc';
import { WeaponBehavior } from '../WeaponBehavior';
import { WeaponType, WeaponLevelStats } from '../WeaponTypes';
import { EventManager } from '../../../core/managers/EventManager';
import { ServiceRegistry } from '../../../core/managers/ServiceRegistry';
import { GameEvents } from '../../../data/GameEvents';
import { GameConfig } from '../../../data/GameConfig';

/**
 * 模拟回音 — 故障扫描线能量波
 * 从英雄位置释放一圈快速扩大的能量环，
 * 对范围内所有敌人造成 AOE 伤害。
 *
 * 升级效果：伤害↑、波半径↑、冷却↓
 */
export class GlitchWaveBehavior extends WeaponBehavior {
    public readonly type = WeaponType.GLITCH_WAVE;

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

        // 发射 AOE 伤害事件
        const eventManager = ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
        eventManager.emit(GameEvents.APPLY_AOE_EFFECT, {
            center,
            radius: waveRadius,
            damage: stats.damage,
            slowPercent: 0,
            slowDuration: 0,
        });

        // 视觉：扩散环
        this.createWaveVisual(parent, center, waveRadius, level);
    }

    private createWaveVisual(parent: Node, center: Vec3, maxRadius: number, level: number): void {
        const node = new Node('GlitchWave_VFX');
        node.layer = 1 << 0;
        parent.addChild(node);
        node.setPosition(center);

        // 扁平圆柱模拟扩散环
        const renderer = node.addComponent(MeshRenderer);
        renderer.mesh = utils.MeshUtils.createMesh(
            primitives.box({ width: 1, height: 0.05, length: 1 })
        );
        const mat = new Material();
        mat.initialize({ effectName: 'builtin-unlit' });
        // 青色/白色 — 电子故障感
        const g = Math.min(255, 200 + level * 10);
        mat.setProperty('mainColor', new Color(0, g, 255, 200));
        renderer.material = mat;

        // 从小到大扩散动画
        node.setScale(0.1, 1, 0.1);
        const finalScale = maxRadius * 2;
        tween(node)
            .to(0.35, { scale: new Vec3(finalScale, 0.5, finalScale) }, { easing: 'expoOut' })
            .call(() => {
                node.destroy();
            })
            .start();
    }
}
