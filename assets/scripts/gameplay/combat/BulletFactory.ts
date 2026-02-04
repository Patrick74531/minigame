import {
    _decorator,
    Node,
    Prefab,
    instantiate,
    Vec3,
    Color,
    MeshRenderer,
    primitives,
    utils,
    Material,
    Texture2D,
    resources,
    MotionStreak,
} from 'cc';
import { Bullet } from './Bullet';
import { PoolManager } from '../../core/managers/PoolManager';

const { ccclass, property } = _decorator;

@ccclass('BulletFactory')
export class BulletFactory {
    private static _bulletPrefab: Prefab | null = null;
    private static _fallbackTexture: Texture2D | null = null;

    public static initialize(): void {
        // Preload resources if needed
        resources.load('textures/glow', Texture2D, (err, texture) => {
            if (!err) {
                this._fallbackTexture = texture;
            }
        });
    }

    /**
     * Create or retrieve a bullet from the pool
     */
    public static createBullet(parent: Node, position: Vec3, target: Node, stats: any): Node {
        // Use PoolManager "Bullet" pool
        // Note: We might need to register the pool first.
        // For MVP, if PoolManager doesn't have it, we can just instantiate manually or register lazy.
        // Let's assume we use a simple "Bullet" pool name.

        let node = PoolManager.instance.spawn('Bullet', parent);
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

        const streak = node.getComponent(MotionStreak);
        if (streak) {
            streak.color = stats.color || Color.YELLOW;
            if (this._fallbackTexture && !streak.texture) {
                streak.texture = this._fallbackTexture;
            }
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

        bullet.setTarget(target);

        return node;
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

        // Trail
        const streak = node.addComponent(MotionStreak);
        streak.fadeTime = 0.3;
        streak.minSeg = 1;
        streak.stroke = 0.3;
        streak.fastMode = true;

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
