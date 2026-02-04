import { _decorator, Node, Color, Vec3 } from 'cc';
import { Weapon } from '../Weapon';
import { BulletFactory } from '../BulletFactory';

const { ccclass, property } = _decorator;

@ccclass('RangedWeapon')
export class RangedWeapon extends Weapon {
    @property
    public projectileSpeed: number = 15;

    @property
    public projectileColor: Color = new Color(255, 255, 0, 255); // Yellow default

    @property
    public chainCount: number = 0;

    @property
    public explosionRadius: number = 0;

    protected onAttack(target: Node): void {
        if (!target) return;

        // Spawn position (e.g. from self position, maybe elevated)
        const spawnPos = this.node.position.clone();
        spawnPos.y += 1.0; // Shoot from chest/head height

        console.log(`[RangedWeapon] Creating bullet at ${spawnPos} targeting ${target.name}`);

        // Use Factory
        BulletFactory.createBullet(this.node.parent!, spawnPos, target, {
            damage: this.damage,
            speed: this.projectileSpeed,
            color: this.projectileColor,
            chainCount: this.chainCount,
            explosionRadius: this.explosionRadius,
            // Pass other stats if needed
        });
    }
}
