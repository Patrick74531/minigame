import { Node, Vec3, Color, Quat, tween } from 'cc';
import { _decorator, Component } from 'cc';
import { WeaponBehavior } from '../WeaponBehavior';
import { WeaponType, WeaponLevelStats } from '../WeaponTypes';
import { WeaponVFX } from '../WeaponVFX';
import { ScreenShake } from '../vfx/ScreenShake';
import { Bullet } from '../../combat/Bullet';
import { GameConfig } from '../../../data/GameConfig';

const { ccclass } = _decorator;

/**
 * 断桩机加农炮 — 螺纹钢激波 (性能优化版)
 *
 * 核心优化：
 * - 单 mesh 长条弹体（无子节点发光层，无 MotionStreak）
 * - 材质缓存 + GPU Instancing
 * - 命中时：屏幕震动 + 池化冲击波环 + 池化碎片（上限8个）
 * - 加农炮射速低，是唯一适合做较重 VFX 的武器
 *
 * Lv.1: 灰色长条弹体 + 旋转
 * Lv.2: 弹体变大 + 枪口闪光
 * Lv.3: 命中冲击波环 + 碎片 + 轻微屏幕震动
 * Lv.4: 更大爆炸 + 地面灼痕 + 中等屏幕震动
 * Lv.5: 巨型弹体 + 强烈屏幕震动 + 满碎片
 */
export class CannonBehavior extends WeaponBehavior {
    public readonly type = WeaponType.CANNON;

    private static readonly COLORS: Color[] = [
        new Color(150, 150, 160, 255),
        new Color(170, 160, 150, 255),
        new Color(200, 140, 100, 255),
        new Color(220, 120, 60, 255),
        new Color(255, 100, 40, 255),
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
        const color = CannonBehavior.COLORS[idx];

        // 单 mesh 长条弹体
        const w = 0.12 + level * 0.03;
        const len = 0.45 + level * 0.1;
        const node = new Node('Cannon_Proj');
        node.layer = 1 << 0;
        WeaponVFX.addBoxMesh(node, w, w, len, WeaponVFX.getUnlitMat(color));
        parent.addChild(node);
        node.setPosition(spawnPos);

        const bullet = node.addComponent(Bullet);
        bullet.damage = stats.damage;
        bullet.speed = stats.projectileSpeed;
        bullet.explosionRadius = (stats['explosionRadius'] ?? 1.5) as number;
        bullet.setTarget(target);

        // 自转 + 命中爆炸
        const spinner = node.addComponent(CannonSpin);
        spinner.spinSpeed = (stats['spinSpeed'] ?? 15) as number;
        spinner.level = level;
        spinner.parentRef = parent;
        spinner.explosionRadius = bullet.explosionRadius;

        // 枪口闪光 (Lv.2+)
        if (level >= 2) {
            WeaponVFX.createMuzzleFlash(parent, spawnPos, color, 0.2 + level * 0.06);
        }

        // 入场缩放
        const baseScale = 0.8 + level * 0.1;
        node.setScale(0.3, 0.3, 0.3);
        tween(node)
            .to(0.12, { scale: new Vec3(baseScale, baseScale, baseScale) }, { easing: 'backOut' })
            .start();
    }
}

/**
 * 自转 + 命中爆炸VFX + 屏幕震动
 */
@ccclass('CannonSpin')
class CannonSpin extends Component {
    public spinSpeed: number = 15;
    public level: number = 1;
    public parentRef: Node | null = null;
    public explosionRadius: number = 1.5;
    private _prevAlive: boolean = true;

    protected update(dt: number): void {
        // 旋转
        const rot = this.node.rotation.clone();
        const delta = new Quat();
        Quat.fromAxisAngle(delta, Vec3.FORWARD, this.spinSpeed * dt);
        Quat.multiply(rot, rot, delta);
        this.node.setRotation(rot);

        // 检测弹体消失（命中） → 爆炸VFX
        const bullet = this.node.getComponent(Bullet);
        if (!bullet && this._prevAlive && this.parentRef) {
            this.spawnExplosionVFX();
            this._prevAlive = false;
        }
        if (bullet) {
            this._prevAlive = true;
        }
    }

    private spawnExplosionVFX(): void {
        if (!this.parentRef) return;
        const pos = this.node.position.clone();

        // 冲击波环（池化）
        const ringColor = new Color(255, 150, 50, 200);
        WeaponVFX.createShockRing(this.parentRef, pos, this.explosionRadius, ringColor, 0.4);

        // 碎片（池化，硬上限 8 个）
        const debrisCount = 3 + this.level * 2;
        const debrisColor = new Color(200, 150, 100, 255);
        WeaponVFX.createDebris(
            this.parentRef,
            pos,
            debrisCount,
            debrisColor,
            2 + this.level * 0.5,
            0.08 + this.level * 0.02
        );

        // 屏幕震动 (Lv.3+，加农炮射速低所以可以做)
        if (this.level >= 3) {
            const shakeIntensity = 0.15 + this.level * 0.08;
            const shakeDuration = 0.1 + this.level * 0.03;
            ScreenShake.shake(shakeIntensity, shakeDuration);
        }

        // 地面灼痕 (Lv.4+，池化)
        if (this.level >= 4) {
            const burnColor = new Color(100, 60, 30, 120);
            WeaponVFX.createGroundBurn(
                this.parentRef,
                pos,
                this.explosionRadius * 0.8,
                burnColor,
                1.0 + this.level * 0.2
            );
        }
    }
}
