import { Node, Vec3, Color } from 'cc';
import { WeaponBehavior } from '../WeaponBehavior';
import { WeaponType, WeaponLevelStats } from '../WeaponTypes';
import { WeaponVFX } from '../WeaponVFX';
import { GameConfig } from '../../../data/GameConfig';
import { Unit, UnitType } from '../../units/Unit';
import { EnemyQuery } from '../../../core/managers/EnemyQuery';

/** 堆肥喷火器 — 纯代码持续火束版 */
export class FlamethrowerBehavior extends WeaponBehavior {
    public readonly type = WeaponType.FLAMETHROWER;

    private static readonly MAX_TARGETS = [2, 3, 4, 5, 6];
    private static readonly CORE_COLORS: Color[] = [
        new Color(255, 215, 95, 232),
        new Color(255, 222, 105, 236),
        new Color(255, 228, 116, 240),
        new Color(255, 235, 130, 244),
        new Color(255, 240, 145, 248),
    ];
    private static readonly GLOW_COLORS: Color[] = [
        new Color(255, 118, 26, 168),
        new Color(255, 128, 30, 178),
        new Color(255, 138, 34, 188),
        new Color(255, 148, 42, 198),
        new Color(255, 160, 54, 210),
    ];
    private static readonly FLASH_COLORS: Color[] = [
        new Color(255, 195, 82, 220),
        new Color(255, 204, 90, 224),
        new Color(255, 212, 100, 228),
        new Color(255, 220, 110, 232),
        new Color(255, 228, 124, 236),
    ];

    public fire(
        owner: Node,
        target: Node,
        stats: WeaponLevelStats,
        level: number,
        parent: Node
    ): void {
        if (!target || !target.isValid) return;

        WeaponVFX.initialize();

        const spawnPos = owner.position.clone();
        spawnPos.y += GameConfig.PHYSICS.PROJECTILE_SPAWN_OFFSET_Y - 0.1;

        const dx = target.position.x - spawnPos.x;
        const dz = target.position.z - spawnPos.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len < 0.001) return;

        const dirX = dx / len;
        const dirZ = dz / len;
        const idx = Math.min(level - 1, 4);
        const range = Math.max(1.6, stats.range);
        const streamLength = Math.max(1.6, Math.min(range, len + 0.95));
        const streamWidth = 0.46 + level * 0.08;
        const streamDuration = Math.max(0.2, stats.attackInterval * 1.4);
        const streamEnd = new Vec3(
            spawnPos.x + dirX * streamLength,
            spawnPos.y,
            spawnPos.z + dirZ * streamLength
        );

        WeaponVFX.createCodeBeam(parent, spawnPos, streamEnd, {
            width: streamWidth,
            duration: streamDuration,
            beamColor: FlamethrowerBehavior.GLOW_COLORS[idx],
            coreColor: FlamethrowerBehavior.CORE_COLORS[idx],
            intensity: 1.15 + level * 0.2,
        });
        WeaponVFX.createMuzzleFlash(
            parent,
            spawnPos,
            FlamethrowerBehavior.FLASH_COLORS[idx],
            0.15 + level * 0.025
        );
        if (Math.random() < 0.35) {
            WeaponVFX.createGroundBurn(
                parent,
                streamEnd,
                0.12 + level * 0.02,
                FlamethrowerBehavior.GLOW_COLORS[idx],
                0.18
            );
        }

        const hitRadiusAtEnd = 0.56 + level * 0.12;
        const hits = this.collectConeHits(spawnPos, dirX, dirZ, streamLength, hitRadiusAtEnd);
        if (hits.length === 0) return;

        const ownerUnit = owner.getComponent(Unit);
        const critRate = ownerUnit ? ownerUnit.stats.critRate : 0;
        const critDamage = ownerUnit ? ownerUnit.stats.critDamage : 1.5;
        const targetCap = FlamethrowerBehavior.MAX_TARGETS[idx];
        const hitCount = Math.min(targetCap, hits.length);

        for (let i = 0; i < hitCount; i++) {
            const hit = hits[i];
            const distanceT = hit.dist / streamLength;
            const nearBonus = 1 - distanceT * 0.35;
            let damage = Math.max(1, Math.floor(stats.damage * nearBonus));
            let isCrit = false;
            if (critRate > 0 && Math.random() < critRate) {
                damage = Math.floor(damage * critDamage);
                isCrit = true;
            }

            hit.unit.takeDamage(damage, undefined, isCrit);
            hit.unit.applyKnockback(dirX, dirZ, 0.9 + level * 0.25, 0.05);
        }
    }

    private collectConeHits(
        origin: Vec3,
        dirX: number,
        dirZ: number,
        maxDist: number,
        maxRadius: number
    ): Array<{ unit: Unit; dist: number }> {
        const hits: Array<{ unit: Unit; dist: number }> = [];
        const enemies = EnemyQuery.getEnemies();
        const baseRadius = 0.18;

        for (const enemy of enemies) {
            if (!enemy || !enemy.isValid) continue;
            const unit = enemy.getComponent(Unit);
            if (!unit || !unit.isAlive || unit.unitType !== UnitType.ENEMY) continue;

            const ex = enemy.position.x - origin.x;
            const ez = enemy.position.z - origin.z;
            const distOnAxis = ex * dirX + ez * dirZ;
            if (distOnAxis < 0 || distOnAxis > maxDist) continue;

            // 2D 叉积长度 = 到火束中心线的垂距
            const perpDist = Math.abs(ex * dirZ - ez * dirX);
            const radiusAtDist = baseRadius + (distOnAxis / maxDist) * maxRadius;
            if (perpDist > radiusAtDist) continue;

            hits.push({ unit, dist: distOnAxis });
        }

        hits.sort((a, b) => a.dist - b.dist);
        return hits;
    }
}
