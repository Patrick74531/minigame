import { Node, Vec3, Color, MotionStreak, Quat, tween } from 'cc';
import { _decorator, Component } from 'cc';
import { WeaponBehavior } from '../WeaponBehavior';
import { WeaponType, WeaponLevelStats } from '../WeaponTypes';
import { WeaponVFX } from '../WeaponVFX';
import { Bullet } from '../../combat/Bullet';
import { GameConfig } from '../../../data/GameConfig';

const { ccclass } = _decorator;

/**
 * 断桩机加农炮 — 螺纹钢激波
 *
 * Lv.1: 灰色长条弹体 + 烟尾 + 旋转
 * Lv.2: 弹体变大，烟尾更浓，旋转更快
 * Lv.3: 弹体发红光，命中产生冲击波环 + 碎片
 * Lv.4: 双层弹体（内红外灰），烟尾更粗，爆炸碎片更多
 * Lv.5: 巨型弹体 + 猛烈旋转 + 超大爆炸环 + 大量碎片 + 地面灼痕
 */
export class CannonBehavior extends WeaponBehavior {
    public readonly type = WeaponType.CANNON;

    private static readonly BODY_COLORS: Color[] = [
        new Color(150, 150, 160, 255),
        new Color(170, 160, 150, 255),
        new Color(200, 140, 100, 255),
        new Color(220, 120, 60, 255),
        new Color(255, 100, 40, 255),
    ];
    private static readonly TRAIL_COLORS: Color[] = [
        new Color(180, 180, 190, 160),
        new Color(190, 180, 170, 180),
        new Color(210, 170, 130, 200),
        new Color(230, 150, 80, 220),
        new Color(255, 130, 50, 240),
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
        const node = this.createProjectileNode(level, idx);
        parent.addChild(node);
        node.setPosition(spawnPos);

        const bullet = node.addComponent(Bullet);
        bullet.damage = stats.damage;
        bullet.speed = stats.projectileSpeed;
        bullet.explosionRadius = (stats['explosionRadius'] ?? 1.5) as number;
        bullet.setTarget(target);

        // 挂载自转 + 爆炸VFX组件
        const spinner = node.addComponent(CannonSpin);
        spinner.spinSpeed = (stats['spinSpeed'] ?? 15) as number;
        spinner.level = level;
        spinner.parentRef = parent;
        spinner.explosionRadius = bullet.explosionRadius;

        // 发射时枪口闪光 (Lv.2+)
        if (level >= 2) {
            const flashColor = CannonBehavior.BODY_COLORS[idx].clone();
            flashColor.a = 180;
            WeaponVFX.createMuzzleFlash(parent, spawnPos, flashColor, 0.2 + level * 0.06);
        }

        // 弹体入场缩放
        const baseScale = 0.8 + level * 0.1;
        node.setScale(0.3, 0.3, 0.3);
        tween(node)
            .to(0.12, { scale: new Vec3(baseScale, baseScale, baseScale) }, { easing: 'backOut' })
            .start();
    }

    private createProjectileNode(level: number, idx: number): Node {
        const node = new Node('Cannon_Proj');
        node.layer = 1 << 0;

        // 主体长条
        const w = 0.12 + level * 0.03;
        const len = 0.45 + level * 0.1;
        const bodyColor = CannonBehavior.BODY_COLORS[idx];
        WeaponVFX.addBoxMesh(node, w, w, len, WeaponVFX.createUnlitMat(bodyColor));

        // 内发光层 (Lv.3+)
        if (level >= 3) {
            const glowNode = new Node('CannonGlow');
            glowNode.layer = 1 << 0;
            node.addChild(glowNode);
            const glowW = w * 1.6;
            const glowColor = new Color(255, 80, 20, 50 + level * 15);
            WeaponVFX.addBoxMesh(
                glowNode,
                glowW,
                glowW,
                len * 1.1,
                WeaponVFX.createGlowMat(glowColor)
            );
        }

        // 厚烟尾
        const streak = node.addComponent(MotionStreak);
        streak.fadeTime = 0.25 + level * 0.06;
        streak.minSeg = 1;
        streak.stroke = 0.2 + level * 0.06;
        streak.color = CannonBehavior.TRAIL_COLORS[idx];
        streak.fastMode = true;

        return node;
    }
}

/**
 * 自转 + 命中爆炸VFX
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

        // 检测弹体即将消失（命中） → 产生爆炸VFX
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

        // 冲击波环
        const ringColor = new Color(255, 150, 50, 200);
        WeaponVFX.createShockRing(this.parentRef, pos, this.explosionRadius, ringColor, 0.4);

        // 碎片
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

        // 地面灼痕 (Lv.4+)
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
