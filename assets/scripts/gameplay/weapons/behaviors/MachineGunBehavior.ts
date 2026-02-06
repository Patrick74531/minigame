import { Node, Color, MeshRenderer, primitives, utils, Material, MotionStreak } from 'cc';
import { WeaponBehavior } from '../WeaponBehavior';
import { WeaponType, WeaponLevelStats } from '../WeaponTypes';
import { Bullet } from '../../combat/Bullet';
import { GameConfig } from '../../../data/GameConfig';

/**
 * 寡妇制造者 — 炽热曳光机枪
 * 高射速直线弹幕，每发带有随机角度偏移，
 * 橙色拖尾从亮白渐变到透明。
 *
 * 升级效果：射速↑、伤害↑、偏移角度扩大（更狂暴）
 */
export class MachineGunBehavior extends WeaponBehavior {
    public readonly type = WeaponType.MACHINE_GUN;

    public fire(
        owner: Node,
        target: Node,
        stats: WeaponLevelStats,
        level: number,
        parent: Node
    ): void {
        const spawnPos = owner.position.clone();
        spawnPos.y += GameConfig.PHYSICS.PROJECTILE_SPAWN_OFFSET_Y;

        // 随机角度偏移 (度 → 弧度)
        const spread = (stats['spread'] ?? 3) as number;
        const angleOffset = ((Math.random() - 0.5) * spread * Math.PI) / 180;

        const node = this.createBulletNode(level);
        parent.addChild(node);
        node.setPosition(spawnPos);

        const bullet = node.addComponent(Bullet);
        bullet.damage = stats.damage;
        bullet.speed = stats.projectileSpeed;

        // 设定目标后施加角度偏移
        bullet.setTarget(target);

        // 在速度向量上旋转 angleOffset
        const vel = bullet.velocity;
        const cos = Math.cos(angleOffset);
        const sin = Math.sin(angleOffset);
        const x = vel.x * cos - vel.z * sin;
        const z = vel.x * sin + vel.z * cos;
        vel.set(x, vel.y, z);
    }

    private createBulletNode(level: number): Node {
        const node = new Node('MG_Bullet');
        node.layer = 1 << 0;

        // 小型发光矩形
        const renderer = node.addComponent(MeshRenderer);
        const size = 0.1 + level * 0.02;
        renderer.mesh = utils.MeshUtils.createMesh(
            primitives.box({ width: size, height: size, length: size * 2 })
        );
        const mat = new Material();
        mat.initialize({ effectName: 'builtin-unlit' });
        mat.setProperty('mainColor', new Color(255, 100, 0, 255));
        renderer.material = mat;

        // 拖尾
        const streak = node.addComponent(MotionStreak);
        streak.fadeTime = 0.12 + level * 0.02;
        streak.minSeg = 1;
        streak.stroke = 0.15 + level * 0.03;
        streak.color = new Color(255, 69, 0, 255); // OrangeRed
        streak.fastMode = true;

        return node;
    }
}
