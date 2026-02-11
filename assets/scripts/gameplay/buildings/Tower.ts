import {
    _decorator,
    Node,
    Vec3,
    Color,
    MeshRenderer,
    primitives,
    utils,
    Material,
    tween,
    Tween,
} from 'cc';
import { Building } from './Building';
import { Bullet } from '../combat/Bullet';
import { Unit } from '../units/Unit';
import { EnemyQuery } from '../../core/managers/EnemyQuery';
import { EventManager } from '../../core/managers/EventManager';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import { GameEvents } from '../../data/GameEvents';
import { EffectFactory } from '../effects/EffectFactory';
import { WeaponVFX } from '../weapons/WeaponVFX';

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

    @property
    public chainCount: number = 0;
    @property
    public chainRange: number = 0;

    /** Frost-only mode: skip projectile and cast rain AOE directly on target */
    @property
    public castRainDirectly: boolean = false;
    /** Frost rain radius growth per level (multiplicative): radius * (1 + (level-1)*k) */
    @property
    public rainRadiusPerLevel: number = 0.22;

    @property
    public useLaserVisual: boolean = false;

    public attackMultiplier: number = 1.2;
    public rangeMultiplier: number = 1.03;
    public intervalMultiplier: number = 0.95;
    public chainRangePerLevel: number = 0;

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
        }

        // Attack
        if (this._target && this._attackTimer >= this.attackInterval) {
            this._attackTimer = 0;
            this.shoot(this._target);
        }
    }

    private findNearestEnemy(): Node | null {
        const enemies = EnemyQuery.getEnemies();
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

    public setTowerUpgradeConfig(config: {
        attackMultiplier?: number;
        rangeMultiplier?: number;
        intervalMultiplier?: number;
        chainRangePerLevel?: number;
    }): void {
        if (config.attackMultiplier !== undefined) this.attackMultiplier = config.attackMultiplier;
        if (config.rangeMultiplier !== undefined) this.rangeMultiplier = config.rangeMultiplier;
        if (config.intervalMultiplier !== undefined)
            this.intervalMultiplier = config.intervalMultiplier;
        if (config.chainRangePerLevel !== undefined)
            this.chainRangePerLevel = config.chainRangePerLevel;
    }

    public upgrade(): boolean {
        const upgraded = super.upgrade();
        if (!upgraded) return false;

        this.attackDamage = Math.floor(this.attackDamage * this.attackMultiplier);
        this.attackRange *= this.rangeMultiplier;
        this.attackInterval = Math.max(0.2, this.attackInterval * this.intervalMultiplier);
        if (this.chainRangePerLevel > 0) {
            this.chainRange += this.chainRangePerLevel;
        }

        return true;
    }

    private shoot(target: Node): void {
        // Attack Animation (Squash and Stretch)
        const initialScale = this.node.scale.clone();
        const squashScale = new Vec3(
            initialScale.x * 1.15,
            initialScale.y * 0.82,
            initialScale.z * 1.15
        );
        Tween.stopAllByTarget(this.node);
        this.node.setScale(initialScale);

        tween(this.node)
            .to(0.05, { scale: squashScale }, { easing: 'elasticIn' })
            .to(0.2, { scale: initialScale }, { easing: 'backOut' })
            .start();

        if (this.castRainDirectly && this.bulletExplosionRadius > 0 && this.bulletSlowPercent > 0) {
            const rainRadius = this.getCurrentRainRadius();
            this.playFrostCastSpray(rainRadius);
            this.emitFrostRainAoE(target, rainRadius);
            return;
        }

        // Create Bullet
        let bulletNode: Node | null = null;
        
        if (this.useLaserVisual) {
             bulletNode = WeaponVFX.createLaserBolt(0.3); // Shortened length (Half of 0.6)
             if (!bulletNode) {
                 bulletNode = new Node('Bullet'); // Fallback
             } else {
                 bulletNode.name = 'LaserBullet';
             }
        } else {
            bulletNode = new Node('Bullet');
        }

        // Add to parent (Buildings container)
        if (this.node.parent) {
            this.node.parent.addChild(bulletNode);
        } else {
            this.node.addChild(bulletNode);
        }

        bulletNode.setPosition(this.node.position.x, 1.5, this.node.position.z);
        // console.log(`[Tower] Spawned bullet at ${bulletNode.position}`);

        // 1. Visuals
        if (!this.useLaserVisual) {
            // Standard Glowing Sphere for non-laser towers
            const renderer = bulletNode.addComponent(MeshRenderer);
            renderer.mesh = utils.MeshUtils.createMesh(
                primitives.box({ width: 0.2, height: 0.2, length: 0.2 }) // Smaller Cube
            );
            const material = new Material();
            material.initialize({ effectName: 'builtin-unlit' });
            // Use custom color
            material.setProperty('mainColor', this.bulletColor);
            renderer.material = material;
        } else {
            // For laser, Bullet.ts expects us to handle orientation, but LaserBolt has its own axis.
            // WeaponVFX.createLaserBolt returns a node where Z is length. 
            // Bullet.ts attempts to lookAt target. 
            // If we want the bolt to fly like a projectile, we need to ensure Bullet.ts rotates it correctly.
            // The laser bolt prefab (skill8/juan) likely faces Z or has a specific rotation.
            // In WeaponVFX._stripLaserBolt, 'juan' is used.
            // In Bullet.ts: this.node.lookAt(lookAtPos);
            // This aligns -Z (cocos default forward) to target? No, lookAt aligns Forward (-Z) to target usually.
            // We need to check if 'juan' aligns with -Z.
        }

        // Logic
        const bullet = bulletNode.getComponent(Bullet) ?? bulletNode.addComponent(Bullet);
        // If it was a laser bolt from pool, it might already have Bullet? Unlikely from WeaponVFX factory.
        // Actually WeaponVFX just returns a visual node. We attach Bullet logic here.
        
        // For Laser Visual, we might need to tell Bullet to orient specifically if the model is rotated.
        if (this.useLaserVisual) {
            // Bullet.ts usually looks at target (-Z forward). 
            // If our mesh (juan) is elongated along Z, we probably want it to face target.
            // If juan is Z-aligned, lookAt works if we want it to fly "lengthwise".
        }
        bullet.damage = this.attackDamage;
        bullet.speed = this.projectileSpeed;

        // Special Stats
        bullet.slowPercent = this.bulletSlowPercent;
        bullet.explosionRadius = this.bulletExplosionRadius;
        bullet.slowDuration = this.bulletSlowDuration;

        // Chain Lightning
        bullet.chainCount = this.chainCount;
        bullet.chainRange = this.chainRange;

        bullet.setTarget(target);
    }

    private emitFrostRainAoE(target: Node, radiusOverride?: number): void {
        if (!target || !target.isValid) return;

        const center = target.position.clone();
        const radius = radiusOverride ?? this.getCurrentRainRadius();

        this.eventManager.emit(GameEvents.APPLY_AOE_EFFECT, {
            center,
            radius,
            damage: this.attackDamage,
            slowPercent: this.bulletSlowPercent,
            slowDuration: this.bulletSlowDuration,
            effectType: 'frost_rain',
        });
    }

    private getCurrentRainRadius(): number {
        const levelBonus = Math.max(0, this.level - 1);
        const radiusMultiplier = 1 + levelBonus * Math.max(0, this.rainRadiusPerLevel);
        return Math.max(0.8, this.bulletExplosionRadius * radiusMultiplier);
    }

    private playFrostCastSpray(rainRadius: number): void {
        if (!this.node.parent) return;
        const sprayPos = this.node.worldPosition.clone();
        sprayPos.y += Math.max(0.9, this.node.scale.y * 0.9);
        EffectFactory.createFrostCastSpray(this.node.parent, sprayPos, rainRadius);
    }

    private getDistance(target: Node): number {
        const dx = target.position.x - this.node.position.x;
        const dz = target.position.z - this.node.position.z;
        return Math.sqrt(dx * dx + dz * dz);
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }
}
