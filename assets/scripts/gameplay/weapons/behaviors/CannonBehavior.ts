import { Node, Vec3, Color, MeshRenderer, primitives, utils, Material, MotionStreak, Quat } from 'cc';
import { WeaponBehavior } from '../WeaponBehavior';
import { WeaponType, WeaponLevelStats } from '../WeaponTypes';
import { Bullet } from '../../combat/Bullet';
import { GameConfig } from '../../../data/GameConfig';

/**
 * 断桩机加农炮 — 螺纹钢激波
 * 发射旋转的长条弹体，命中时触发 AOE 爆炸。
 * 灰白色双拖尾模拟螺旋烟雾。
 *
 * 升级效果：伤害↑、爆炸范围↑、自转速度↑
 */
export class CannonBehavior extends WeaponBehavior {
    public readonly type = WeaponType.CANNON;

    public fire(
        owner: Node,
        target: Node,
        stats: WeaponLevelStats,
        level: number,
        parent: Node
    ): void {
        const spawnPos = owner.position.clone();
        spawnPos.y += GameConfig.PHYSICS.PROJECTILE_SPAWN_OFFSET_Y;

        const node = this.createProjectileNode(level);
        parent.addChild(node);
        node.setPosition(spawnPos);

        const bullet = node.addComponent(Bullet);
        bullet.damage = stats.damage;
        bullet.speed = stats.projectileSpeed;
        bullet.explosionRadius = (stats['explosionRadius'] ?? 1.5) as number;
        bullet.setTarget(target);

        // 挂载自转组件
        const spinner = node.addComponent(SpinComponent);
        spinner.spinSpeed = (stats['spinSpeed'] ?? 15) as number;
    }

    private createProjectileNode(level: number): Node {
        const node = new Node('Cannon_Proj');
        node.layer = 1 << 0;

        // 长条形 — 模拟螺纹钢/铆钉
        const renderer = node.addComponent(MeshRenderer);
        const w = 0.12 + level * 0.02;
        const len = 0.5 + level * 0.08;
        renderer.mesh = utils.MeshUtils.createMesh(
            primitives.box({ width: w, height: w, length: len })
        );
        const mat = new Material();
        mat.initialize({ effectName: 'builtin-unlit' });
        mat.setProperty('mainColor', new Color(160, 160, 170, 255));
        renderer.material = mat;

        // 双拖尾（灰白烟雾）
        const streak = node.addComponent(MotionStreak);
        streak.fadeTime = 0.3 + level * 0.05;
        streak.minSeg = 1;
        streak.stroke = 0.25 + level * 0.04;
        streak.color = new Color(200, 200, 210, 180);
        streak.fastMode = true;

        return node;
    }
}

import { _decorator, Component } from 'cc';
const { ccclass } = _decorator;

/**
 * 简易自转组件：沿前进方向高速旋转
 */
@ccclass('SpinComponent')
class SpinComponent extends Component {
    public spinSpeed: number = 15;

    protected update(dt: number): void {
        const rot = this.node.rotation.clone();
        const delta = new Quat();
        Quat.fromAxisAngle(delta, Vec3.FORWARD, this.spinSpeed * dt);
        Quat.multiply(rot, rot, delta);
        this.node.setRotation(rot);
    }
}
