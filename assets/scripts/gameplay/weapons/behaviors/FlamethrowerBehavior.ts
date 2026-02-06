import { Node, Vec3, Color, MeshRenderer, primitives, utils, Material } from 'cc';
import { WeaponBehavior } from '../WeaponBehavior';
import { WeaponType, WeaponLevelStats } from '../WeaponTypes';
import { Bullet } from '../../combat/Bullet';
import { GameConfig } from '../../../data/GameConfig';

/**
 * 堆肥喷火器 — 废油抛物线
 * 黑色粘稠液体受重力影响画抛物线，
 * 命中后造成伤害。
 *
 * 升级效果：伤害↑、射程↑、重力降低（飞更远）
 */
export class FlamethrowerBehavior extends WeaponBehavior {
    public readonly type = WeaponType.FLAMETHROWER;

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
        bullet.setTarget(target);

        // 给弹体施加向上的初速度模拟抛物线
        bullet.velocity.y += 4 + level * 0.5;

        // 挂载重力脚本
        const gravity = (stats['gravity'] ?? 8) as number;
        const gravComp = node.addComponent(FlameGravity);
        gravComp.gravity = gravity;
    }

    private createProjectileNode(level: number): Node {
        const node = new Node('Flame_Proj');
        node.layer = 1 << 0;

        const renderer = node.addComponent(MeshRenderer);
        const size = 0.2 + level * 0.03;
        renderer.mesh = utils.MeshUtils.createMesh(
            primitives.box({ width: size, height: size, length: size })
        );
        const mat = new Material();
        mat.initialize({ effectName: 'builtin-unlit' });
        // 深红/黑色 — 废机油
        const r = Math.min(255, 60 + level * 30);
        mat.setProperty('mainColor', new Color(r, 10, 0, 255));
        renderer.material = mat;

        return node;
    }
}

import { _decorator, Component } from 'cc';
const { ccclass } = _decorator;

/**
 * 简易重力组件：每帧向下加速
 */
@ccclass('FlameGravity')
class FlameGravity extends Component {
    public gravity: number = 8;

    protected update(dt: number): void {
        // 直接操作 Bullet._velocity
        const bullet = this.node.getComponent(Bullet);
        if (!bullet) return;
        bullet.velocity.y -= this.gravity * dt;
    }
}
