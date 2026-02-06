import { Node, Color } from 'cc';
import { WeaponBehavior } from '../WeaponBehavior';
import { WeaponType, WeaponLevelStats } from '../WeaponTypes';
import { WeaponVFX } from '../WeaponVFX';
import { Bullet } from '../../combat/Bullet';
import { GameConfig } from '../../../data/GameConfig';

/**
 * 寡妇制造者 — 炽热曳光机枪 (性能优化版)
 *
 * 核心优化：
 * - 用 Billboard 扁平面片代替 3D 方块，拉长 = 视觉拖尾
 * - 去掉 MotionStreak（大量使用时性能开销大）
 * - 材质缓存 + GPU Instancing（100 发子弹只需 1 次 DrawCall）
 * - 枪口闪光用对象池，不 new/destroy
 *
 * Lv.1: 单发橙色长条弹
 * Lv.2: 弹体变亮变长（橙→黄）
 * Lv.3: 2 发散射 + 枪口闪光
 * Lv.4: 3 发散射，弹体更粗更亮
 * Lv.5: 4 发扇形弹幕，白热弹头 + 大枪口闪光
 */
export class MachineGunBehavior extends WeaponBehavior {
    public readonly type = WeaponType.MACHINE_GUN;

    private static readonly BULLETS_PER_LEVEL = [1, 1, 2, 3, 4];
    // 弹体颜色 (橙 → 黄 → 白热)
    private static readonly COLORS: Color[] = [
        new Color(255, 100, 0, 255),
        new Color(255, 150, 30, 255),
        new Color(255, 200, 60, 255),
        new Color(255, 230, 100, 255),
        new Color(255, 250, 200, 255),
    ];

    public fire(
        owner: Node,
        target: Node,
        stats: WeaponLevelStats,
        level: number,
        parent: Node
    ): void {
        const spawnPos = owner.position.clone();
        spawnPos.y += GameConfig.PHYSICS.PROJECTILE_SPAWN_OFFSET_Y;

        const idx = Math.min(level - 1, 4);
        const bulletCount = MachineGunBehavior.BULLETS_PER_LEVEL[idx];
        const spread = (stats['spread'] ?? 3) as number;
        const color = MachineGunBehavior.COLORS[idx];

        // 枪口闪光 (Lv.3+，池化节点)
        if (level >= 3) {
            WeaponVFX.createMuzzleFlash(parent, spawnPos, color, 0.15 + level * 0.05);
        }

        // 弹体尺寸：宽度 + 长度（长度 = 视觉拖尾）
        const bulletW = 0.06 + level * 0.015;
        const bulletL = 0.3 + level * 0.12; // 越高级越长 = 拖尾越长

        for (let i = 0; i < bulletCount; i++) {
            const angleOffset =
                bulletCount === 1
                    ? ((Math.random() - 0.5) * spread * Math.PI) / 180
                    : ((i / (bulletCount - 1) - 0.5) * spread * Math.PI) / 180 +
                      ((Math.random() - 0.5) * 1.5 * Math.PI) / 180;

            // Billboard 扁平面片子弹（无 MotionStreak）
            const node = WeaponVFX.createBillboardBullet(bulletW, bulletL, color);
            parent.addChild(node);
            node.setPosition(spawnPos);

            const bullet = node.addComponent(Bullet);
            bullet.damage = Math.ceil(stats.damage / bulletCount);
            bullet.speed = stats.projectileSpeed;
            bullet.setTarget(target);

            // 散射角度偏移
            const vel = bullet.velocity;
            const cos = Math.cos(angleOffset);
            const sin = Math.sin(angleOffset);
            const vx = vel.x * cos - vel.z * sin;
            const vz = vel.x * sin + vel.z * cos;
            vel.set(vx, vel.y, vz);
        }
    }
}
