import { Node, Vec3, Color, MotionStreak, tween } from 'cc';
import { _decorator, Component } from 'cc';
import { WeaponBehavior } from '../WeaponBehavior';
import { WeaponType, WeaponLevelStats } from '../WeaponTypes';
import { WeaponVFX } from '../WeaponVFX';
import { Bullet } from '../../combat/Bullet';
import { GameConfig } from '../../../data/GameConfig';

const { ccclass } = _decorator;

/**
 * 堆肥喷火器 — 废油抛物线
 *
 * Lv.1: 单个深红火球 + 短烟尾
 * Lv.2: 火球变大变亮，烟尾变长
 * Lv.3: 每次射 2 发火球，着地后产生灼烧圈
 * Lv.4: 3 发火球，火焰更亮（橙色），灼烧圈更大
 * Lv.5: 4 发散射火球，白黄火焰 + 烟雾拖尾 + 大范围灼烧
 */
export class FlamethrowerBehavior extends WeaponBehavior {
    public readonly type = WeaponType.FLAMETHROWER;

    private static readonly BLOBS_PER_LEVEL = [1, 1, 2, 3, 4];
    private static readonly CORE_COLORS: Color[] = [
        new Color(140, 20, 0, 255),
        new Color(200, 50, 0, 255),
        new Color(255, 100, 10, 255),
        new Color(255, 160, 30, 255),
        new Color(255, 220, 80, 255),
    ];
    private static readonly TRAIL_COLORS: Color[] = [
        new Color(80, 10, 0, 200),
        new Color(120, 30, 0, 210),
        new Color(180, 60, 0, 220),
        new Color(220, 100, 10, 230),
        new Color(255, 160, 40, 240),
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
        const blobCount = FlamethrowerBehavior.BLOBS_PER_LEVEL[idx];
        const gravity = (stats['gravity'] ?? 8) as number;

        for (let i = 0; i < blobCount; i++) {
            const spreadAngle =
                blobCount > 1 ? ((i / (blobCount - 1) - 0.5) * 15 * Math.PI) / 180 : 0;

            const node = this.createFireBlobNode(level, idx);
            parent.addChild(node);
            node.setPosition(spawnPos);

            const bullet = node.addComponent(Bullet);
            bullet.damage = Math.ceil(stats.damage / blobCount);
            bullet.speed = stats.projectileSpeed * (0.9 + Math.random() * 0.2);
            bullet.setTarget(target);

            // 抛物线初速度
            bullet.velocity.y += 3.5 + level * 0.6 + Math.random() * 1.5;

            // 角度偏移
            if (spreadAngle !== 0) {
                const vel = bullet.velocity;
                const cos = Math.cos(spreadAngle);
                const sin = Math.sin(spreadAngle);
                const x = vel.x * cos - vel.z * sin;
                const z = vel.x * sin + vel.z * cos;
                vel.set(x, vel.y, z);
            }

            // 重力
            const gravComp = node.addComponent(FlameGravity);
            gravComp.gravity = gravity;
            gravComp.level = level;
            gravComp.parentRef = parent;

            // 火球缩放动画（飞行中膨胀）
            const baseScale = 0.7 + level * 0.15;
            node.setScale(baseScale * 0.6, baseScale * 0.6, baseScale * 0.6);
            tween(node)
                .to(
                    0.3,
                    { scale: new Vec3(baseScale, baseScale, baseScale) },
                    { easing: 'sineOut' }
                )
                .start();
        }
    }

    private createFireBlobNode(level: number, idx: number): Node {
        const node = new Node('Flame_Blob');
        node.layer = 1 << 0;

        // 核心火球
        const coreSize = 0.15 + level * 0.04;
        const coreColor = FlamethrowerBehavior.CORE_COLORS[idx];
        WeaponVFX.addBoxMesh(
            node,
            coreSize,
            coreSize,
            coreSize,
            WeaponVFX.createUnlitMat(coreColor)
        );

        // 外发光层
        const glowNode = new Node('FireGlow');
        glowNode.layer = 1 << 0;
        node.addChild(glowNode);
        const glowSize = coreSize * 2;
        const glowColor = coreColor.clone();
        glowColor.a = 60 + level * 15;
        WeaponVFX.addBoxMesh(
            glowNode,
            glowSize,
            glowSize,
            glowSize,
            WeaponVFX.createGlowMat(glowColor)
        );

        // 烟雾拖尾
        const streak = node.addComponent(MotionStreak);
        streak.fadeTime = 0.15 + level * 0.05;
        streak.minSeg = 1;
        streak.stroke = 0.15 + level * 0.06;
        streak.color = FlamethrowerBehavior.TRAIL_COLORS[idx];
        streak.fastMode = true;

        return node;
    }
}

/**
 * 重力 + 着地灼烧组件
 */
@ccclass('FlameGravity')
class FlameGravity extends Component {
    public gravity: number = 8;
    public level: number = 1;
    public parentRef: Node | null = null;

    protected update(dt: number): void {
        const bullet = this.node.getComponent(Bullet);
        if (!bullet) return;
        bullet.velocity.y -= this.gravity * dt;

        // 检测着地（Y < 0.1）→ 产生灼烧圈
        if (this.node.position.y < 0.1 && this.parentRef) {
            const pos = this.node.position.clone();
            pos.y = 0.05;
            const burnRadius = 0.5 + this.level * 0.25;
            const burnColor = new Color(
                Math.min(255, 200 + this.level * 10),
                Math.min(255, 50 + this.level * 20),
                0,
                150
            );
            WeaponVFX.createGroundBurn(
                this.parentRef,
                pos,
                burnRadius,
                burnColor,
                0.8 + this.level * 0.3
            );
        }
    }
}
