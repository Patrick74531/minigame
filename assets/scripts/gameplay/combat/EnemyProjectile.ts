import {
    _decorator,
    BoxCollider,
    CapsuleCollider,
    Color,
    Component,
    ImageAsset,
    MeshRenderer,
    Node,
    Texture2D,
    Vec3,
    resources,
} from 'cc';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import { GameManager } from '../../core/managers/GameManager';
import { Building } from '../buildings/Building';
import { Enemy } from '../units/Enemy';
import { Unit, UnitType } from '../units/Unit';
import { WeaponVFX } from '../weapons/WeaponVFX';
import { ProjectileBlocker } from './ProjectileBlocker';
import { HeroQuery } from '../../core/runtime/HeroQuery';

const { ccclass, property } = _decorator;

export type EnemyProjectileVisualStyle =
    | 'default'
    | 'tank_shell_round'
    | 'turret_cannon_round'
    | 'legs_gun_plasma_round'
    | 'flying_ship_interceptor_bolt'
    | 'flying_ship_raider_bolt'
    | 'flying_ship_heavy_bolt'
    | 'boss_flying_apex_core';

interface EnemyProjectileVisualProfile {
    texturePath?: string;
    width: number;
    length: number;
    tint: Color;
}

type EnemyProjectileHitResult = {
    target: Unit | Building;
    t: number;
};

@ccclass('EnemyProjectile')
export class EnemyProjectile extends Component {
    private static readonly PROJECTILE_SIZE_SCALE = 1.5;
    @property
    public speed: number = 10;

    @property
    public damage: number = 8;

    @property
    public maxLifetime: number = 2.5;

    @property
    public hitRadius: number = 0.45;

    private _velocity: Vec3 = new Vec3();
    private _lifetime: number = 0;
    private _owner: Enemy | null = null;
    private _gameManagerRef: GameManager | null = null;
    private _visualStyle: EnemyProjectileVisualStyle = 'default';

    private static readonly _tmpStart = new Vec3();
    private static readonly _tmpEnd = new Vec3();
    private static readonly _tmpLookAt = new Vec3();
    private static readonly _textureCache = new Map<EnemyProjectileVisualStyle, Texture2D | null>();
    private static readonly _textureLoading = new Set<EnemyProjectileVisualStyle>();
    private static readonly _textureWaiters = new Map<
        EnemyProjectileVisualStyle,
        Array<(texture: Texture2D | null) => void>
    >();
    private static readonly VISUAL_PROFILES: Record<
        EnemyProjectileVisualStyle,
        EnemyProjectileVisualProfile
    > = {
        default: {
            width: 0.2 * EnemyProjectile.PROJECTILE_SIZE_SCALE,
            length: 0.2 * EnemyProjectile.PROJECTILE_SIZE_SCALE,
            tint: new Color(255, 120, 90, 255),
        },
        tank_shell_round: {
            texturePath: 'enemies/bullet/tank_shell_round',
            width: 0.22 * EnemyProjectile.PROJECTILE_SIZE_SCALE,
            length: 0.56 * EnemyProjectile.PROJECTILE_SIZE_SCALE,
            tint: Color.WHITE.clone(),
        },
        turret_cannon_round: {
            texturePath: 'enemies/bullet/turret_cannon_round',
            width: 0.2 * EnemyProjectile.PROJECTILE_SIZE_SCALE,
            length: 0.52 * EnemyProjectile.PROJECTILE_SIZE_SCALE,
            tint: Color.WHITE.clone(),
        },
        legs_gun_plasma_round: {
            texturePath: 'enemies/bullet/legs_gun_plasma_round',
            width: 0.24 * EnemyProjectile.PROJECTILE_SIZE_SCALE,
            length: 0.6 * EnemyProjectile.PROJECTILE_SIZE_SCALE,
            tint: Color.WHITE.clone(),
        },
        flying_ship_interceptor_bolt: {
            texturePath: 'enemies/bullet/flying_ship_interceptor_bolt',
            width: 0.18 * EnemyProjectile.PROJECTILE_SIZE_SCALE,
            length: 0.48 * EnemyProjectile.PROJECTILE_SIZE_SCALE,
            tint: Color.WHITE.clone(),
        },
        flying_ship_raider_bolt: {
            texturePath: 'enemies/bullet/flying_ship_raider_bolt',
            width: 0.18 * EnemyProjectile.PROJECTILE_SIZE_SCALE,
            length: 0.5 * EnemyProjectile.PROJECTILE_SIZE_SCALE,
            tint: Color.WHITE.clone(),
        },
        flying_ship_heavy_bolt: {
            texturePath: 'enemies/bullet/flying_ship_heavy_bolt',
            width: 0.2 * EnemyProjectile.PROJECTILE_SIZE_SCALE,
            length: 0.54 * EnemyProjectile.PROJECTILE_SIZE_SCALE,
            tint: Color.WHITE.clone(),
        },
        boss_flying_apex_core: {
            texturePath: 'enemies/bullet/boss_flying_apex_core',
            width: 0.3 * EnemyProjectile.PROJECTILE_SIZE_SCALE,
            length: 0.72 * EnemyProjectile.PROJECTILE_SIZE_SCALE,
            tint: Color.WHITE.clone(),
        },
    };

    public static preloadStyle(style: EnemyProjectileVisualStyle): void {
        this.ensureStyleTexture(style);
    }

    public setVisualStyle(style: EnemyProjectileVisualStyle): void {
        this._visualStyle = style;
        this.ensureVisual();
    }

    public launch(direction: Vec3, owner: Enemy | null): void {
        this._owner = owner;
        this._lifetime = 0;

        this._velocity.set(direction);
        this._velocity.y = 0;
        const lenSq = this._velocity.lengthSqr();
        if (lenSq <= 0.0001) {
            this.destroySelf();
            return;
        }
        this._velocity.normalize().multiplyScalar(this.speed);
    }

    protected onLoad(): void {
        this.ensureVisual();
    }

    protected onEnable(): void {
        this._lifetime = 0;
    }

    protected update(dt: number): void {
        if (!this.gameManager.isPlaying) return;

        this._lifetime += dt;
        if (this._lifetime >= this.maxLifetime) {
            this.destroySelf();
            return;
        }

        const start = EnemyProjectile._tmpStart;
        start.set(this.node.position);

        const end = EnemyProjectile._tmpEnd;
        end.set(
            start.x + this._velocity.x * dt,
            start.y + this._velocity.y * dt,
            start.z + this._velocity.z * dt
        );
        this.node.setPosition(end);

        if (this._velocity.lengthSqr() > 0.001) {
            const lookAt = EnemyProjectile._tmpLookAt;
            lookAt.set(
                end.x + this._velocity.x,
                end.y + this._velocity.y,
                end.z + this._velocity.z
            );
            this.node.lookAt(lookAt);
        }

        const blockerT = ProjectileBlocker.findClosestHitT(start, end, this.hitRadius);
        const targetHit = this.findFirstHit(start, end);
        if (blockerT >= 0 && (!targetHit || blockerT <= targetHit.t)) {
            this.destroySelf();
            return;
        }
        if (!targetHit) return;

        targetHit.target.takeDamage(this.damage, this._owner ?? undefined);
        this.destroySelf();
    }

    private findFirstHit(start: Vec3, end: Vec3): EnemyProjectileHitResult | null {
        let bestTarget: Unit | Building | null = null;
        let bestT = Number.POSITIVE_INFINITY;

        const heroNode = HeroQuery.getNearestHero(start);
        if (heroNode && heroNode.isValid) {
            const heroUnit = heroNode.getComponent(Unit);
            if (heroUnit && heroUnit.isAlive && heroUnit.unitType === UnitType.HERO) {
                const heroRadius = this.resolveHeroRadius(heroNode) + this.hitRadius;
                const heroT = this.segmentHitT(start, end, heroNode.position, heroRadius);
                if (heroT >= 0 && heroT < bestT) {
                    bestT = heroT;
                    bestTarget = heroUnit;
                }
            }
        }

        const buildings = this.gameManager.activeBuildings;
        for (const buildingNode of buildings) {
            if (!buildingNode || !buildingNode.isValid || !buildingNode.active) continue;

            const building = buildingNode.getComponent(Building);
            if (!building || !building.isAlive) continue;

            const buildingRadius = this.resolveBuildingRadius(buildingNode) + this.hitRadius;
            const t = this.segmentHitT(start, end, buildingNode.position, buildingRadius);
            if (t < 0 || t >= bestT) continue;

            bestT = t;
            bestTarget = building;
        }

        if (!bestTarget) return null;
        return {
            target: bestTarget,
            t: bestT,
        };
    }

    private segmentHitT(start: Vec3, end: Vec3, point: Vec3, radius: number): number {
        const abx = end.x - start.x;
        const abz = end.z - start.z;
        const apx = point.x - start.x;
        const apz = point.z - start.z;
        const abLenSq = abx * abx + abz * abz;
        const rSq = radius * radius;

        if (abLenSq <= 0.000001) {
            const dx = point.x - start.x;
            const dz = point.z - start.z;
            return dx * dx + dz * dz <= rSq ? 0 : -1;
        }

        let t = (apx * abx + apz * abz) / abLenSq;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;

        const cx = start.x + abx * t;
        const cz = start.z + abz * t;
        const dx = point.x - cx;
        const dz = point.z - cz;
        return dx * dx + dz * dz <= rSq ? t : -1;
    }

    private resolveHeroRadius(heroNode: Node): number {
        const capsule = heroNode.getComponent(CapsuleCollider);
        if (!capsule) return 0.45;

        const scale = heroNode.worldScale;
        const scaleXZ = Math.max(Math.abs(scale.x), Math.abs(scale.z));
        return Math.max(0.2, capsule.radius * scaleXZ);
    }

    private resolveBuildingRadius(buildingNode: Node): number {
        const col = buildingNode.getComponent(BoxCollider);
        if (!col) return 0.8;

        const scale = buildingNode.worldScale;
        const width = Math.abs(col.size.x * scale.x);
        const depth = Math.abs(col.size.z * scale.z);
        return Math.max(0.4, Math.max(width, depth) * 0.5);
    }

    private ensureVisual(): void {
        const profile = EnemyProjectile.VISUAL_PROFILES[this._visualStyle];
        const meshRenderer =
            this.node.getComponent(MeshRenderer) ?? this.node.addComponent(MeshRenderer);
        if (!meshRenderer.mesh) {
            meshRenderer.mesh = WeaponVFX.getFlatQuadMesh(1, 1);
        }

        const cachedTexture = EnemyProjectile._textureCache.get(this._visualStyle);
        if (cachedTexture) {
            meshRenderer.setMaterial(WeaponVFX.getSpriteMat(profile.tint, cachedTexture), 0);
        } else {
            meshRenderer.setMaterial(WeaponVFX.getUnlitMat(profile.tint), 0);
            EnemyProjectile.ensureStyleTexture(this._visualStyle, texture => {
                if (!texture || !this.node || !this.node.isValid) return;
                const current = EnemyProjectile.VISUAL_PROFILES[this._visualStyle];
                meshRenderer.setMaterial(WeaponVFX.getSpriteMat(current.tint, texture), 0);
            });
        }

        // Keep projectile axis along +Z so node.lookAt() aligns the texture direction.
        this.node.setScale(profile.width, 1, profile.length);
    }

    private static ensureStyleTexture(
        style: EnemyProjectileVisualStyle,
        onReady?: (texture: Texture2D | null) => void
    ): void {
        if (this._textureCache.has(style)) {
            onReady?.(this._textureCache.get(style) ?? null);
            return;
        }
        if (this._textureLoading.has(style)) {
            if (onReady) {
                const waiters = this._textureWaiters.get(style) ?? [];
                waiters.push(onReady);
                this._textureWaiters.set(style, waiters);
            }
            return;
        }

        const path = this.VISUAL_PROFILES[style]?.texturePath;
        if (!path) {
            this._textureCache.set(style, null);
            onReady?.(null);
            return;
        }

        const waiters = onReady ? [onReady] : [];
        this._textureWaiters.set(style, waiters);
        this._textureLoading.add(style);
        const finish = (texture: Texture2D | null): void => {
            this._textureLoading.delete(style);
            this._textureCache.set(style, texture);
            const callbacks = this._textureWaiters.get(style) ?? [];
            this._textureWaiters.delete(style);
            for (const cb of callbacks) cb(texture);
        };

        resources.load(`${path}/texture`, Texture2D, (err, texture) => {
            if (!err && texture) {
                finish(texture);
                return;
            }
            resources.load(path, Texture2D, (err2, texture2) => {
                if (!err2 && texture2) {
                    finish(texture2);
                    return;
                }
                resources.load(path, ImageAsset, (err3, imageAsset) => {
                    if (err3 || !imageAsset) {
                        finish(null);
                        return;
                    }
                    const textureFromImage = new Texture2D();
                    textureFromImage.image = imageAsset;
                    finish(textureFromImage);
                });
            });
        });
    }

    private destroySelf(): void {
        if (!this.node || !this.node.isValid) return;
        this.node.destroy();
    }

    private get gameManager(): GameManager {
        if (!this._gameManagerRef) {
            this._gameManagerRef =
                ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
        }
        return this._gameManagerRef;
    }
}
