import {
    _decorator,
    Node,
    Prefab,
    Vec3,
    Color,
    MeshRenderer,
    primitives,
    utils,
    Material,
} from 'cc';
import { Bullet } from './Bullet';
import { PoolManager } from '../../core/managers/PoolManager';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';

const { ccclass } = _decorator;

@ccclass('BulletFactory')
export class BulletFactory {
    private static _bulletPrefab: Prefab | null = null;

    public static initialize(): void {
        // Reserved for future runtime preloads.
    }

    /**
     * Create or retrieve a bullet from the pool
     */
    public static createBullet(parent: Node, position: Vec3, target: Node, stats: any): Node {
        // Use PoolManager "Bullet" pool
        // Note: We might need to register the pool first.
        // For MVP, if PoolManager doesn't have it, we can just instantiate manually or register lazy.
        // Let's assume we use a simple "Bullet" pool name.

        let node = BulletFactory.poolManager.spawn('Bullet', parent);
        if (!node) {
            // Pool not ready or empty auto-spawn logic failing?
            // Let's create a fresh node manually if pool returns null (meaning pool not registered yet)
            // Ideally we register the pool in GameManager or here lazily.
            node = this.createBulletNode();
            node.parent = parent; // FIX: Ensure detached node is added to scene
        }

        node.setPosition(position);
        node.active = true;

        // Setup Visuals (Color)
        const renderer = node.getComponent(MeshRenderer);
        if (renderer && renderer.material) {
            renderer.material.setProperty('mainColor', stats.color || Color.YELLOW);
        }

        // Setup Logic
        let bullet = node.getComponent(Bullet);
        if (!bullet) {
            bullet = node.addComponent(Bullet);
        }

        bullet.speed = stats.speed || 15;
        bullet.damage = stats.damage || 10;

        // Extended Stats
        bullet.explosionRadius = stats.explosionRadius || 0;
        bullet.slowPercent = stats.slowPercent || 0;
        bullet.slowDuration = stats.slowDuration || 0;
        bullet.chainCount = stats.chainCount || 0;
        bullet.chainRange = stats.chainRange || 0;
        bullet.critRate = stats.critRate || 0;
        bullet.critDamage = stats.critDamage || 1.5;

        bullet.setTarget(target);

        return node;
    }

    private static get poolManager(): PoolManager {
        return ServiceRegistry.get<PoolManager>('PoolManager') ?? PoolManager.instance;
    }

    /**
     * Create a standardized bullet node (if not using prefab)
     */
    private static createBulletNode(): Node {
        const node = new Node('Bullet');

        // Visuals
        const renderer = node.addComponent(MeshRenderer);
        renderer.mesh = utils.MeshUtils.createMesh(
            primitives.box({ width: 0.3, height: 0.3, length: 0.3 })
        );
        const material = new Material();
        material.initialize({ effectName: 'builtin-unlit' });
        renderer.material = material;

        // Logic
        node.addComponent(Bullet);

        // Physics logic is inside Bullet.initialize() which is called by addComponent

        // We can manually register this pool if we want to recycle these specific nodes
        // But for now, let's just return the node.
        // To use PoolManager properly, we should register a Prefab.
        // Since we are creating code-based nodes, we can just implement IPoolable on Bullet and handle reset.

        return node;
    }
}
