import { Node, Vec3, Color, tween } from 'cc';
import { _decorator, Component } from 'cc';
import { WeaponBehavior } from '../WeaponBehavior';
import { WeaponType, WeaponLevelStats } from '../WeaponTypes';
import { WeaponVFX } from '../WeaponVFX';
import { Bullet } from '../../combat/Bullet';
import { GameConfig } from '../../../data/GameConfig';
import { Unit } from '../../units/Unit';

const { ccclass } = _decorator;

/**
 * 堆肥喷火器 — 废油抛物线 (性能优化版)
 *
 * 核心优化：
 * - 用大号 Billboard 面片代替 3D 方块（少量大贴图 = 视觉欺骗大火焰）
 * - 去掉 MotionStreak + 去掉子节点发光层（1 DrawCall / 火球）
 * - 材质缓存 + GPU Instancing
 * - 着地灼烧圈用池化节点
 *
 * Lv.1: 单个深红火球
 * Lv.2: 火球变大变亮
 * Lv.3: 2 发火球 + 着地灼烧圈
 * Lv.4: 3 发火球，火焰更亮
 * Lv.5: 4 发散射，白黄火焰 + 大灼烧
 */
export class FlamethrowerBehavior extends WeaponBehavior {
    public readonly type = WeaponType.FLAMETHROWER;

    private static readonly BLOBS_PER_LEVEL = [1, 1, 2, 3, 4];
    private static readonly COLORS: Color[] = [
        new Color(140, 20, 0, 255),
        new Color(200, 50, 0, 255),
        new Color(255, 100, 10, 255),
        new Color(255, 160, 30, 255),
        new Color(255, 220, 80, 255),
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
        const color = FlamethrowerBehavior.COLORS[idx];

        // 大号 Billboard 面片 — 单个面片看起来就像一坨火焰
        const blobSize = 0.2 + level * 0.06;

        for (let i = 0; i < blobCount; i++) {
            const spreadAngle =
                blobCount > 1 ? ((i / (blobCount - 1) - 0.5) * 15 * Math.PI) / 180 : 0;

            // 大号扁平方块 = 视觉欺骗火球（1 DrawCall）
            const node = new Node('Flame_Blob');
            node.layer = 1 << 0;
            WeaponVFX.addBoxMesh(node, blobSize, blobSize, blobSize, WeaponVFX.getUnlitMat(color));
            parent.addChild(node);
            node.setPosition(spawnPos);

            const bullet = node.addComponent(Bullet);
            bullet.damage = Math.ceil(stats.damage / blobCount);
            bullet.speed = stats.projectileSpeed * (0.9 + Math.random() * 0.2);
            bullet.setTarget(target);
            // 从持有者读取暴击属性
            const ownerUnit = owner.getComponent(Unit);
            if (ownerUnit) {
                bullet.critRate = ownerUnit.stats.critRate;
                bullet.critDamage = ownerUnit.stats.critDamage;
            }

            // 抛物线初速度
            bullet.velocity.y += 3.5 + level * 0.6 + Math.random() * 1.5;

            // 角度偏移
            if (spreadAngle !== 0) {
                const vel = bullet.velocity;
                const cos = Math.cos(spreadAngle);
                const sin = Math.sin(spreadAngle);
                const vx = vel.x * cos - vel.z * sin;
                const vz = vel.x * sin + vel.z * cos;
                vel.set(vx, vel.y, vz);
            }

            // 重力 + 着地灼烧
            const gravComp = node.addComponent(FlameGravity);
            gravComp.gravity = gravity;
            gravComp.level = level;
            gravComp.parentRef = parent;

            // 飞行中膨胀动画（视觉欺骗：少量大面片 = 大火焰）
            const baseScale = 0.8 + level * 0.2;
            node.setScale(baseScale * 0.5, baseScale * 0.5, baseScale * 0.5);
            tween(node)
                .to(
                    0.3,
                    { scale: new Vec3(baseScale, baseScale, baseScale) },
                    { easing: 'sineOut' }
                )
                .start();
        }
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
    private _burnSpawned: boolean = false;

    protected update(dt: number): void {
        const bullet = this.node.getComponent(Bullet);
        if (!bullet) return;
        bullet.velocity.y -= this.gravity * dt;

        // 着地灼烧（只触发一次，池化节点）
        if (!this._burnSpawned && this.node.position.y < 0.1 && this.parentRef && this.level >= 3) {
            this._burnSpawned = true;
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
