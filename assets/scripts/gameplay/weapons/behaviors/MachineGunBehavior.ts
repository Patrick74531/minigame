import { Node, Vec3, Color, MotionStreak } from 'cc';
import { WeaponBehavior } from '../WeaponBehavior';
import { WeaponType, WeaponLevelStats } from '../WeaponTypes';
import { WeaponVFX } from '../WeaponVFX';
import { Bullet } from '../../combat/Bullet';
import { GameConfig } from '../../../data/GameConfig';

/**
 * 寡妇制造者 — 炽热曳光机枪
 *
 * Lv.1: 单发橙色曳光弹 + 短拖尾
 * Lv.2: 拖尾变长，弹头变亮（橙→黄）
 * Lv.3: 每次射击 2 发散射，枪口闪光
 * Lv.4: 3 发散射，拖尾更粗更亮，弹头发光
 * Lv.5: 4 发扇形弹幕，白热弹头 + 长拖尾 + 大枪口闪光
 */
export class MachineGunBehavior extends WeaponBehavior {
    public readonly type = WeaponType.MACHINE_GUN;

    // 每级同时射出的子弹数
    private static readonly BULLETS_PER_LEVEL = [1, 1, 2, 3, 4];
    // 弹头颜色 (橙 → 黄 → 白热)
    private static readonly HEAD_COLORS: Color[] = [
        new Color(255, 100, 0, 255),
        new Color(255, 150, 30, 255),
        new Color(255, 200, 60, 255),
        new Color(255, 230, 100, 255),
        new Color(255, 250, 200, 255),
    ];
    // 拖尾颜色
    private static readonly TRAIL_COLORS: Color[] = [
        new Color(255, 69, 0, 255),
        new Color(255, 100, 20, 255),
        new Color(255, 140, 40, 255),
        new Color(255, 180, 60, 255),
        new Color(255, 220, 100, 255),
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

        // 枪口闪光 (Lv.3+)
        if (level >= 3) {
            const flashSize = 0.15 + level * 0.05;
            const flashColor = MachineGunBehavior.HEAD_COLORS[idx].clone();
            flashColor.a = 200;
            WeaponVFX.createMuzzleFlash(parent, spawnPos, flashColor, flashSize);
        }

        // 发射多发子弹
        for (let i = 0; i < bulletCount; i++) {
            const angleOffset =
                bulletCount === 1
                    ? ((Math.random() - 0.5) * spread * Math.PI) / 180
                    : ((i / (bulletCount - 1) - 0.5) * spread * Math.PI) / 180 +
                      ((Math.random() - 0.5) * 1.5 * Math.PI) / 180;

            const node = this.createBulletNode(level, idx);
            parent.addChild(node);
            node.setPosition(spawnPos);

            const bullet = node.addComponent(Bullet);
            bullet.damage = Math.ceil(stats.damage / bulletCount);
            bullet.speed = stats.projectileSpeed;
            bullet.setTarget(target);

            // 施加散射角度偏移
            const vel = bullet.velocity;
            const cos = Math.cos(angleOffset);
            const sin = Math.sin(angleOffset);
            const x = vel.x * cos - vel.z * sin;
            const z = vel.x * sin + vel.z * cos;
            vel.set(x, vel.y, z);
        }
    }

    private createBulletNode(level: number, idx: number): Node {
        const node = new Node('MG_Bullet');
        node.layer = 1 << 0;

        // 弹头大小随等级增长
        const headSize = 0.08 + level * 0.025;
        const headLen = headSize * 2.5;
        const headColor = MachineGunBehavior.HEAD_COLORS[idx];
        WeaponVFX.addBoxMesh(
            node,
            headSize,
            headSize,
            headLen,
            WeaponVFX.createUnlitMat(headColor)
        );

        // 发光外壳 (Lv.2+)
        if (level >= 2) {
            const glowNode = new Node('Glow');
            glowNode.layer = 1 << 0;
            node.addChild(glowNode);
            const glowSize = headSize * 1.8;
            const glowColor = headColor.clone();
            glowColor.a = 80 + level * 20;
            WeaponVFX.addBoxMesh(
                glowNode,
                glowSize,
                glowSize,
                headLen * 1.2,
                WeaponVFX.createGlowMat(glowColor)
            );
        }

        // 拖尾 — 等级越高越长越粗
        const streak = node.addComponent(MotionStreak);
        streak.fadeTime = 0.08 + level * 0.035;
        streak.minSeg = 1;
        streak.stroke = 0.1 + level * 0.05;
        streak.color = MachineGunBehavior.TRAIL_COLORS[idx];
        streak.fastMode = true;

        return node;
    }
}
