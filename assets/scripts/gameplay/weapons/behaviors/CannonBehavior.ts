import { Node, Color, Vec3, Mat4, PhysicsSystem } from 'cc';
import { WeaponBehavior } from '../WeaponBehavior';
import { WeaponType, WeaponLevelStats } from '../WeaponTypes';
import { WeaponVFX } from '../WeaponVFX';
import { ScreenShake } from '../vfx/ScreenShake';
import { GameConfig } from '../../../data/GameConfig';
import { EventManager } from '../../../core/managers/EventManager';
import { ServiceRegistry } from '../../../core/managers/ServiceRegistry';
import { GameEvents } from '../../../data/GameEvents';
import { Unit, UnitType } from '../../units/Unit';
import { EnemyQuery } from '../../../core/managers/EnemyQuery';

/**
 * 断桩机加农炮（激光稳定版）
 * - 代码模拟激光束（双层束体 + 脉冲）
 * - 贯穿整条路径并对沿线敌人结算伤害
 */
export class CannonBehavior extends WeaponBehavior {
    public readonly type = WeaponType.CANNON;
    private static readonly BEAM_LENGTH_MULTIPLIER = 0.675;
    private static readonly MIN_EXTRA_LENGTH = 1.25;
    private static readonly PHYSICS_ENEMY_MASK = 1 << 3;

    private static readonly COLORS: Color[] = [
        new Color(150, 150, 160, 255),
        new Color(170, 160, 150, 255),
        new Color(200, 140, 100, 255),
        new Color(220, 120, 60, 255),
        new Color(255, 100, 40, 255),
    ];

    public fire(
        owner: Node,
        target: Node,
        stats: WeaponLevelStats,
        level: number,
        _parent: Node
    ): void {
        if (!target || !target.isValid) return;

        const beamCfg = GameConfig.VFX?.CANNON_BEAM;
        const spawnUp =
            beamCfg?.spawnUpOffset ?? Math.max(0.35, GameConfig.PHYSICS.PROJECTILE_SPAWN_OFFSET_Y);
        const spawnForward = beamCfg?.spawnForwardOffset ?? 0.85;

        const ownerPos = owner.position.clone();
        const spawnY = ownerPos.y + spawnUp;
        const targetPos = target.position.clone();
        targetPos.y = spawnY;
        const toX = targetPos.x - ownerPos.x;
        const toZ = targetPos.z - ownerPos.z;
        const toLen = Math.sqrt(toX * toX + toZ * toZ);
        if (toLen < 0.001) return;
        const dirX = toX / toLen;
        const dirZ = toZ / toLen;
        const spawnPos = new Vec3(
            ownerPos.x + dirX * spawnForward,
            spawnY,
            ownerPos.z + dirZ * spawnForward
        );

        const beamMaxLevel = beamCfg?.maxLevel ?? 5;
        const beamT = WeaponVFX.levelT(level, beamMaxLevel);
        const beamColor = WeaponVFX.lerpColor(
            new Color(...(beamCfg?.beamColorStart ?? [116, 82, 255, 232])),
            new Color(...(beamCfg?.beamColorEnd ?? [180, 126, 255, 240])),
            beamT
        );
        const coreColor = WeaponVFX.lerpColor(
            new Color(...(beamCfg?.coreColorStart ?? [205, 232, 255, 246])),
            new Color(...(beamCfg?.coreColorEnd ?? [255, 255, 255, 255])),
            beamT
        );

        const widthBase = beamCfg?.width?.base ?? 0.22;
        const widthPerLevel = beamCfg?.width?.perLevel ?? 0.05;
        const maxWidth = widthBase + beamMaxLevel * widthPerLevel; // 保持满级宽度不变
        const minWidth = Math.max(0.12, widthBase * 0.6); // 压低低级宽度
        const widthT = Math.pow(beamT, 1.45); // 低级更细，接近满级时快速拉满
        const baseWidth = minWidth + (maxWidth - minWidth) * widthT;
        const baseDuration =
            (beamCfg?.duration?.base ?? 0.1) + level * (beamCfg?.duration?.perLevel ?? 0.015);
        const intensityBase = beamCfg?.intensity?.base ?? 2.2;
        const intensityPerLevel = beamCfg?.intensity?.perLevel ?? 0.5;
        const maxIntensity = intensityBase + beamMaxLevel * intensityPerLevel; // 保持满级强度不变
        const minIntensity = Math.max(1.4, intensityBase * 0.75); // 低级收敛亮度与收尾球体积
        const intensityT = Math.pow(beamT, 1.2);
        const baseIntensity = minIntensity + (maxIntensity - minIntensity) * intensityT;

        const baseRange = Math.max(stats.range, toLen);
        const beamLength = Math.max(
            baseRange * CannonBehavior.BEAM_LENGTH_MULTIPLIER,
            baseRange + CannonBehavior.MIN_EXTRA_LENGTH
        );
        const endPos = new Vec3(
            spawnPos.x + dirX * beamLength,
            spawnPos.y,
            spawnPos.z + dirZ * beamLength
        );
        const invOwnerWorld = new Mat4();
        Mat4.invert(invOwnerWorld, owner.worldMatrix);
        const localStart = new Vec3();
        const localEnd = new Vec3();
        Vec3.transformMat4(localStart, spawnPos, invOwnerWorld);
        Vec3.transformMat4(localEnd, endPos, invOwnerWorld);

        WeaponVFX.createDestructionRay(owner, localStart, localEnd, {
            width: baseWidth,
            duration: baseDuration * 1.35,
            beamColor,
            coreColor,
            intensity: baseIntensity * 1.05,
        });

        const explosionRadius = (stats['explosionRadius'] ?? 1.5) as number;
        const beamHitRadius = Math.max(0.28, explosionRadius * 0.55 + baseWidth * 0.45);
        const hits = this.collectPiercingHits(spawnPos, dirX, dirZ, beamLength, beamHitRadius);

        // 从持有者读取暴击属性
        const ownerUnit = owner.getComponent(Unit);
        const critRate = ownerUnit ? ownerUnit.stats.critRate : 0;
        const critDmgMul = ownerUnit ? ownerUnit.stats.critDamage : 1.5;

        for (const hit of hits) {
            let dmg = stats.damage;
            let isCrit = false;
            if (critRate > 0 && Math.random() < critRate) {
                dmg = Math.floor(dmg * critDmgMul);
                isCrit = true;
            }
            hit.unit.takeDamage(dmg, undefined, isCrit);
        }
        if (hits.length === 0) {
            const unit = target.getComponent(Unit);
            if (unit && unit.unitType === UnitType.ENEMY && unit.isAlive) {
                let dmg = stats.damage;
                let isCrit = false;
                if (critRate > 0 && Math.random() < critRate) {
                    dmg = Math.floor(dmg * critDmgMul);
                    isCrit = true;
                }
                unit.takeDamage(dmg, undefined, isCrit);
            }
        }

        const primaryImpact = hits.length > 0 ? hits[hits.length - 1].pos.clone() : endPos.clone();
        primaryImpact.y = spawnPos.y;

        const eventManager =
            ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
        // 只在主冲击点触发一次 AOE，避免穿透时事件风暴。
        if (explosionRadius > 0) {
            eventManager.emit(GameEvents.APPLY_AOE_EFFECT, {
                center: primaryImpact.clone(),
                radius: explosionRadius,
                damage: Math.floor(stats.damage * 0.75),
                slowPercent: 0,
                slowDuration: 0,
            });
        }

        const impactPos = primaryImpact.clone();
        impactPos.y = 0.05;

        if (level >= 3) {
            const shakeIntensity = 0.15 + level * 0.08;
            const shakeDuration = 0.1 + level * 0.03;
            ScreenShake.shake(shakeIntensity, shakeDuration);
        }

        if (level >= 4) {
            // 预留：高等级附加地面反馈
        }
    }

    private collectPiercingHits(
        origin: Vec3,
        dirX: number,
        dirZ: number,
        maxDist: number,
        hitRadius: number
    ): Array<{ unit: Unit; pos: Vec3; dist: number }> {
        const physicsHits = this.collectPiercingHitsByPhysics(
            origin,
            dirX,
            dirZ,
            maxDist,
            hitRadius
        );
        if (physicsHits) {
            return physicsHits;
        }

        return this.collectPiercingHitsByGeometry(origin, dirX, dirZ, maxDist, hitRadius);
    }

    private collectPiercingHitsByPhysics(
        origin: Vec3,
        dirX: number,
        dirZ: number,
        maxDist: number,
        hitRadius: number
    ): Array<{ unit: Unit; pos: Vec3; dist: number }> | null {
        const physics = PhysicsSystem.instance as unknown as {
            lineStripCast?: (
                sampleLine: Vec3[],
                mask: number,
                maxDistance: number,
                queryTrigger: boolean
            ) => boolean;
            lineStripCastResults?: Array<{
                collider?: { node?: Node | null } | null;
                distance?: number;
                hitPoint?: { x: number; y: number; z: number } | Vec3;
            }>;
        };
        if (!physics || typeof physics.lineStripCast !== 'function') return null;

        const end = new Vec3(origin.x + dirX * maxDist, origin.y, origin.z + dirZ * maxDist);
        const rightX = -dirZ;
        const rightZ = dirX;
        const offset = Math.max(0.08, hitRadius * 0.75);
        const lines: Vec3[][] = [
            [origin.clone(), end.clone()],
            [
                new Vec3(origin.x + rightX * offset, origin.y, origin.z + rightZ * offset),
                new Vec3(end.x + rightX * offset, end.y, end.z + rightZ * offset),
            ],
            [
                new Vec3(origin.x - rightX * offset, origin.y, origin.z - rightZ * offset),
                new Vec3(end.x - rightX * offset, end.y, end.z - rightZ * offset),
            ],
        ];

        const hitMap = new Map<string, { unit: Unit; pos: Vec3; dist: number }>();
        let castedAny = false;

        for (const sampleLine of lines) {
            const casted = physics.lineStripCast(
                sampleLine,
                CannonBehavior.PHYSICS_ENEMY_MASK,
                maxDist + 0.2,
                true
            );
            castedAny = castedAny || casted;
            if (!casted) continue;

            const results = physics.lineStripCastResults ?? [];
            for (const result of results) {
                const node = result?.collider?.node as Node | undefined;
                if (!node || !node.isValid) continue;
                const unit = node.getComponent(Unit);
                if (!unit || unit.unitType !== UnitType.ENEMY || !unit.isAlive) continue;

                const dist = typeof result.distance === 'number' ? result.distance : maxDist;
                const hp = result.hitPoint;
                const hitPos = hp
                    ? new Vec3(hp.x, origin.y, hp.z)
                    : new Vec3(origin.x + dirX * dist, origin.y, origin.z + dirZ * dist);

                const key = node.uuid;
                const existing = hitMap.get(key);
                if (!existing || dist < existing.dist) {
                    hitMap.set(key, { unit, pos: hitPos, dist });
                }
            }
        }

        if (!castedAny) return null;
        const hits = Array.from(hitMap.values());
        hits.sort((a, b) => a.dist - b.dist);
        return hits;
    }

    private collectPiercingHitsByGeometry(
        origin: Vec3,
        dirX: number,
        dirZ: number,
        maxDist: number,
        hitRadius: number
    ): Array<{ unit: Unit; pos: Vec3; dist: number }> {
        const radiusSqr = hitRadius * hitRadius;
        const hits: Array<{ unit: Unit; pos: Vec3; dist: number }> = [];

        const enemies = EnemyQuery.getEnemies();
        for (const enemy of enemies) {
            if (!enemy || !enemy.isValid) continue;
            const unit = enemy.getComponent(Unit);
            if (!unit || unit.unitType !== UnitType.ENEMY || !unit.isAlive) continue;

            const ex = enemy.position.x - origin.x;
            const ez = enemy.position.z - origin.z;
            const distOnBeam = ex * dirX + ez * dirZ;
            if (distOnBeam < 0 || distOnBeam > maxDist) continue;

            const distSqr = ex * ex + ez * ez;
            const perpSqr = distSqr - distOnBeam * distOnBeam;
            if (perpSqr > radiusSqr) continue;

            hits.push({
                unit,
                dist: distOnBeam,
                pos: new Vec3(origin.x + dirX * distOnBeam, origin.y, origin.z + dirZ * distOnBeam),
            });
        }

        hits.sort((a, b) => a.dist - b.dist);
        return hits;
    }
}
