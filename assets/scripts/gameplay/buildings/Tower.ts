import { _decorator, Node, Vec3, Color, MeshRenderer, primitives, utils, Material, Component, tween, Tween, MotionStreak, Texture2D, resources } from 'cc';
import { Building } from './Building';
import { WaveManager } from '../../core/managers/WaveManager';
import { Bullet } from '../combat/Bullet';
import { Unit } from '../units/Unit';

const { ccclass, property } = _decorator;

/**
 * 防御塔
 * 自动攻击范围内的敌人
 */
@ccclass('Tower')
export class Tower extends Building {
    @property
    public attackRange: number = 8;

    @property
    public attackDamage: number = 20;

    @property
    public attackInterval: number = 1.0;

    @property
    public projectileSpeed: number = 15;

    // === Special Abilities ===
    @property
    public bulletColor: Color = new Color(255, 50, 50, 255); // Default Red
    @property
    public bulletSlowPercent: number = 0;
    @property
    public bulletExplosionRadius: number = 0;
    @property
    public bulletSlowDuration: number = 0;

    private _attackTimer: number = 0;
    private _target: Node | null = null;
    
    // Cache material for bullet? Maybe separate factory.

    protected update(dt: number): void {
        super.update(dt); // Handles HP?

        if (!this.isAlive) return;

        this._attackTimer += dt;

        // Ensure current target is valid
        if (this._target) {
            if (!this._target.isValid) {
                this._target = null;
            } else {
                // Check range
                const dist = this.getDistance(this._target);
                if (dist > this.attackRange) {
                    this._target = null;
                } else {
                    // Check if alive
                     const unit = this._target.getComponent(Unit);
                     if (unit && !unit.isAlive) {
                         this._target = null;
                     }
                }
            }
        }

        // Search new target if needed
        if (!this._target) {
            this._target = this.findNearestEnemy();
            if (this._target) {
                console.log(`[Tower] Found target: ${this._target.name}, dist: ${this.getDistance(this._target)}`);
            }
        }

        // Attack
        if (this._target && this._attackTimer >= this.attackInterval) {
            this._attackTimer = 0;
            this.shoot(this._target);
        }
    }

    private findNearestEnemy(): Node | null {
        const enemies = WaveManager.instance.enemies;
        let nearest: Node | null = null;
        let minMsg = this.attackRange * this.attackRange; // Sqr Dist checking

        const myPos = this.node.position;

        for (const enemy of enemies) {
            if (!enemy.isValid) continue;
            const unit = enemy.getComponent(Unit);
            if (!unit || !unit.isAlive) continue;

            const dx = enemy.position.x - myPos.x;
            const dz = enemy.position.z - myPos.z;
            const distSqr = dx * dx + dz * dz;

            if (distSqr < minMsg) {
                minMsg = distSqr;
                nearest = enemy;
            }
        }
        return nearest;
    }

    private _bulletTexture: Texture2D | null = null;

    protected start(): void {
        // super.start(); // BaseComponent likely doesn't have start, safer to omit unless confirmed
        
        // Load Bullet Texture for Motion Streak
        resources.load('textures/glow', Texture2D, (err, texture) => {
            if (err) {
                console.warn('[Tower] Failed to load glow texture (ignore if using primitive):', err);
                return;
            }
            this._bulletTexture = texture;
            console.log('[Tower] Glow texture loaded successfully');
        });
    }

    private shoot(target: Node): void {
        console.log(`[Tower] Shooting at ${target.name}`);
        
        // Attack Animation (Squash and Stretch)
        const initialScale = new Vec3(0.4, 0.8, 0.4);
        Tween.stopAllByTarget(this.node);
        this.node.setScale(initialScale); 
        
        tween(this.node)
            .to(0.05, { scale: new Vec3(0.5, 0.6, 0.5) }, { easing: 'elasticIn' }) 
            .to(0.2, { scale: initialScale }, { easing: 'backOut' }) 
            .start();

        // Create Bullet
        const bulletNode = new Node('Bullet');
        
        // Add to parent (Buildings container)
        if (this.node.parent) {
             this.node.parent.addChild(bulletNode);
        } else {
             this.node.addChild(bulletNode);
        }

        bulletNode.setPosition(this.node.position.x, 1.5, this.node.position.z);
        // console.log(`[Tower] Spawned bullet at ${bulletNode.position}`);
        
        // 1. Visuals: Glowing Sphere
        const renderer = bulletNode.addComponent(MeshRenderer);
        renderer.mesh = utils.MeshUtils.createMesh(
            primitives.box({ width: 0.2, height: 0.2, length: 0.2 }) // Smaller Cube
        );
        const material = new Material();
        material.initialize({ effectName: 'builtin-unlit' });
        // Use custom color
        material.setProperty('mainColor', this.bulletColor); 
        renderer.material = material;

        // 2. Trail: Motion Streak
        if (this._bulletTexture) {
            const streak = bulletNode.addComponent(MotionStreak);
            streak.fadeTime = 0.5;      
            streak.minSeg = 1;          
            streak.stroke = 0.6;        
            streak.color = this.bulletColor; // Match bullet color
            streak.texture = this._bulletTexture;
            streak.fastMode = true;
        } else {
             console.warn('[Tower] No texture for trail, skipping streak');
        }

        // Logic
        const bullet = bulletNode.addComponent(Bullet);
        bullet.damage = this.attackDamage;
        bullet.speed = this.projectileSpeed;
        
        // Special Stats
        bullet.slowPercent = this.bulletSlowPercent;
        bullet.explosionRadius = this.bulletExplosionRadius;
        bullet.slowDuration = this.bulletSlowDuration;

        bullet.setTarget(target);
    }
    
    private getDistance(target: Node): number {
        const dx = target.position.x - this.node.position.x;
        const dz = target.position.z - this.node.position.z;
        return Math.sqrt(dx * dx + dz * dz);
    }
}
